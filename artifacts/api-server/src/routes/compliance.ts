import { Router } from "express";
import { db } from "@workspace/db";
import { tcsRecordsTable, tdsRecordsTable, bagsTable, activityTable, settlementsTable, payoutsTable, onboardingsTable, settlementAdjustmentsTable } from "@workspace/db";
import { eq, and, sql, inArray, like } from "drizzle-orm";
import { reversalDeadline, isPastReversalDeadline, canReverseTDS, transactionPeriod } from "../services/tdsReversalService";
import { authorize } from "../middlewares/rbac";

const router = Router();

router.get("/compliance/tcs-tds", async (req, res) => {
  try {
    const month = (req.query.month as string) || "May";
    const year = parseInt((req.query.year as string) || "2026");

    const [tcsTotals] = await db
      .select({
        tcsAccrued: sql<string>`coalesce(sum(case when not ${tcsRecordsTable.isReversal} then ${tcsRecordsTable.tcsAmount} else 0 end), 0)`,
        tcsReversed: sql<string>`coalesce(sum(case when ${tcsRecordsTable.isReversal} then abs(${tcsRecordsTable.tcsAmount}) else 0 end), 0)`,
        tcsNet: sql<string>`coalesce(sum(${tcsRecordsTable.tcsAmount}), 0)`,
        tcsPaid: sql<string>`coalesce(sum(${tcsRecordsTable.tcsAmount}) filter (where ${tcsRecordsTable.status} = 'Paid'), 0)`,
      })
      .from(tcsRecordsTable)
      .where(and(eq(tcsRecordsTable.month, month), eq(tcsRecordsTable.year, year)));

    const [tdsTotals] = await db
      .select({
        tdsDeducted: sql<string>`coalesce(sum(case when not ${tdsRecordsTable.isReversal} then ${tdsRecordsTable.tdsAmount} else 0 end), 0)`,
        tdsReversed: sql<string>`coalesce(sum(case when ${tdsRecordsTable.isReversal} then abs(${tdsRecordsTable.tdsAmount}) else 0 end), 0)`,
        tdsNet: sql<string>`coalesce(sum(${tdsRecordsTable.tdsAmount}), 0)`,
        tdsDeposited: sql<string>`coalesce(sum(${tdsRecordsTable.tdsAmount}) filter (where ${tdsRecordsTable.status} = 'Deposited'), 0)`,
      })
      .from(tdsRecordsTable)
      .where(and(eq(tdsRecordsTable.month, month), eq(tdsRecordsTable.year, year)));

    const monthIndex = ["January","February","March","April","May","June","July","August","September","October","November","December"].indexOf(month);
    const dueYear = monthIndex === 11 ? year + 1 : year;
    const dueMonth = (monthIndex + 2).toString().padStart(2, "0");

    res.json({
      month,
      year,
      tcsAccrued: parseFloat(tcsTotals?.tcsAccrued ?? "0"),
      tcsReversed: parseFloat(tcsTotals?.tcsReversed ?? "0"),
      tcsNet: parseFloat(tcsTotals?.tcsNet ?? "0"),
      tcsPaid: parseFloat(tcsTotals?.tcsPaid ?? "0"),
      tdsDeducted: parseFloat(tdsTotals?.tdsDeducted ?? "0"),
      tdsReversed: parseFloat(tdsTotals?.tdsReversed ?? "0"),
      tdsNet: parseFloat(tdsTotals?.tdsNet ?? "0"),
      tdsDeposited: parseFloat(tdsTotals?.tdsDeposited ?? "0"),
      gstr8Status: "Pending",
      gstr8DueDate: `${dueYear}-${dueMonth}-10`,
      tcsPaymentDue: `${dueYear}-${dueMonth}-07`,
      tdsDepositDue: `${dueYear}-${dueMonth}-07`,
    });
  } catch (err) {
    req.log.error({ err }, "tcs-tds summary error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Shared helper — cycle prefix from month name + year (e.g. "May" 2026 → "MAY-2026")
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_ABBREV = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
function cyclePrefix(month: string, year: number): string {
  const idx = MONTH_NAMES.indexOf(month);
  return idx >= 0 ? `${MONTH_ABBREV[idx]}-${year}` : `${month.toUpperCase().slice(0, 3)}-${year}`;
}

// GET /compliance/tcs-records — brand + bank level aggregation.
// Returns one row per brand: bank account, bag count for the cycle, total TCS accrued.
// TCS has no reversal mechanism (reversal does not apply per BRD); only TDS is reversible.
router.get("/compliance/tcs-records", async (req, res) => {
  try {
    const month = (req.query.month as string) || "May";
    const year = parseInt((req.query.year as string) || "2026");

    const [rawRecords, allOnboardings, cycleBags] = await Promise.all([
      db.select().from(tcsRecordsTable)
        .where(and(eq(tcsRecordsTable.month, month), eq(tcsRecordsTable.year, year))),
      db.select().from(onboardingsTable),
      db.select({ brandId: bagsTable.brandId }).from(bagsTable)
        .where(like(bagsTable.cycle, `${cyclePrefix(month, year)}%`)),
    ]);

    const bagCountByBrand: Record<number, number> = {};
    for (const b of cycleBags) bagCountByBrand[b.brandId] = (bagCountByBrand[b.brandId] ?? 0) + 1;

    // Group raw records by brandName; non-reversal only (TCS has no reversal)
    const grouped: Record<string, typeof rawRecords> = {};
    for (const r of rawRecords) {
      if (!r.isReversal) {
        (grouped[r.brandName] ??= []).push(r);
      }
    }

    const result = Object.entries(grouped).map(([brandName, records]) => {
      const ob = allOnboardings.find((o) => o.brandName === brandName);
      const first = records[0];
      return {
        id: first.id,
        brandName,
        companyName: ob?.companyName ?? "",
        bankAccount: ob?.bankAccount ?? "",
        bankIfsc: ob?.bankIfsc ?? "",
        bankName: ob?.bankName ?? "",
        bagCount: ob ? (bagCountByBrand[ob.id] ?? 0) : 0,
        grossGmv: Math.round(records.reduce((s, r) => s + parseFloat(r.taxableSupply), 0) * 100) / 100,
        tcsRate: parseFloat(first.tcsRate),
        tcsAmount: Math.round(records.reduce((s, r) => s + parseFloat(r.tcsAmount), 0) * 100) / 100,
        status: first.status,
        paymentDueDate: first.paymentDueDate,
        paymentRef: first.paymentRef,
        paymentDate: first.paymentDate,
      };
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "tcs records error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /compliance/tds-records — brand + bank level aggregation.
// Aggregates forward (deducted) and reversal entries per brand.
// TDS reversal applies when the deposit deadline (7th of following month) has not passed.
router.get("/compliance/tds-records", async (req, res) => {
  try {
    const month = (req.query.month as string) || "May";
    const year = parseInt((req.query.year as string) || "2026");

    const [rawRecords, allOnboardings, cycleBags] = await Promise.all([
      db.select().from(tdsRecordsTable)
        .where(and(eq(tdsRecordsTable.month, month), eq(tdsRecordsTable.year, year))),
      db.select().from(onboardingsTable),
      db.select({ brandId: bagsTable.brandId }).from(bagsTable)
        .where(like(bagsTable.cycle, `${cyclePrefix(month, year)}%`)),
    ]);

    const bagCountByBrand: Record<number, number> = {};
    for (const b of cycleBags) bagCountByBrand[b.brandId] = (bagCountByBrand[b.brandId] ?? 0) + 1;

    // Group by companyName (TDS is tracked at company/TAN level)
    const grouped: Record<string, typeof rawRecords> = {};
    for (const r of rawRecords) (grouped[r.companyName] ??= []).push(r);

    const result = Object.entries(grouped).map(([companyName, records]) => {
      const nonReversal = records.filter((r) => !r.isReversal);
      const reversals = records.filter((r) => r.isReversal);
      const ob = allOnboardings.find((o) => o.companyName === companyName);
      const first = nonReversal[0] ?? records[0];
      const tdsAmount = Math.round(nonReversal.reduce((s, r) => s + parseFloat(r.tdsAmount), 0) * 100) / 100;
      const tdsReversed = Math.round(reversals.reduce((s, r) => s + Math.abs(parseFloat(r.tdsAmount)), 0) * 100) / 100;
      return {
        id: first.id,
        brandName: ob?.brandName ?? companyName,
        companyName,
        tan: first.tan ?? "",
        bankAccount: ob?.bankAccount ?? "",
        bankIfsc: ob?.bankIfsc ?? "",
        bankName: ob?.bankName ?? "",
        bagCount: ob ? (bagCountByBrand[ob.id] ?? 0) : 0,
        grossPayment: Math.round(nonReversal.reduce((s, r) => s + parseFloat(r.grossPayment), 0) * 100) / 100,
        tdsRate: parseFloat(first.tdsRate),
        tdsAmount,
        tdsReversed,
        reversalCount: reversals.length,
        netTds: Math.round((tdsAmount - tdsReversed) * 100) / 100,
        status: first.status,
        depositRef: first.depositRef,
        depositDate: first.depositDate,
      };
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "tds records error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update TCS record status — mark as Paid/Filed
router.put("/compliance/tcs-records/:id", async (req, res) => {
  try {
    const { status, paymentRef, paymentDate } = req.body as { status?: string; paymentRef?: string; paymentDate?: string };
    const updates: Partial<typeof tcsRecordsTable.$inferInsert> = {};
    if (status) updates.status = status as "Accrued" | "Paid" | "Filed";
    if (paymentRef) updates.paymentRef = paymentRef;
    if (paymentDate) updates.paymentDate = paymentDate;

    const [row] = await db.update(tcsRecordsTable).set(updates)
      .where(eq(tcsRecordsTable.id, parseInt(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });

    await db.insert(activityTable).values({
      user: "Finance Team",
      action: `TCS record #${row.id} marked as ${status ?? "updated"} — ${paymentRef ? `Ref: ${paymentRef}` : ""}`,
      entityType: "compliance",
      entityRef: String(row.id),
      level: "success",
    });

    res.json({ id: row.id, status: row.status, paymentRef: row.paymentRef, paymentDate: row.paymentDate });
  } catch (err) {
    req.log.error({ err }, "update tcs record error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update TDS record status — mark as Deposited/Filed
router.put("/compliance/tds-records/:id", async (req, res) => {
  try {
    const { status, depositRef, depositDate } = req.body as { status?: string; depositRef?: string; depositDate?: string };
    const updates: Partial<typeof tdsRecordsTable.$inferInsert> = {};
    if (status) updates.status = status as "Pending" | "Deposited" | "Filed";
    if (depositRef) updates.depositRef = depositRef;
    if (depositDate) updates.depositDate = depositDate;

    const [row] = await db.update(tdsRecordsTable).set(updates)
      .where(eq(tdsRecordsTable.id, parseInt(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });

    await db.insert(activityTable).values({
      user: "Finance Team",
      action: `TDS record #${row.id} marked as ${status ?? "updated"} — ${depositRef ? `Ref: ${depositRef}` : ""}`,
      entityType: "compliance",
      entityRef: String(row.id),
      level: "success",
    });

    res.json({ id: row.id, status: row.status, depositRef: row.depositRef, depositDate: row.depositDate });
  } catch (err) {
    req.log.error({ err }, "update tds record error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Order-level TCS/TDS breakdown — per bag for a given month/year
router.get("/compliance/order-breakdown", async (req, res) => {
  try {
    const month = (req.query.month as string) || "May";
    const year = parseInt((req.query.year as string) || "2026");

    // Map month name to month number
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const monthNum = (monthNames.indexOf(month) + 1).toString().padStart(2, "0");
    const yearStr = String(year);

    // Fetch bags where deliveryDate is in this month/year
    const allBags = await db.select().from(bagsTable);
    const filteredBags = allBags.filter((b) => {
      const d = b.deliveryDate ?? b.invoiceDate ?? "";
      return d.startsWith(`${yearStr}-${monthNum}`);
    });

    const result = filteredBags.map((b) => {
      const txnDate = b.invoiceDate ? new Date(b.invoiceDate) : new Date(b.createdAt);
      return {
        bagId: b.bagId,
        orderId: b.orderId,
        brandId: b.brandId,
        brandName: b.brandName,
        sku: b.sku,
        esp: parseFloat(b.esp) * b.qty,
        deliveryDate: b.deliveryDate ?? "",
        windowExpiryDate: b.windowExpiryDate ?? "",
        tcsAmount: parseFloat(b.tcsAmount),
        tdsAmount: parseFloat(b.tdsAmount),
        eligibility: b.eligibility,
        omsState: b.omsState,
        isReturned: b.eligibility === "on_hold" || b.omsState?.includes("return"),
        cycle: b.cycle,
        reversalStatus: b.reversalStatus ?? null,
        reversalDeadline: reversalDeadline(txnDate),
        reversalDeadlinePast: isPastReversalDeadline(txnDate),
      };
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "order breakdown error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// TDS-only reversal — BRD §5.4
// TCS reversal does not apply (marketplace remits TCS directly to govt; no reversal
// mechanism exists for TCS). Only TDS is reversible — and only before the 7th-of-
// following-month deposit deadline. Past deadline: a carry-forward adjustment is
// written for the next settlement cycle and 422 is returned.
router.post("/compliance/reversal", authorize(["backend", "admin"]), async (req, res) => {
  try {
    const { bagId, reason, month, year } = req.body as { bagId: string; reason: string; month: string; year: number };
    if (!bagId || !reason || !month || !year) {
      return res.status(400).json({ error: "bagId, reason, month, and year are required" });
    }

    const [bag] = await db.select().from(bagsTable).where(eq(bagsTable.bagId, bagId));
    if (!bag) return res.status(404).json({ error: "Bag not found" });

    const tdsAmt = parseFloat(bag.tdsAmount);
    if (tdsAmt === 0) {
      return res.status(400).json({ error: "No TDS accrual found for this bag to reverse" });
    }

    // Eligibility derives strictly from bag data — client-supplied month/year are
    // only used for display labels and must not influence the statutory deadline check.
    const txnDate = bag.invoiceDate ? new Date(bag.invoiceDate) : new Date(bag.createdAt);
    const deadline = reversalDeadline(txnDate);
    const reversalEligible = canReverseTDS(txnDate, new Date());
    const { month: txnMonth, year: txnYear } = transactionPeriod(txnDate);

    if (!reversalEligible) {
      // TDS deposit deadline has passed — write a carry-forward adjustment for next
      // settlement, and return 422 so the caller shows the right UI message.
      await db.insert(settlementAdjustmentsTable).values({
        onboardingId: bag.brandId,
        cycle: bag.cycle,
        bagId: bag.bagId,
        adjustmentType: "TDS_CARRY_FORWARD",
        amount: tdsAmt.toFixed(2),
        reason: `TDS deposit deadline ${deadline} passed — carried forward from compliance reversal (${reason})`,
      });
      await db.insert(activityTable).values({
        user: req.user?.name ?? "System",
        action: `TDS already deposited for ${bagId} (deadline ${deadline} passed) — recorded as carry-forward, not reversed (${reason})`,
        entityType: "compliance",
        entityRef: bagId,
        level: "warning",
      });
      return res.status(422).json({
        success: false,
        reversalEligible: false,
        deadline,
        message: `Cannot reverse TDS for bag ${bagId}: the deposit deadline (${deadline}) has already passed. TDS of ₹${tdsAmt.toFixed(2)} recorded as a carry-forward adjustment for the next settlement cycle.`,
        tdsCarryForward: tdsAmt,
      });
    }

    // Deadline has not passed — insert a negative TDS reversal entry.
    const [origTds] = await db.select().from(tdsRecordsTable)
      .where(and(eq(tdsRecordsTable.month, txnMonth), eq(tdsRecordsTable.year, txnYear)));

    await db.insert(tdsRecordsTable).values({
      month: txnMonth, year: txnYear,
      companyName: origTds?.companyName ?? bag.brandName,
      tan: origTds?.tan ?? "DELN00000A",
      grossPayment: String(-parseFloat(bag.esp)),
      tdsRate: "1.00",
      tdsAmount: String(-tdsAmt),
      netPaid: String(tdsAmt),
      status: "Pending",
      isReversal: true,
      reversalReason: reason,
      originalBagId: bagId,
    });

    await db.update(bagsTable)
      .set({ eligibility: "on_hold", omsState: "return_bag_delivered" })
      .where(eq(bagsTable.bagId, bagId));

    await db.insert(activityTable).values({
      user: req.user?.name ?? "System",
      action: `TDS reversal logged for bag ${bagId} (deadline ${deadline}) — ${reason}`,
      entityType: "compliance",
      entityRef: bagId,
      level: "warning",
    });

    res.json({
      success: true,
      reversalEligible: true,
      deadline,
      message: `TDS reversal of ₹${tdsAmt.toFixed(2)} logged for bag ${bagId}.`,
      tdsReversed: tdsAmt,
    });
  } catch (err) {
    req.log.error({ err }, "compliance reversal error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/compliance/calendar", async (_req, res) => {
  res.json([
    { id: 1, obligation: "TCS Payment — Apr 2026", section: "Section 52 GST Act", dueDate: "2026-05-07", status: "Filed" },
    { id: 2, obligation: "TDS Deposit — Apr 2026", section: "Section 194-O IT Act", dueDate: "2026-05-07", status: "Filed" },
    { id: 3, obligation: "GSTR-8 Filing — Apr 2026", section: "Section 52(4) GST Act", dueDate: "2026-05-10", status: "Filed" },
    { id: 4, obligation: "Form 27EQ — Q4 FY25-26", section: "Section 52 GST Act", dueDate: "2026-04-15", status: "Filed" },
    { id: 5, obligation: "Form 26Q — Q4 FY25-26", section: "Section 194-O IT Act", dueDate: "2026-04-30", status: "Filed" },
    { id: 6, obligation: "TCS Payment — May 2026", section: "Section 52 GST Act", dueDate: "2026-06-07", status: "Upcoming" },
    { id: 7, obligation: "TDS Deposit — May 2026", section: "Section 194-O IT Act", dueDate: "2026-06-07", status: "Upcoming" },
    { id: 8, obligation: "GSTR-8 Filing — May 2026", section: "Section 52(4) GST Act", dueDate: "2026-06-10", status: "Upcoming" },
    { id: 9, obligation: "Form 16A to Brands — Q1 FY26-27", section: "Section 194-O IT Act", dueDate: "2026-07-15", status: "Upcoming" },
    { id: 10, obligation: "TCS Payment — Jun 2026", section: "Section 52 GST Act", dueDate: "2026-07-07", status: "Future" },
    { id: 11, obligation: "TDS Deposit — Jun 2026", section: "Section 194-O IT Act", dueDate: "2026-07-07", status: "Future" },
    { id: 12, obligation: "Form 27EQ — Q1 FY26-27", section: "Section 52 GST Act", dueDate: "2026-07-15", status: "Future" },
    { id: 13, obligation: "Form 26Q — Q1 FY26-27", section: "Section 194-O IT Act", dueDate: "2026-07-31", status: "Future" },
  ]);
});

// Running ledger — spec MODULE 4. Every financial line item for a brand
// (settlement credits + payout debits) in chronological order with a running
// balance representing the amount outstanding to the brand.
interface LedgerEntry {
  date: string;
  type: "SETTLEMENT" | "PAYOUT";
  cycle: string;
  ref: string;
  description: string;
  amount: number; // signed: + credit to brand, − paid out
  runningBalance: number;
}

async function buildLedger(
  brandId: number,
  opts: { from?: string; to?: string; type?: string; cycle?: string } = {},
): Promise<{ brand: { onboardingId: number; companyName: string; brandName: string } | null; entries: LedgerEntry[]; closingBalance: number }> {
  const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, brandId));

  const settlements = await db.select().from(settlementsTable).where(eq(settlementsTable.onboardingId, brandId));
  const settlementIds = settlements.map((s) => s.id);
  const payouts = settlementIds.length
    ? await db.select().from(payoutsTable).where(inArray(payoutsTable.settlementId, settlementIds))
    : [];

  const raw: Omit<LedgerEntry, "runningBalance">[] = [];
  for (const s of settlements) {
    raw.push({
      date: s.createdAt.toISOString(),
      type: "SETTLEMENT",
      cycle: s.cycle,
      ref: `STMT-${s.id}`,
      description: `Settlement computed (${s.eligibleBags} bags, net payable)`,
      amount: parseFloat(s.netPayable),
    });
  }
  for (const p of payouts) {
    // Only post a debit once money has actually left — i.e. the payout is
    // SETTLED (UTR generated). Pending/initiated payouts must not reduce the
    // outstanding balance owed to the brand.
    if (p.status !== "SETTLED") continue;
    const when = p.settledAt ?? p.payoutApprovedAt ?? p.initiatedAt;
    raw.push({
      date: when.toISOString(),
      type: "PAYOUT",
      cycle: p.cycle,
      ref: p.utr ?? p.paymentRef,
      description: `Payout settled${p.utr ? ` · UTR ${p.utr}` : ""} via ${p.transferMode}`,
      amount: -parseFloat(p.amount),
    });
  }

  let filtered = raw;
  if (opts.from) filtered = filtered.filter((e) => e.date >= opts.from!);
  if (opts.to) filtered = filtered.filter((e) => e.date <= opts.to! + "T23:59:59.999Z");
  if (opts.type && opts.type !== "ALL") filtered = filtered.filter((e) => e.type === opts.type);
  if (opts.cycle && opts.cycle !== "ALL") filtered = filtered.filter((e) => e.cycle === opts.cycle);

  // Chronological; on a tie a SETTLEMENT (credit) precedes its PAYOUT (debit).
  const rank = (t: string) => (t === "SETTLEMENT" ? 0 : 1);
  filtered.sort((a, b) => a.date.localeCompare(b.date) || rank(a.type) - rank(b.type));

  let balance = 0;
  const entries: LedgerEntry[] = filtered.map((e) => {
    balance = Math.round((balance + e.amount) * 100) / 100;
    return { ...e, runningBalance: balance };
  });

  return {
    brand: ob ? { onboardingId: ob.id, companyName: ob.companyName, brandName: ob.brandName } : null,
    entries,
    closingBalance: balance,
  };
}

router.get("/compliance/ledger/:brandId", async (req, res) => {
  try {
    const brandId = parseInt(String(req.params.brandId));
    if (Number.isNaN(brandId)) return res.status(400).json({ error: "Invalid brandId" });
    const { from, to, type, cycle } = req.query as { from?: string; to?: string; type?: string; cycle?: string };
    const ledger = await buildLedger(brandId, { from, to, type, cycle });
    if (!ledger.brand) return res.status(404).json({ error: "Brand not found" });
    res.json(ledger);
  } catch (err) {
    req.log.error({ err }, "ledger error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/compliance/ledger/:brandId/export", async (req, res) => {
  try {
    const brandId = parseInt(String(req.params.brandId));
    if (Number.isNaN(brandId)) return res.status(400).json({ error: "Invalid brandId" });
    const { from, to, type, cycle } = req.query as { from?: string; to?: string; type?: string; cycle?: string };
    const ledger = await buildLedger(brandId, { from, to, type, cycle });
    if (!ledger.brand) return res.status(404).json({ error: "Brand not found" });

    const header = ["Date", "Type", "Cycle", "Reference", "Description", "Amount (INR)", "Running Balance (INR)"];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      header.map(esc).join(","),
      ...ledger.entries.map((e) =>
        [
          e.date.split("T")[0],
          e.type,
          e.cycle,
          e.ref,
          e.description,
          e.amount.toFixed(2),
          e.runningBalance.toFixed(2),
        ].map(esc).join(","),
      ),
    ];
    const csv = lines.join("\n");
    const fname = `ledger-${ledger.brand.brandName.replace(/[^a-z0-9]+/gi, "-")}-${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(csv);
  } catch (err) {
    req.log.error({ err }, "ledger export error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
