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
      paymentRef: r.paymentRef,
      paymentDate: r.paymentDate,
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
      depositRef: r.depositRef,
      depositDate: r.depositDate,
      isReversal: r.isReversal,
      reversalReason: r.reversalReason,
      originalBagId: r.originalBagId,
    })));
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

    const result = filteredBags.map((b) => ({
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
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "order breakdown error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// TCS/TDS reversal — BRD §5.4
router.post("/compliance/reversal", async (req, res) => {
  try {
    const { bagId, reason, month, year } = req.body as { bagId: string; reason: string; month: string; year: number };
    if (!bagId || !reason || !month || !year) {
      return res.status(400).json({ error: "bagId, reason, month, and year are required" });
    }

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

    const [origTcs] = await db.select().from(tcsRecordsTable)
      .where(and(eq(tcsRecordsTable.month, month), eq(tcsRecordsTable.year, year), eq(tcsRecordsTable.brandName, bag.brandName)));

    if (origTcs || parseFloat(bag.tcsAmount) > 0) {
      await db.insert(tcsRecordsTable).values({
        month, year,
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

    const [origTds] = await db.select().from(tdsRecordsTable)
      .where(and(eq(tdsRecordsTable.month, month), eq(tdsRecordsTable.year, year)));

    if (origTds || parseFloat(bag.tdsAmount) > 0) {
      await db.insert(tdsRecordsTable).values({
        month, year,
        companyName: origTds?.companyName ?? bag.brandName,
        tan: origTds?.tan ?? "DELN00000A",
        grossPayment: String(-parseFloat(bag.esp)),
        tdsRate: "1.00",
        tdsAmount: String(-parseFloat(bag.tdsAmount)),
        netPaid: String(parseFloat(bag.tdsAmount)),
        status: "Pending",
        isReversal: true,
        reversalReason: reason,
        originalBagId: bagId,
      });
    }

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
