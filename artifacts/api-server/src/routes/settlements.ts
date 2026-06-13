import { Router } from "express";
import { db } from "@workspace/db";
import { settlementsTable, onboardingsTable, bagsTable, payoutsTable, activityTable, brandsTable, invoicesTable, settlementAdjustmentsTable } from "@workspace/db";
import { eq, and, inArray, desc, like, sql, isNull } from "drizzle-orm";
import { authorize } from "../middlewares/rbac";
import { writeAudit } from "../services/audit";
import { calculateSettlement } from "../services/settlementCalculator";
import { resolveRoutedSettlement, type DestinationGroup } from "../services/jurisdictionRouting";
import { buildCommissionResolver } from "../services/commissionResolver";
import { notify } from "../services/notify";
import { generateInvoicePdf, formatINR, groupINR, type InvoiceDocument, type PdfRow } from "../services/pdfService";
import { buildWorkbook, sendWorkbook } from "../services/excelService";

/**
 * Atomically assigns (once) and returns a stable per-brand sequential
 * settlement-invoice number, BRANDCODE-STL-YYYY-NNNN, mirroring invoiceService's
 * scheme. Runs in a transaction holding a per-brand advisory lock so concurrent
 * first-downloads cannot mint duplicate sequence numbers, and re-checks inside
 * the lock so an already-assigned number is never overwritten by a stale read.
 */
async function assignSettlementInvoiceNumber(settlementId: number, brandCode: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${brandCode}-STL-${year}-`;
  return await db.transaction(async (tx) => {
    // Serialize number generation per brand for the duration of this txn.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`stl-invno:${brandCode}`}))`);

    // Another concurrent request may have already assigned a number; reuse it.
    const [current] = await tx
      .select({ invoiceNumber: settlementsTable.invoiceNumber })
      .from(settlementsTable)
      .where(eq(settlementsTable.id, settlementId))
      .limit(1);
    if (current?.invoiceNumber) return current.invoiceNumber;

    const [last] = await tx
      .select({ invoiceNumber: settlementsTable.invoiceNumber })
      .from(settlementsTable)
      .where(like(settlementsTable.invoiceNumber, `${prefix}%`))
      .orderBy(desc(settlementsTable.invoiceNumber))
      .limit(1);
    let next = 1;
    if (last?.invoiceNumber) {
      const parsed = parseInt(last.invoiceNumber.slice(prefix.length), 10);
      if (!Number.isNaN(parsed)) next = parsed + 1;
    }
    const invoiceNumber = `${prefix}${String(next).padStart(4, "0")}`;
    await tx.update(settlementsTable).set({ invoiceNumber }).where(eq(settlementsTable.id, settlementId));
    return invoiceNumber;
  });
}

const router = Router();

router.get("/settlements", async (req, res) => {
  try {
    const { status } = req.query as { status?: string };
    const rows = status
      ? await db.select().from(settlementsTable).where(eq(settlementsTable.status, status as "COMPUTED" | "PENDING_APPROVAL" | "APPROVED" | "PAID")).orderBy(settlementsTable.createdAt)
      : await db.select().from(settlementsTable).orderBy(settlementsTable.createdAt);

    res.json(rows.map((r) => ({
      id: r.id,
      cycle: r.cycle,
      onboardingId: r.onboardingId,
      companyId: `CO-${String(r.onboardingId).padStart(5, "0")}`,
      companyName: r.companyName,
      brandName: r.brandName,
      eligibleBags: r.eligibleBags,
      grossGmv: parseFloat(r.grossGmv),
      netPayable: parseFloat(r.netPayable),
      carryForward: parseFloat(r.carryForward),
      onHold: r.onHold,
      holdReason: r.holdReason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "list settlements error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/settlements/export.xlsx", async (req, res) => {
  try {
    const { status } = req.query as { status?: string };
    const rows = status
      ? await db.select().from(settlementsTable).where(eq(settlementsTable.status, status as "COMPUTED" | "PENDING_APPROVAL" | "APPROVED" | "PAID")).orderBy(settlementsTable.createdAt)
      : await db.select().from(settlementsTable).orderBy(settlementsTable.createdAt);

    const data = rows.map((r) => ({
      cycle: r.cycle,
      companyId: `CO-${String(r.onboardingId).padStart(5, "0")}`,
      companyName: r.companyName,
      brandName: r.brandName,
      eligibleBags: r.eligibleBags,
      grossGmv: parseFloat(r.grossGmv),
      netPayable: parseFloat(r.netPayable),
      carryForward: parseFloat(r.carryForward),
      status: r.status,
      createdAt: r.createdAt.toISOString().split("T")[0],
    }));

    const buf = await buildWorkbook([{
      name: "Settlements",
      title: "Settlement Register" + (status ? ` — ${status}` : ""),
      columns: [
        { key: "cycle",        header: "Cycle",             width: 16 },
        { key: "companyId",    header: "Company ID",        width: 13 },
        { key: "companyName",  header: "Company",           width: 24 },
        { key: "brandName",    header: "Brand",             width: 22 },
        { key: "eligibleBags", header: "Eligible Bags",     width: 14, type: "integer" as const, total: true },
        { key: "grossGmv",     header: "Gross GMV (₹)",     width: 18, type: "currency" as const, total: true },
        { key: "netPayable",   header: "Net Payable (₹)",   width: 18, type: "currency" as const, total: true },
        { key: "carryForward", header: "Carry Forward (₹)", width: 16, type: "currency" as const },
        { key: "status",       header: "Status",            width: 18 },
        { key: "createdAt",    header: "Computed On",       width: 14, type: "date" as const },
      ],
      rows: data,
      totals: true,
    }]);

    const label = status ? `-${status}` : "";
    sendWorkbook(res, `settlements${label}-${new Date().toISOString().split("T")[0]}.xlsx`, buf);
  } catch (err) {
    req.log.error({ err }, "settlements export error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/settlements", async (req, res) => {
  try {
    const { onboardingId, cycle } = req.body as { onboardingId: number; cycle: string };

    const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, onboardingId));
    if (!ob) return res.status(404).json({ error: "Onboarding not found" });

    const eligibleBags = await db.select().from(bagsTable)
      .where(and(eq(bagsTable.brandId, ob.id), eq(bagsTable.cycle, cycle), eq(bagsTable.eligibility, "eligible")));

    if (eligibleBags.length === 0) {
      return res.status(400).json({ error: `No eligible bags found for ${ob.brandName} in cycle ${cycle}. Ensure bags are marked as 'eligible' in the Orders register.` });
    }

    // Pull any unconsumed deficit from the brand's most recent prior settlement.
    const [prior] = await db.select().from(settlementsTable)
      .where(eq(settlementsTable.onboardingId, ob.id))
      .orderBy(desc(settlementsTable.createdAt))
      .limit(1);
    const priorCarryForward = prior ? parseFloat(prior.carryForward) : 0;

    // Query un-consumed settlement adjustments (CN deductions + TDS/TCS carry-forwards)
    // for this brand+cycle. These arise from returns/cancellations where credit notes
    // were issued or TDS could not be reversed because the deposit deadline had passed.
    const adjustments = await db.select()
      .from(settlementAdjustmentsTable)
      .where(and(
        eq(settlementAdjustmentsTable.onboardingId, ob.id),
        eq(settlementAdjustmentsTable.cycle, cycle),
        isNull(settlementAdjustmentsTable.settlementId),
      ));
    const creditNoteDeductions = adjustments.reduce((sum, a) => sum + parseFloat(a.amount), 0);

    // Dated commission (Task #11): each bag is charged at the rate effective on
    // its own order date, read from the versioned commission_master history.
    const resolver = await buildCommissionResolver(ob.id, parseFloat(ob.commissionRate));
    const calc = calculateSettlement({
      bags: eligibleBags.map((b) => ({
        esp: b.esp,
        qty: b.qty,
        tcsAmount: b.tcsAmount,
        tdsAmount: b.tdsAmount,
        commissionRate: resolver.rateForDate(b.invoiceDate || (b.createdAt ? b.createdAt.toISOString().slice(0, 10) : "")),
      })),
      commissionRate: parseFloat(ob.commissionRate),
      priorCarryForward,
      creditNoteDeductions,
    });

    const [row] = await db.insert(settlementsTable).values({
      cycle,
      onboardingId: ob.id,
      companyName: ob.companyName,
      brandName: ob.brandName,
      bankAccount: ob.bankAccount,
      bankIfsc: ob.bankIfsc,
      bankName: ob.bankName,
      eligibleBags: eligibleBags.length,
      bagIds: JSON.stringify(eligibleBags.map((b) => b.bagId)),
      grossGmv: calc.grossGmv.toFixed(2),
      brandPromotions: calc.brandPromotions.toFixed(2),
      marketplacePromotions: calc.marketplacePromotions.toFixed(2),
      netBeforeCommission: calc.netBeforeCommission.toFixed(2),
      commission: calc.commission.toFixed(2),
      commissionRate: calc.commissionRate.toFixed(2),
      gstOnCommission: calc.gstOnCommission.toFixed(2),
      tcsAmount: calc.tcsAmount.toFixed(2),
      tdsAmount: calc.tdsAmount.toFixed(2),
      mdrCharges: "0.00",
      mdrRate: "0.00",
      penalty: calc.penalty.toFixed(2),
      netPayable: calc.netPayable.toFixed(2),
      carryForward: calc.carryForward.toFixed(2),
      status: "PENDING_APPROVAL",
    }).returning();

    // Mark all consumed adjustments with this settlement's ID so they won't be
    // double-counted in any future recompute of the same cycle.
    if (adjustments.length > 0) {
      await db.update(settlementAdjustmentsTable)
        .set({ settlementId: row.id })
        .where(inArray(settlementAdjustmentsTable.id, adjustments.map((a) => a.id)));
    }

    const cfNote = priorCarryForward < 0 ? ` (applied ₹${Math.abs(priorCarryForward).toFixed(0)} carry-forward)` : "";
    const cnNote = creditNoteDeductions > 0 ? ` (₹${creditNoteDeductions.toFixed(0)} CN/TDS adjustments applied)` : "";
    const negNote = calc.carryForward < 0 ? ` — net negative, ₹${Math.abs(calc.carryForward).toFixed(0)} carried to next cycle, payout floored at ₹0` : "";
    await db.insert(activityTable).values({ user: req.user?.name ?? "Anjali Patel", action: `Computed settlement for ${ob.brandName} — ${cycle} (${eligibleBags.length} bags, GMV ₹${calc.grossGmv.toFixed(0)})${cfNote}${cnNote}${negNote}`, entityType: "settlement", entityRef: String(row.id), level: calc.carryForward < 0 ? "warning" : "info" });

    return res.status(201).json(mapSettlement(row));
  } catch (err) {
    req.log.error({ err }, "create settlement error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------------------------------------------------------------------
// Jurisdiction-based bulk settlement — route each brand's eligible orders to the
// mapped (or primary) bank account and split into one settlement per account.
// ----------------------------------------------------------------------------

function groupSummary(g: DestinationGroup) {
  const last4 = g.bankAccount ? g.bankAccount.slice(-4) : "----";
  return {
    bankAccountId: g.bankAccountId,
    bankName: g.bankName,
    accountMasked: `••••${last4}`,
    ifsc: g.bankIfsc,
    isPrimaryDestination: g.isPrimaryDestination,
    warehouseIds: g.warehouseIds,
    warehouseLabels: g.warehouseLabels,
    eligibleBags: g.bags.length,
    grossGmv: g.calc.grossGmv,
    netPayable: g.calc.netPayable,
    carryForward: g.calc.carryForward,
  };
}

// Preview the routed groups for one or more brands + a cycle. No DB writes.
router.post("/settlements/bulk/preview", async (req, res) => {
  try {
    const { onboardingIds, cycle } = req.body as { onboardingIds?: number[]; cycle?: string };
    if (!Array.isArray(onboardingIds) || onboardingIds.length === 0 || !cycle) {
      return res.status(400).json({ error: "onboardingIds (non-empty) and cycle are required" });
    }

    const brands: Array<Record<string, unknown>> = [];
    let totalGroups = 0;
    let totalNet = 0;
    for (const id of onboardingIds) {
      const routed = await resolveRoutedSettlement(id, cycle);
      if (!routed) {
        brands.push({ onboardingId: id, error: "Onboarding not found", groups: [] });
        continue;
      }
      const groups = routed.groups.map(groupSummary);
      totalGroups += groups.length;
      totalNet += groups.reduce((s, g) => s + g.netPayable, 0);
      brands.push({
        onboardingId: id,
        companyId: `CO-${String(id).padStart(5, "0")}`,
        companyName: routed.onboarding.companyName,
        brandName: routed.onboarding.brandName,
        eligibleBags: routed.eligibleBags,
        warning: routed.warning,
        groups,
      });
    }

    return res.json({ cycle, brandCount: onboardingIds.length, settlementCount: totalGroups, totalNetPayable: totalNet, brands });
  } catch (err) {
    req.log.error({ err }, "bulk settlement preview error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Confirm the batch: create one routed settlement record per destination group
// for each brand. Each record drives its own payout via the existing approve flow.
router.post("/settlements/bulk/confirm", async (req, res) => {
  try {
    const { onboardingIds, cycle } = req.body as { onboardingIds?: number[]; cycle?: string };
    if (!Array.isArray(onboardingIds) || onboardingIds.length === 0 || !cycle) {
      return res.status(400).json({ error: "onboardingIds (non-empty) and cycle are required" });
    }

    const created: Array<ReturnType<typeof mapSettlement>> = [];
    const skipped: Array<{ onboardingId: number; reason: string }> = [];

    for (const id of onboardingIds) {
      const routed = await resolveRoutedSettlement(id, cycle);
      if (!routed) { skipped.push({ onboardingId: id, reason: "Onboarding not found" }); continue; }
      if (routed.groups.length === 0) { skipped.push({ onboardingId: id, reason: routed.warning ?? "No eligible bags" }); continue; }

      const ob = routed.onboarding;
      for (const g of routed.groups) {
        const [row] = await db.insert(settlementsTable).values({
          cycle,
          onboardingId: ob.id,
          companyName: ob.companyName,
          brandName: ob.brandName,
          bankAccount: g.bankAccount,
          bankIfsc: g.bankIfsc,
          bankName: g.bankName,
          eligibleBags: g.bags.length,
          bagIds: JSON.stringify(g.bags.map((b) => b.bagId)),
          grossGmv: g.calc.grossGmv.toFixed(2),
          brandPromotions: g.calc.brandPromotions.toFixed(2),
          marketplacePromotions: g.calc.marketplacePromotions.toFixed(2),
          netBeforeCommission: g.calc.netBeforeCommission.toFixed(2),
          commission: g.calc.commission.toFixed(2),
          commissionRate: g.calc.commissionRate.toFixed(2),
          gstOnCommission: g.calc.gstOnCommission.toFixed(2),
          tcsAmount: g.calc.tcsAmount.toFixed(2),
          tdsAmount: g.calc.tdsAmount.toFixed(2),
          mdrCharges: "0.00",
          mdrRate: "0.00",
          penalty: g.calc.penalty.toFixed(2),
          netPayable: g.calc.netPayable.toFixed(2),
          carryForward: g.calc.carryForward.toFixed(2),
          status: "PENDING_APPROVAL",
        }).returning();

        const dest = g.bankName ? `${g.bankName} ••••${g.bankAccount.slice(-4)}` : "primary account";
        const warehouses = g.warehouseLabels.length > 0 ? ` [${g.warehouseLabels.join(", ")}]` : "";
        await db.insert(activityTable).values({
          user: req.user?.name ?? "Anjali Patel",
          action: `Bulk settlement: ${ob.brandName} — ${cycle} → ${dest}${warehouses} (${g.bags.length} bags, net ₹${g.calc.netPayable.toFixed(0)})`,
          entityType: "settlement",
          entityRef: String(row.id),
          level: g.calc.carryForward < 0 ? "warning" : "info",
        });
        created.push(mapSettlement(row));
      }
    }

    return res.status(201).json({ cycle, created, skipped, settlementCount: created.length });
  } catch (err) {
    req.log.error({ err }, "bulk settlement confirm error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/settlements/:id", async (req, res) => {
  try {
    const [row] = await db.select().from(settlementsTable).where(eq(settlementsTable.id, parseInt(String(req.params.id))));
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(mapSettlement(row));
  } catch (err) {
    req.log.error({ err }, "get settlement error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get the payout linked to this settlement
router.get("/settlements/:id/payout", async (req, res) => {
  try {
    const settlementId = parseInt(req.params.id);
    const [payout] = await db.select().from(payoutsTable).where(eq(payoutsTable.settlementId, settlementId));
    if (!payout) return res.status(404).json({ error: "No payout created yet for this settlement" });
    return res.json({
      id: payout.id,
      settlementId: payout.settlementId,
      status: payout.status,
      amount: parseFloat(payout.amount),
      paymentRef: payout.paymentRef,
      transferMode: payout.transferMode,
      utr: payout.utr,
      bankName: payout.bankName,
      bankAccount: payout.bankAccount,
      initiatedBy: payout.initiatedBy,
      initiatedAt: payout.initiatedAt.toISOString(),
      payoutApprovedBy: payout.payoutApprovedBy,
      payoutApprovedAt: payout.payoutApprovedAt?.toISOString(),
      settledAt: payout.settledAt?.toISOString(),
      payoutNotes: payout.payoutNotes,
    });
  } catch (err) {
    req.log.error({ err }, "get settlement payout error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Generate commission invoice JSON for a settled payout
router.get("/settlements/:id/invoice", async (req, res) => {
  try {
    const settlementId = parseInt(req.params.id);
    const [settlement] = await db.select().from(settlementsTable).where(eq(settlementsTable.id, settlementId));
    if (!settlement) return res.status(404).json({ error: "Not found" });

    const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, settlement.onboardingId));
    const [payout] = await db.select().from(payoutsTable).where(eq(payoutsTable.settlementId, settlementId));

    const invoiceNo = `INV-SWAS-${settlement.cycle.replace(/[^A-Z0-9]/gi, "")}-${String(settlementId).padStart(4, "0")}`;

    return res.json({
      invoiceNo,
      invoiceDate: payout?.settledAt?.toISOString().split("T")[0] ?? settlement.createdAt.toISOString().split("T")[0],
      cycle: settlement.cycle,
      brand: {
        name: settlement.brandName,
        companyName: settlement.companyName,
        pan: ob?.pan ?? "",
        gstin: ob?.masterGstin ?? "",
        spocEmail: ob?.spocEmail ?? "",
        bankAccount: settlement.bankAccount,
        bankIfsc: settlement.bankIfsc,
        bankName: settlement.bankName,
      },
      platform: {
        name: "Swasthera Marketplace Pvt. Ltd.",
        gstin: "27AABCS1234A1Z5",
        address: "Unit 4B, Bandra-Kurla Complex, Mumbai 400051",
        pan: "AABCS1234A",
      },
      waterfall: {
        grossGmv: parseFloat(settlement.grossGmv),
        brandPromotions: parseFloat(settlement.brandPromotions),
        netBeforeCommission: parseFloat(settlement.netBeforeCommission),
        commissionRate: parseFloat(settlement.commissionRate),
        commission: parseFloat(settlement.commission),
        gstOnCommission: parseFloat(settlement.gstOnCommission),
        tcsAmount: parseFloat(settlement.tcsAmount),
        tdsAmount: parseFloat(settlement.tdsAmount),
        mdrCharges: parseFloat(settlement.mdrCharges),
        penalty: parseFloat(settlement.penalty),
        netPayable: parseFloat(settlement.netPayable),
      },
      payout: payout ? {
        status: payout.status,
        utr: payout.utr,
        transferMode: payout.transferMode,
        settledAt: payout.settledAt?.toISOString(),
        approvedBy: payout.payoutApprovedBy,
      } : null,
      eligibleBags: settlement.eligibleBags,
      socUrl: `/api/settlements/${settlementId}/soc`,
    });
  } catch (err) {
    req.log.error({ err }, "get invoice error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Bulk approve — Checker approves multiple PENDING_APPROVAL settlements at once.
// Each approved settlement automatically creates a PENDING_APPROVAL payout record.
router.post("/settlements/bulk/approve", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { ids, financeNotes, approvedBy } = req.body as { ids: number[]; financeNotes?: string; approvedBy?: string };
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids array required" });
    const checker = approvedBy || "Rajesh Kumar";
    const now = new Date();

    const results: { id: number; status: "ok" | "skipped"; payoutCreated?: boolean; reason?: string }[] = [];
    for (const settlementId of ids) {
      const [settlement] = await db.select().from(settlementsTable).where(eq(settlementsTable.id, settlementId));
      if (!settlement || settlement.status !== "PENDING_APPROVAL") {
        results.push({ id: settlementId, status: "skipped", reason: settlement ? `Status is ${settlement.status}` : "Not found" });
        continue;
      }

      await db.update(settlementsTable)
        .set({ status: "APPROVED", financeNotes: financeNotes ?? null, approvedBy: checker, approvedAt: now })
        .where(eq(settlementsTable.id, settlementId));

      // Guard: if net payable is zero or negative (carry-forward adjustments fully
      // offset the settlement) approve the record but do NOT create a payout — same
      // rule as the single-approve path (BRD §7 Scenario 4).
      const netPayableAmt = parseFloat(settlement.netPayable);
      if (netPayableAmt <= 0) {
        await db.insert(activityTable).values({
          user: checker,
          action: `Approved settlement #${settlementId} for ${settlement.brandName} — ${settlement.cycle} (bulk) · net payable ₹${netPayableAmt.toFixed(2)} ≤ 0; no payout created`,
          entityType: "settlement",
          entityRef: String(settlementId),
          level: "warning",
        });
        results.push({ id: settlementId, status: "ok", payoutCreated: false, reason: "Net payable ≤ 0 — carry-forward adjustments applied; no bank transfer initiated" });
        continue;
      }

      const paymentRef = `PAY-${settlement.cycle}-${String(settlementId).padStart(4, "0")}`;
      await db.insert(payoutsTable).values({
        settlementId,
        cycle: settlement.cycle,
        companyName: settlement.companyName,
        brandName: settlement.brandName,
        bankAccount: settlement.bankAccount,
        bankIfsc: settlement.bankIfsc,
        bankName: settlement.bankName,
        amount: settlement.netPayable,
        transferMode: "NEFT",
        paymentRef,
        status: "PENDING_APPROVAL",
        bagCount: settlement.eligibleBags,
        bagIds: settlement.bagIds,
      });

      await db.insert(activityTable).values({
        user: checker,
        action: `Settlement approved for ${settlement.brandName} — ${settlement.cycle} (bulk) · payout ${paymentRef} created`,
        entityType: "settlement",
        entityRef: String(settlementId),
        level: "success",
      });
      results.push({ id: settlementId, status: "ok", payoutCreated: true });
    }

    return res.json({ processed: results.filter((r) => r.status === "ok").length, total: ids.length, results });
  } catch (err) {
    req.log.error({ err }, "bulk approve settlements error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/settlements/:id/approve", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { financeNotes, approvedBy } = req.body as { financeNotes?: string; approvedBy?: string };
    const checker = approvedBy || "Rajesh Kumar";
    const [existing] = await db.select().from(settlementsTable).where(eq(settlementsTable.id, parseInt(String(req.params.id))));
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.status === "APPROVED" || existing.status === "PAID") {
      return res.status(409).json({ error: `Settlement is already ${existing.status}. A payout has already been created.` });
    }
    if (existing.onHold) {
      return res.status(409).json({ error: `Settlement #${existing.id} is on payout hold (${existing.holdReason ?? "stopped by finance"}). Resume it before approving.` });
    }

    // Guard: if the net payable is zero or negative (e.g. carry-forward adjustments
    // fully offset the settlement) there is nothing to transfer to the brand.
    // Approve the settlement record but do NOT create a payout row — initiating a
    // bank transfer for a ≤0 amount is a compliance error.
    const netPayableAmt = parseFloat(existing.netPayable);
    if (netPayableAmt <= 0) {
      const [row] = await db.update(settlementsTable)
        .set({ status: "APPROVED", financeNotes, approvedBy: checker, approvedAt: new Date() })
        .where(eq(settlementsTable.id, parseInt(String(req.params.id))))
        .returning();
      await db.insert(activityTable).values({
        user: checker,
        action: `Approved settlement #${row.id} for ${row.brandName} — net payable is ₹${netPayableAmt.toFixed(2)} (carry-forward); no payout created`,
        entityType: "settlement",
        entityRef: String(row.id),
        level: "warning",
      });
      return res.json({ ...mapSettlement(row), payoutCreated: false, reason: "Net payable ≤ 0 — carry-forward adjustments applied; no bank transfer initiated" });
    }

    const [row] = await db.update(settlementsTable)
      .set({ status: "APPROVED", financeNotes, approvedBy: checker, approvedAt: new Date() })
      .where(eq(settlementsTable.id, parseInt(String(req.params.id))))
      .returning();

    await db.insert(payoutsTable).values({
      settlementId: row.id,
      cycle: row.cycle,
      companyName: row.companyName,
      brandName: row.brandName,
      bankAccount: row.bankAccount,
      bankIfsc: row.bankIfsc,
      bankName: row.bankName,
      amount: row.netPayable,
      transferMode: "NEFT",
      paymentRef: `PAY-${row.id}-${Date.now()}`,
      status: "PENDING_APPROVAL",
      bagCount: row.eligibleBags,
      bagIds: row.bagIds,
    });

    await db.insert(activityTable).values({ user: checker, action: `Approved settlement #${row.id} for ${row.brandName} — payout queued for Maker initiation`, entityType: "settlement", entityRef: String(row.id), level: "success" });
    await notify(req, {
      action: "Approved settlement — payout queued",
      entityType: "settlement",
      entityId: row.id,
      recordName: `#${row.id} — ${row.brandName}`,
      link: `/settlements/${row.id}`,
      level: "success",
    });

    return res.json(mapSettlement(row));
  } catch (err) {
    req.log.error({ err }, "approve settlement error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// SoC CSV download — BRD §7.1 (27 fields per bag)
router.get("/settlements/:id/soc", async (req, res) => {
  try {
    const [settlement] = await db.select().from(settlementsTable).where(eq(settlementsTable.id, parseInt(req.params.id)));
    if (!settlement) return res.status(404).json({ error: "Not found" });

    const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, settlement.onboardingId));
    const bagIdList: string[] = JSON.parse(settlement.bagIds);
    const bags = bagIdList.length > 0
      ? await db.select().from(bagsTable).where(inArray(bagsTable.bagId, bagIdList))
      : [];

    const [payout] = await db.select().from(payoutsTable).where(eq(payoutsTable.settlementId, settlement.id));

    // Use the blended rate persisted on the settlement at compute time (Task #11).
    // Documents read this immutable snapshot, never live commission_master, so a
    // later rate version can never retroactively alter a historical SoC.
    const commRate = parseFloat(settlement.commissionRate);
    const utr = payout?.utr ?? "";
    const settlementDate = payout?.settledAt?.toISOString().split("T")[0] ?? "";

    const headers = [
      "Settlement Cycle", "Order ID", "Bag ID", "Order Date", "Invoice Date",
      "Delivery Date", "Return Window Expiry", "Product SKU", "SKU Code", "Quantity",
      "MRP (₹)", "Effective Selling Price (₹)", "Brand-funded Discount (₹)", "Marketplace-funded Discount (₹)",
      "Net ESP after Brand Discount (₹)", "Commission %", "Commission Amount (₹)",
      "GST on Commission 18% (₹)", "TCS Amount (₹)", "TDS Amount (₹)",
      "Net Payable (₹)", "Bag Settlement Status", "OMS State",
      "Return Status", "UTR", "Settlement Date",
    ];

    const rows = bags.map((b) => {
      const esp = parseFloat(b.esp) * b.qty;
      const brandDiscount = 0;
      const marketplaceDiscount = 0;
      const netEsp = esp - brandDiscount;
      const commission = netEsp * commRate / 100;
      const gstOnCommission = commission * 0.18;
      const tcs = parseFloat(b.tcsAmount);
      const tds = parseFloat(b.tdsAmount);
      const net = netEsp - commission - gstOnCommission - tcs - tds;
      const returnStatus = b.eligibility === "on_hold" ? "INITIATED" : "NONE";
      const mrp = (parseFloat(b.esp) * 1.15 * b.qty).toFixed(2);

      return [
        settlement.cycle, b.orderId, b.bagId, b.invoiceDate ?? "", b.invoiceDate ?? "",
        b.deliveryDate ?? "", b.windowExpiryDate ?? "", b.sku, b.sku, b.qty,
        mrp, esp.toFixed(2), brandDiscount.toFixed(2), marketplaceDiscount.toFixed(2),
        netEsp.toFixed(2), commRate.toFixed(2), commission.toFixed(2), gstOnCommission.toFixed(2),
        tcs.toFixed(2), tds.toFixed(2), net.toFixed(2),
        b.eligibility.toUpperCase(), b.omsState, returnStatus, utr, settlementDate,
      ];
    });

    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const filename = `SoC-${settlement.cycle}-${settlement.brandName.replace(/\s+/g, "-")}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    req.log.error({ err }, "soc download error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Brand settlement invoice PDF — formatted per-order breakdown + summary.
// Not role-gated (downloaded via a plain anchor that cannot carry the X-Role
// header), matching the SoC CSV endpoint.
router.get("/settlements/:id/invoice-pdf", async (req, res) => {
  try {
    const settlementId = parseInt(req.params.id);
    const [settlement] = await db.select().from(settlementsTable).where(eq(settlementsTable.id, settlementId));
    if (!settlement) return res.status(404).json({ error: "Not found" });

    const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, settlement.onboardingId));
    const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.onboardingId, settlement.onboardingId)).limit(1);
    const [payout] = await db.select().from(payoutsTable).where(eq(payoutsTable.settlementId, settlementId));

    const bagIdList: string[] = JSON.parse(settlement.bagIds);
    const bags = bagIdList.length > 0
      ? await db.select().from(bagsTable).where(inArray(bagsTable.bagId, bagIdList))
      : [];
    const orderIds = bags.map((b) => b.orderId);

    // Per-order invoice numbers + credit notes for the orders in this settlement.
    const relatedInvoices = orderIds.length > 0
      ? await db.select().from(invoicesTable).where(inArray(invoicesTable.orderId, orderIds))
      : [];
    const invoiceNoByOrder = new Map<string, string>();
    const creditNotes = relatedInvoices.filter((i) => i.invoiceType === "CREDIT_NOTE");
    relatedInvoices
      .filter((i) => i.invoiceType === "INVOICE")
      .forEach((i) => invoiceNoByOrder.set(i.orderId, i.invoiceNumber));

    // Prior cycle's carried-forward deficit (if any) applied into this settlement.
    // The predecessor is this brand's most recent settlement created before this one.
    const predecessor = (await db.select().from(settlementsTable)
      .where(eq(settlementsTable.onboardingId, settlement.onboardingId))
      .orderBy(desc(settlementsTable.createdAt)))
      .find((s) => s.id !== settlement.id && s.createdAt <= settlement.createdAt);
    const priorCarryForward = predecessor ? parseFloat(predecessor.carryForward) : 0;

    // Assign + persist a stable settlement-invoice number on first download.
    let invoiceNumber = settlement.invoiceNumber;
    if (!invoiceNumber) {
      const brandCode = brand?.brandCode ?? `BR-${String(settlement.onboardingId).padStart(5, "0")}`;
      invoiceNumber = await assignSettlementInvoiceNumber(settlementId, brandCode);
    }

    // Blended effective rate persisted on the settlement at compute time (Task #11).
    // The document derives from this immutable snapshot, never live
    // commission_master, so later rate versions can't change a historical invoice.
    const commRate = parseFloat(settlement.commissionRate);

    // Settlement period from the bag invoice-date range; falls back to the cycle.
    const dates = bags.map((b) => b.invoiceDate).filter((d): d is string => !!d).sort();
    const periodFrom = dates[0] ?? settlement.cycle;
    const periodTo = dates[dates.length - 1] ?? settlement.cycle;

    // ---- Line items: one row per eligible bag (mirrors the SoC per-bag math) ----
    const rows: PdfRow[] = bags.map((b) => {
      const gmv = parseFloat(b.esp) * b.qty;
      const commission = gmv * commRate / 100;
      const gstOnCommission = commission * 0.18;
      const tcs = parseFloat(b.tcsAmount);
      const tds = parseFloat(b.tdsAmount);
      const net = gmv - commission - gstOnCommission - tcs - tds;
      return {
        cells: {
          orderId: b.orderId,
          invoiceNo: invoiceNoByOrder.get(b.orderId) ?? "—",
          orderDate: b.invoiceDate ?? "—",
          gmv: groupINR(gmv),
          commission: `${groupINR(commission)} (${commRate.toFixed(2)}%)`,
          tds: groupINR(tds),
          tcs: groupINR(tcs),
          net: groupINR(net),
        },
      };
    });

    // ---- Credit notes / cancellations as negative line items ----
    for (const cn of creditNotes) {
      rows.push({
        negative: true,
        cells: {
          orderId: cn.orderId,
          invoiceNo: cn.invoiceNumber,
          orderDate: "Credit Note",
          gmv: groupINR(parseFloat(cn.gmv)),
          commission: groupINR(parseFloat(cn.commissionAmount)),
          tds: groupINR(parseFloat(cn.tdsDeducted)),
          tcs: groupINR(parseFloat(cn.tcsCollected)),
          net: groupINR(parseFloat(cn.netPayable)),
        },
      });
    }

    // ---- Carry-forward adjustment line ----
    if (priorCarryForward < 0 && predecessor) {
      rows.push({
        emphasis: true,
        cells: {
          orderId: "—",
          invoiceNo: "",
          orderDate: "",
          gmv: "",
          commission: `Adjustment carried forward from ${predecessor.cycle}`,
          tds: "",
          tcs: "",
          net: groupINR(priorCarryForward),
        },
      });
    }

    const grossGmv = parseFloat(settlement.grossGmv);
    const brandPromotions = parseFloat(settlement.brandPromotions);
    const commission = parseFloat(settlement.commission);
    const gstOnCommission = parseFloat(settlement.gstOnCommission);
    const tcsAmount = parseFloat(settlement.tcsAmount);
    const tdsAmount = parseFloat(settlement.tdsAmount);
    const penalty = parseFloat(settlement.penalty);
    const netPayable = parseFloat(settlement.netPayable);
    const carryForward = parseFloat(settlement.carryForward);

    const summary = [
      { label: "Gross Merchandise Value", value: formatINR(grossGmv) },
      ...(brandPromotions > 0 ? [{ label: "Less: Brand-funded Promotions", value: formatINR(-brandPromotions), negative: true }] : []),
      { label: `Less: Commission (${commRate.toFixed(2)}%)`, value: formatINR(-commission), negative: true },
      { label: "Less: GST on Commission (18%)", value: formatINR(-gstOnCommission), negative: true },
      { label: "Less: TCS (Sec. 52 GST)", value: formatINR(-tcsAmount), negative: true },
      { label: "Less: TDS (Sec. 194-O)", value: formatINR(-tdsAmount), negative: true },
      ...(penalty > 0 ? [{ label: "Less: Penalty / Adjustments", value: formatINR(-penalty), negative: true }] : []),
      ...(priorCarryForward < 0 && predecessor
        ? [{ label: `Adjustment carried forward from ${predecessor.cycle}`, value: formatINR(priorCarryForward), negative: true }]
        : []),
    ];

    const footerNotes = [
      "All amounts in INR. This is a system-generated settlement invoice and does not require a physical signature.",
      ...(carryForward < 0
        ? [`Net negative cycle — ${formatINR(Math.abs(carryForward))} carried forward to the next settlement cycle; payout floored at INR 0.00.`]
        : []),
      "Net payable is transferred via NEFT/RTGS to the credited bank account. Statement of Claim (SoC) is shared alongside this invoice.",
    ];

    const brandLegal = brand?.brandLegalName ?? ob?.brandLegalName ?? settlement.companyName;
    const last4 = settlement.bankAccount.slice(-4);

    const doc: InvoiceDocument = {
      brandHeading: "Swasthera",
      docTitle: "Settlement Invoice",
      invoiceNumber,
      metaItems: [
        { label: "Settlement Cycle", value: settlement.cycle },
        { label: "Period", value: periodFrom === periodTo ? periodFrom : `${periodFrom} to ${periodTo}` },
        { label: "Status", value: settlement.status },
        { label: "Payout Date", value: payout?.settledAt?.toISOString().split("T")[0] ?? "—" },
      ],
      parties: [
        {
          heading: "From",
          name: "Swasthera Marketplace Pvt. Ltd.",
          lines: [
            "Legal: Swasthera Marketplace Pvt. Ltd.",
            "GSTIN: 27AABCS1234A1Z5",
            "Unit 4B, Bandra-Kurla Complex, Mumbai 400051",
          ],
        },
        {
          heading: "Billed To",
          name: settlement.brandName,
          lines: [
            `Legal: ${brandLegal}`,
            `GSTIN: ${ob?.masterGstin ?? "—"}`,
            `PAN: ${ob?.pan ?? "—"}`,
            `TAN: ${ob?.tan ?? "—"}`,
          ],
        },
      ],
      bankBlock: {
        heading: "Credited Bank Account",
        lines: [
          settlement.bankName,
          `IFSC: ${settlement.bankIfsc}`,
          `A/c: ****${last4}`,
        ],
      },
      columns: [
        { key: "orderId", header: "Order ID", width: 1.6 },
        { key: "invoiceNo", header: "Invoice No", width: 1.7 },
        { key: "orderDate", header: "Order Date", width: 1.3 },
        { key: "gmv", header: "GMV", width: 1.4, align: "right" },
        { key: "commission", header: "Commission", width: 1.9, align: "right" },
        { key: "tds", header: "TDS", width: 1.0, align: "right" },
        { key: "tcs", header: "TCS", width: 1.0, align: "right" },
        { key: "net", header: "Net Payable", width: 1.3, align: "right" },
      ],
      rows,
      summary,
      netLabel: "Net Settlement Amount",
      netValue: formatINR(netPayable),
      footerNotes,
      signatory: {
        heading: "Authorised Signatory",
        lines: ["For Swasthera Marketplace Pvt. Ltd.", "Finance & Settlements"],
      },
    };

    const pdfBytes = await generateInvoicePdf(doc);
    const filename = `Settlement-Invoice-${invoiceNumber}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(Buffer.from(pdfBytes));
  } catch (err) {
    req.log.error({ err }, "settlement invoice pdf error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Stop-payout (hold) / resume — spec MODULE 3. Pauses a cycle without deleting
// it; a held settlement cannot be approved into a payout.
router.post("/settlements/:id/hold", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { hold, reason } = req.body as { hold?: boolean; reason?: string };
    const id = parseInt(String(req.params.id));
    const [existing] = await db.select().from(settlementsTable).where(eq(settlementsTable.id, id));
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.status === "APPROVED" || existing.status === "PAID") {
      return res.status(409).json({ error: `Settlement is already ${existing.status}; payout has been created and cannot be held.` });
    }
    const onHold = hold !== false;
    const [row] = await db.update(settlementsTable)
      .set({ onHold, holdReason: onHold ? (reason ?? "Payout stopped by finance") : null })
      .where(eq(settlementsTable.id, id))
      .returning();

    const msg = onHold
      ? `Stopped payout for settlement #${id} (${row.brandName})${reason ? ` — ${reason}` : ""}`
      : `Resumed payout for settlement #${id} (${row.brandName})`;
    await writeAudit(req, {
      action: onHold ? "SETTLEMENT_HOLD" : "SETTLEMENT_RESUME",
      entityType: "settlement",
      entityId: id,
      changedFields: { onHold, holdReason: row.holdReason },
    });
    await db.insert(activityTable).values({ user: req.user?.name ?? "Finance", action: msg, entityType: "settlement", entityRef: String(id), level: onHold ? "warning" : "info" });

    return res.json(mapSettlement(row));
  } catch (err) {
    req.log.error({ err }, "hold settlement error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

function mapSettlement(r: typeof settlementsTable.$inferSelect) {
  return {
    id: r.id,
    cycle: r.cycle,
    invoiceNumber: r.invoiceNumber,
    companyName: r.companyName,
    brandName: r.brandName,
    bankAccount: r.bankAccount,
    bankIfsc: r.bankIfsc,
    bankName: r.bankName,
    eligibleBags: r.eligibleBags,
    bagIds: JSON.parse(r.bagIds) as string[],
    grossGmv: parseFloat(r.grossGmv),
    brandPromotions: parseFloat(r.brandPromotions),
    marketplacePromotions: parseFloat(r.marketplacePromotions),
    netBeforeCommission: parseFloat(r.netBeforeCommission),
    commission: parseFloat(r.commission),
    commissionRate: parseFloat(r.commissionRate),
    gstOnCommission: parseFloat(r.gstOnCommission),
    tcsAmount: parseFloat(r.tcsAmount),
    tdsAmount: parseFloat(r.tdsAmount),
    mdrCharges: parseFloat(r.mdrCharges),
    mdrRate: parseFloat(r.mdrRate),
    penalty: parseFloat(r.penalty),
    netPayable: parseFloat(r.netPayable),
    carryForward: parseFloat(r.carryForward),
    onHold: r.onHold,
    holdReason: r.holdReason,
    status: r.status,
    financeNotes: r.financeNotes,
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt?.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

export default router;
