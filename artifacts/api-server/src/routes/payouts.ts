import { Router } from "express";
import { db } from "@workspace/db";
import { payoutsTable, activityTable, settlementsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authorize } from "../middlewares/rbac";
import { notify } from "../services/notify";
import { buildWorkbook, sendWorkbook } from "../services/excelService";

const router = Router();

// Generates a realistic-looking NEFT UTR
function generateUtr(transferMode: string): string {
  const prefix = transferMode === "RTGS" ? "RTGS" : "NEFT";
  const bankCode = "HDFC";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const seq = Math.floor(100000000 + Math.random() * 900000000);
  return `${prefix}${bankCode}${date}${seq}`;
}

router.get("/payouts", async (req, res) => {
  try {
    const { status } = req.query as { status?: string };
    const rows = status
      ? await db.select().from(payoutsTable)
          .where(eq(payoutsTable.status, status as "PENDING_APPROVAL" | "INITIATED" | "UTR_RECORDED" | "SETTLED"))
          .orderBy(payoutsTable.initiatedAt)
      : await db.select().from(payoutsTable).orderBy(payoutsTable.initiatedAt);

    // Fetch onboarding IDs via settlements to derive company IDs
    const settlementIds = [...new Set(rows.map((r) => r.settlementId).filter(Boolean))] as number[];
    const settlementsData = settlementIds.length > 0
      ? await db.select({ id: settlementsTable.id, onboardingId: settlementsTable.onboardingId })
          .from(settlementsTable)
          .where(sql`${settlementsTable.id} = ANY(ARRAY[${sql.join(settlementIds.map((id) => sql`${id}`), sql`, `)}]::int[])`)
      : [];
    const settlementOnboardingMap = new Map(settlementsData.map((s) => [s.id, s.onboardingId]));

    res.json(rows.map((r) => {
      const onboardingId = settlementOnboardingMap.get(r.settlementId);
      return {
        ...mapPayout(r),
        companyId: onboardingId ? `CO-${String(onboardingId).padStart(5, "0")}` : null,
      };
    }));
  } catch (err) {
    req.log.error({ err }, "list payouts error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Bulk initiate — Maker action (PENDING_APPROVAL → INITIATED for multiple payouts)
router.post("/payouts/bulk/initiate", authorize(["maker", "admin"]), async (req, res) => {
  try {
    const { ids, initiatedBy } = req.body as { ids: number[]; initiatedBy?: string };
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids array required" });
    const maker = initiatedBy || "Anjali Patel";

    const results: { id: number; status: "ok" | "skipped"; reason?: string }[] = [];
    for (const payoutId of ids) {
      const [existing] = await db.select().from(payoutsTable).where(eq(payoutsTable.id, payoutId));
      if (!existing || existing.status !== "PENDING_APPROVAL") {
        results.push({ id: payoutId, status: "skipped", reason: existing ? `Status is ${existing.status}` : "Not found" });
        continue;
      }
      const [row] = await db.update(payoutsTable)
        .set({ status: "INITIATED", initiatedBy: maker })
        .where(eq(payoutsTable.id, payoutId))
        .returning();
      await db.insert(activityTable).values({
        user: maker,
        action: `Payout initiated for ${row.brandName} — ${row.cycle} (bulk) — awaiting Checker approval`,
        entityType: "payout",
        entityRef: String(row.id),
        level: "info",
      });
      results.push({ id: payoutId, status: "ok" });
    }
    return res.json({ processed: results.filter((r) => r.status === "ok").length, total: ids.length, results });
  } catch (err) {
    req.log.error({ err }, "bulk initiate payout error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Bulk approve — Checker action (INITIATED → SETTLED with auto UTR for multiple payouts)
router.post("/payouts/bulk/approve", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { ids, approvedBy, payoutNotes } = req.body as { ids: number[]; approvedBy?: string; payoutNotes?: string };
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids array required" });
    const checker = approvedBy || "Rajesh Kumar";
    const now = new Date();

    const results: { id: number; status: "ok" | "skipped"; utr?: string; reason?: string }[] = [];
    for (const payoutId of ids) {
      const [existing] = await db.select().from(payoutsTable).where(eq(payoutsTable.id, payoutId));
      if (!existing || existing.status !== "INITIATED") {
        results.push({ id: payoutId, status: "skipped", reason: existing ? `Status is ${existing.status}` : "Not found" });
        continue;
      }
      const utr = generateUtr(existing.transferMode);
      const [row] = await db.update(payoutsTable)
        .set({ status: "SETTLED", utr, bankAckAt: now, settledAt: now, payoutApprovedBy: checker, payoutApprovedAt: now, payoutNotes: payoutNotes ?? null })
        .where(eq(payoutsTable.id, payoutId))
        .returning();
      await db.insert(activityTable).values({
        user: checker,
        action: `Payout approved for ${row.brandName} — UTR ${utr} · ₹${parseFloat(row.amount).toLocaleString("en-IN")} settled (bulk)`,
        entityType: "payout",
        entityRef: String(row.id),
        level: "success",
      });
      results.push({ id: payoutId, status: "ok", utr });
    }
    return res.json({ processed: results.filter((r) => r.status === "ok").length, total: ids.length, results });
  } catch (err) {
    req.log.error({ err }, "bulk approve payout error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Maker action: submit payout for Checker approval (PENDING_APPROVAL → INITIATED)
router.post("/payouts/:id/initiate", authorize(["maker", "admin"]), async (req, res) => {
  try {
    const { initiatedBy } = req.body as { initiatedBy?: string };
    const maker = initiatedBy || "Anjali Patel";
    const payoutId = parseInt(String(req.params.id));

    const [existing] = await db.select().from(payoutsTable).where(eq(payoutsTable.id, payoutId));
    if (!existing) return res.status(404).json({ error: "Payout not found" });
    if (existing.status !== "PENDING_APPROVAL") {
      return res.status(400).json({ error: `Cannot initiate a payout with status '${existing.status}'. Only PENDING_APPROVAL payouts can be initiated.` });
    }

    const [row] = await db.update(payoutsTable)
      .set({ status: "INITIATED", initiatedBy: maker })
      .where(eq(payoutsTable.id, payoutId))
      .returning();

    await db.insert(activityTable).values({
      user: maker,
      action: `Payout initiated for ${row.brandName} — ${row.cycle} (₹${parseFloat(row.amount).toLocaleString("en-IN")}) — awaiting Checker approval`,
      entityType: "payout",
      entityRef: String(row.id),
      level: "info",
    });
    await notify(req, {
      action: "Payout initiated — awaiting Checker approval",
      entityType: "payout",
      entityId: row.id,
      recordName: `${row.brandName} — ${row.cycle}`,
      link: `/payouts`,
      level: "info",
    });

    return res.json(mapPayout(row));
  } catch (err) {
    req.log.error({ err }, "initiate payout error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Checker action: approve payout → auto-generate UTR → SETTLED
router.post("/payouts/:id/approve", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { approvedBy, payoutNotes } = req.body as { approvedBy?: string; payoutNotes?: string };
    const checker = approvedBy || "Rajesh Kumar";
    const payoutId = parseInt(String(req.params.id));

    const [existing] = await db.select().from(payoutsTable).where(eq(payoutsTable.id, payoutId));
    if (!existing) return res.status(404).json({ error: "Payout not found" });
    if (existing.status !== "INITIATED") {
      return res.status(400).json({ error: `Cannot approve a payout with status '${existing.status}'. Only INITIATED payouts can be approved.` });
    }

    // Auto-generate UTR (simulated bank transfer)
    const utr = generateUtr(existing.transferMode);
    const now = new Date();

    const [row] = await db.update(payoutsTable)
      .set({
        status: "SETTLED",
        utr,
        bankAckAt: now,
        settledAt: now,
        payoutApprovedBy: checker,
        payoutApprovedAt: now,
        payoutNotes: payoutNotes ?? null,
      })
      .where(eq(payoutsTable.id, payoutId))
      .returning();

    await db.insert(activityTable).values({
      user: checker,
      action: `Payout approved for ${row.brandName} — UTR ${utr} auto-generated · ₹${parseFloat(row.amount).toLocaleString("en-IN")} settled`,
      entityType: "payout",
      entityRef: String(row.id),
      level: "success",
    });
    await notify(req, {
      action: `Payout approved — UTR ${utr}`,
      entityType: "payout",
      entityId: row.id,
      recordName: `${row.brandName} — ${row.cycle}`,
      link: `/payouts`,
      level: "success",
    });

    return res.json(mapPayout(row));
  } catch (err) {
    req.log.error({ err }, "approve payout error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Legacy endpoint kept for backwards compatibility with seeded SETTLED payouts
router.post("/payouts/:id/record-utr", async (req, res) => {
  return res.status(410).json({ error: "Manual UTR recording is no longer supported. Payouts are approved by a Checker and UTR is auto-generated by the backend." });
});

router.get("/payouts/export.xlsx", async (req, res) => {
  try {
    const { status } = req.query as { status?: string };
    const rows = status
      ? await db.select().from(payoutsTable)
          .where(eq(payoutsTable.status, status as "PENDING_APPROVAL" | "INITIATED" | "UTR_RECORDED" | "SETTLED"))
          .orderBy(payoutsTable.initiatedAt)
      : await db.select().from(payoutsTable).orderBy(payoutsTable.initiatedAt);

    const data = rows.map((r) => ({
      cycle: r.cycle,
      companyName: r.companyName,
      brandName: r.brandName,
      amount: parseFloat(r.amount),
      transferMode: r.transferMode,
      bankName: r.bankName ?? "",
      bankAccount: r.bankAccount ?? "",
      bankIfsc: r.bankIfsc ?? "",
      status: r.status,
      utr: r.utr ?? "",
      initiatedBy: r.initiatedBy ?? "",
      payoutApprovedBy: r.payoutApprovedBy ?? "",
      initiatedAt: r.initiatedAt.toISOString().split("T")[0],
      settledAt: r.settledAt ? r.settledAt.toISOString().split("T")[0] : "",
    }));

    const buf = await buildWorkbook([{
      name: "Payouts",
      title: "Payout Register" + (status ? ` — ${status}` : ""),
      columns: [
        { key: "cycle",            header: "Cycle",           width: 16 },
        { key: "companyName",      header: "Company",         width: 24 },
        { key: "brandName",        header: "Brand",           width: 22 },
        { key: "amount",           header: "Amount (₹)",      width: 18, type: "currency" as const, total: true },
        { key: "transferMode",     header: "Mode",            width: 10 },
        { key: "bankName",         header: "Bank",            width: 20 },
        { key: "bankAccount",      header: "Account No.",     width: 22 },
        { key: "bankIfsc",         header: "IFSC",            width: 14 },
        { key: "status",           header: "Status",          width: 20 },
        { key: "utr",              header: "UTR",             width: 30 },
        { key: "initiatedBy",      header: "Initiated By",    width: 18 },
        { key: "payoutApprovedBy", header: "Approved By",     width: 18 },
        { key: "initiatedAt",      header: "Initiated On",    width: 14, type: "date" as const },
        { key: "settledAt",        header: "Settled On",      width: 14, type: "date" as const },
      ],
      rows: data,
      totals: true,
    }]);

    const label = status ? `-${status}` : "";
    sendWorkbook(res, `payouts${label}-${new Date().toISOString().split("T")[0]}.xlsx`, buf);
  } catch (err) {
    req.log.error({ err }, "payouts export error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function mapPayout(p: typeof payoutsTable.$inferSelect) {
  return {
    id: p.id,
    settlementId: p.settlementId,
    cycle: p.cycle,
    companyName: p.companyName,
    brandName: p.brandName,
    bankAccount: p.bankAccount,
    bankIfsc: p.bankIfsc,
    bankName: p.bankName,
    amount: parseFloat(p.amount),
    transferMode: p.transferMode,
    paymentRef: p.paymentRef,
    utr: p.utr,
    bankAckAt: p.bankAckAt?.toISOString(),
    status: p.status,
    initiatedBy: p.initiatedBy,
    initiatedAt: p.initiatedAt.toISOString(),
    payoutApprovedBy: p.payoutApprovedBy,
    payoutApprovedAt: p.payoutApprovedAt?.toISOString(),
    payoutNotes: p.payoutNotes,
    settledAt: p.settledAt?.toISOString(),
    bagCount: p.bagCount,
    bagIds: JSON.parse(p.bagIds) as string[],
  };
}

export default router;
