import { Router } from "express";
import { db } from "@workspace/db";
import { tcsRecordsTable, tdsRecordsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

router.get("/compliance/tcs-tds", async (req, res) => {
  try {
    const month = (req.query.month as string) || "May";
    const year = parseInt((req.query.year as string) || "2026");

    const [tcsTotals] = await db
      .select({
        tcsAccrued: sql<string>`coalesce(sum(${tcsRecordsTable.tcsAmount}), 0)`,
        tcsPaid: sql<string>`coalesce(sum(${tcsRecordsTable.tcsAmount}) filter (where ${tcsRecordsTable.status} = 'Paid'), 0)`,
      })
      .from(tcsRecordsTable)
      .where(and(eq(tcsRecordsTable.month, month), eq(tcsRecordsTable.year, year)));

    const [tdsTotals] = await db
      .select({
        tdsDeducted: sql<string>`coalesce(sum(${tdsRecordsTable.tdsAmount}), 0)`,
      })
      .from(tdsRecordsTable)
      .where(and(eq(tdsRecordsTable.month, month), eq(tdsRecordsTable.year, year)));

    res.json({
      month,
      year,
      tcsAccrued: parseFloat(tcsTotals?.tcsAccrued ?? "0"),
      tcsPaid: parseFloat(tcsTotals?.tcsPaid ?? "0"),
      tdsDeducted: parseFloat(tdsTotals?.tdsDeducted ?? "0"),
      gstr8Status: "Pending",
      gstr8DueDate: `${year}-06-10`,
      tcsPaymentDue: `${year}-06-07`,
      tdsDepositDue: `${year}-06-07`,
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
    })));
  } catch (err) {
    req.log.error({ err }, "tds records error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/compliance/calendar", async (_req, res) => {
  res.json([
    { id: 1, obligation: "TCS Payment — Apr 2026", section: "Section 52 GST Act", dueDate: "2026-05-07", status: "Filed" },
    { id: 2, obligation: "TDS Deposit — Apr 2026", section: "Section 194-O IT Act", dueDate: "2026-05-07", status: "Filed" },
    { id: 3, obligation: "GSTR-8 Filing — Apr 2026", section: "Section 52(4) GST Act", dueDate: "2026-05-10", status: "Filed" },
    { id: 4, obligation: "TCS Payment — May 2026", section: "Section 52 GST Act", dueDate: "2026-06-07", status: "Upcoming" },
    { id: 5, obligation: "TDS Deposit — May 2026", section: "Section 194-O IT Act", dueDate: "2026-06-07", status: "Upcoming" },
    { id: 6, obligation: "GSTR-8 Filing — May 2026", section: "Section 52(4) GST Act", dueDate: "2026-06-10", status: "Upcoming" },
    { id: 7, obligation: "TCS Payment — Jun 2026", section: "Section 52 GST Act", dueDate: "2026-07-07", status: "Future" },
    { id: 8, obligation: "TDS Deposit — Jun 2026", section: "Section 194-O IT Act", dueDate: "2026-07-07", status: "Future" },
  ]);
});

export default router;
