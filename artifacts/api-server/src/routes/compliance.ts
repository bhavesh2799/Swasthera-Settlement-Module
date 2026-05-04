import { Router } from "express";
import { db } from "@workspace/db";
import { tcsRecordsTable, tdsRecordsTable, bagsTable, activityTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

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
      })
      .from(tdsRecordsTable)
      .where(and(eq(tdsRecordsTable.month, month), eq(tdsRecordsTable.year, year)));

    // Compute next due dates based on month/year
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

router.get("/compliance/tcs-records", async (req, res) => {
  try {
    const month = (req.query.month as string) || "May";
    const year = parseInt((req.query.year as string) || "2026");
    const rows = await db.select().from(tcsRecordsTable)
      .where(and(eq(tcsRecordsTable.month, month), eq(tcsRecordsTable.year, year)));
    res.json(rows.map((r) => ({
      id: r.id,
      stateGstin: r.stateGstin,
      stateCode: r.stateCode,
      stateName: r.stateName,
      brandName: r.brandName,
      taxableSupply: parseFloat(r.taxableSupply),
      tcsRate: parseFloat(r.tcsRate),
      tcsAmount: parseFloat(r.tcsAmount),
      status: r.status,
      paymentDueDate: r.paymentDueDate,
      isReversal: r.isReversal,
      reversalReason: r.reversalReason,
      originalBagId: r.originalBagId,
    })));
  } catch (err) {
    req.log.error({ err }, "tcs records error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/compliance/tds-records", async (req, res) => {
  try {
    const month = (req.query.month as string) || "May";
    const year = parseInt((req.query.year as string) || "2026");
    const rows = await db.select().from(tdsRecordsTable)
      .where(and(eq(tdsRecordsTable.month, month), eq(tdsRecordsTable.year, year)));
    res.json(rows.map((r) => ({
      id: r.id,
      companyName: r.companyName,
      tan: r.tan,
      grossPayment: parseFloat(r.grossPayment),
      tdsRate: parseFloat(r.tdsRate),
      tdsAmount: parseFloat(r.tdsAmount),
      netPaid: parseFloat(r.netPaid),
      status: r.status,
      isReversal: r.isReversal,
      reversalReason: r.reversalReason,
      originalBagId: r.originalBagId,
    })));
  } catch (err) {
    req.log.error({ err }, "tds records error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// TCS/TDS reversal — BRD §5.4: triggered by return_bag_delivered, RTO, or post-invoice cancellation
router.post("/compliance/reversal", async (req, res) => {
  try {
    const { bagId, reason, month, year } = req.body as {
      bagId: string;
      reason: string;
      month: string;
      year: number;
    };

    if (!bagId || !reason || !month || !year) {
      return res.status(400).json({ error: "bagId, reason, month, and year are required" });
    }

    // Fetch the bag
    const [bag] = await db.select().from(bagsTable).where(eq(bagsTable.bagId, bagId));
    if (!bag) return res.status(404).json({ error: "Bag not found" });

    if (parseFloat(bag.tcsAmount) === 0 && parseFloat(bag.tdsAmount) === 0) {
      return res.status(400).json({ error: "No TCS/TDS accrual found for this bag to reverse" });
    }

    const paymentDueDate = (() => {
      const monthIndex = ["January","February","March","April","May","June","July","August","September","October","November","December"].indexOf(month);
      const dueYear = monthIndex === 11 ? year + 1 : year;
      const dueMonth = (monthIndex + 2).toString().padStart(2, "0");
      return `${dueYear}-${dueMonth}-07`;
    })();

    // Find a TCS record for this month to reference state details
    const [origTcs] = await db.select().from(tcsRecordsTable)
      .where(and(eq(tcsRecordsTable.month, month), eq(tcsRecordsTable.year, year), eq(tcsRecordsTable.brandName, bag.brandName)));

    // Insert reversal TCS entry (negative amount)
    if (origTcs || parseFloat(bag.tcsAmount) > 0) {
      await db.insert(tcsRecordsTable).values({
        month,
        year,
        stateGstin: origTcs?.stateGstin ?? bag.stateGstin,
        stateCode: origTcs?.stateCode ?? bag.stateCode,
        stateName: origTcs?.stateName ?? bag.stateCode,
        brandName: bag.brandName,
        taxableSupply: String(-parseFloat(bag.esp)),
        tcsRate: "1.00",
        tcsAmount: String(-parseFloat(bag.tcsAmount)),
        status: "Accrued",
        paymentDueDate,
        isReversal: true,
        reversalReason: reason,
        originalBagId: bagId,
      });
    }

    // Find TDS record
    const [origTds] = await db.select().from(tdsRecordsTable)
      .where(and(eq(tdsRecordsTable.month, month), eq(tdsRecordsTable.year, year)));

    // Insert reversal TDS entry
    if (origTds || parseFloat(bag.tdsAmount) > 0) {
      await db.insert(tdsRecordsTable).values({
        month,
        year,
        companyName: origTds?.companyName ?? bag.brandName,
        tan: origTds?.tan ?? "DELN00000A",
        grossPayment: String(-parseFloat(bag.esp)),
        tdsRate: "1.00",
        tdsAmount: String(-parseFloat(bag.tdsAmount)),
        netPaid: String(parseFloat(bag.tdsAmount)), // amount refunded
        status: "Pending",
        isReversal: true,
        reversalReason: reason,
        originalBagId: bagId,
      });
    }

    // Update bag to on_hold / excluded
    await db.update(bagsTable)
      .set({ eligibility: "on_hold", omsState: "return_bag_delivered" })
      .where(eq(bagsTable.bagId, bagId));

    await db.insert(activityTable).values({
      user: "System",
      action: `TCS/TDS reversal logged for bag ${bagId} — ${reason}`,
      entityType: "compliance",
      entityRef: bagId,
      level: "warning",
    });

    res.json({
      success: true,
      message: `TCS reversal of ₹${bag.tcsAmount} and TDS reversal of ₹${bag.tdsAmount} logged for bag ${bagId} in ${month} ${year}.`,
      tcsReversed: parseFloat(bag.tcsAmount),
      tdsReversed: parseFloat(bag.tdsAmount),
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

export default router;
