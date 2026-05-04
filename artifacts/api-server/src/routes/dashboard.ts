import { Router } from "express";
import { db } from "@workspace/db";
import { onboardingsTable, settlementsTable, payoutsTable, bagsTable, tcsRecordsTable, tdsRecordsTable } from "@workspace/db";
import { sql, eq, and } from "drizzle-orm";

const router = Router();

const ACTIVE_CYCLE = "MAY-2026-C1";

router.get("/dashboard/summary", async (req, res) => {
  try {
    const [bagTotals] = await db
      .select({
        grossGmv: sql<string>`coalesce(sum(${bagsTable.esp}), 0)`,
        totalTcs: sql<string>`coalesce(sum(${bagsTable.tcsAmount}), 0)`,
        totalTds: sql<string>`coalesce(sum(${bagsTable.tdsAmount}), 0)`,
      })
      .from(bagsTable)
      .where(eq(bagsTable.cycle, ACTIVE_CYCLE));

    const [settlementTotals] = await db
      .select({
        netPayable: sql<string>`coalesce(sum(${settlementsTable.netPayable}), 0)`,
        commission: sql<string>`coalesce(sum(${settlementsTable.commission}), 0)`,
        pendingApprovals: sql<string>`count(*) filter (where ${settlementsTable.status} = 'PENDING_APPROVAL')`,
      })
      .from(settlementsTable)
      .where(eq(settlementsTable.cycle, ACTIVE_CYCLE));

    const [payoutTotals] = await db
      .select({
        pendingPayouts: sql<string>`coalesce(sum(${payoutsTable.amount}) filter (where ${payoutsTable.status} = 'INITIATED'), 0)`,
      })
      .from(payoutsTable);

    const [brandCount] = await db
      .select({ activeBrands: sql<string>`count(*)` })
      .from(onboardingsTable)
      .where(eq(onboardingsTable.status, "ACTIVE"));

    res.json({
      cycle: ACTIVE_CYCLE,
      cycleLabel: "1–15 May 2026",
      grossGmv: parseFloat(bagTotals?.grossGmv ?? "0"),
      netPayable: parseFloat(settlementTotals?.netPayable ?? "0"),
      commissionEarned: parseFloat(settlementTotals?.commission ?? "0"),
      tcsAccrued: parseFloat(bagTotals?.totalTcs ?? "0"),
      tdsDeducted: parseFloat(bagTotals?.totalTds ?? "0"),
      pendingPayouts: parseFloat(payoutTotals?.pendingPayouts ?? "0"),
      pendingApprovals: parseInt(settlementTotals?.pendingApprovals ?? "0"),
      activeBrands: parseInt(brandCount?.activeBrands ?? "0"),
    });
  } catch (err) {
    req.log.error({ err }, "dashboard summary error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/brand-settlements", async (req, res) => {
  try {
    const rows = await db
      .select({
        id: settlementsTable.id,
        companyName: settlementsTable.companyName,
        brandName: settlementsTable.brandName,
        eligibleBags: settlementsTable.eligibleBags,
        gmv: settlementsTable.grossGmv,
        commission: settlementsTable.commission,
        tcs: settlementsTable.tcsAmount,
        tds: settlementsTable.tdsAmount,
        netPayable: settlementsTable.netPayable,
        status: settlementsTable.status,
      })
      .from(settlementsTable)
      .where(eq(settlementsTable.cycle, ACTIVE_CYCLE))
      .limit(50);

    res.json(
      rows.map((r) => ({
        id: r.id,
        companyName: r.companyName,
        brandName: r.brandName,
        eligibleBags: r.eligibleBags,
        gmv: parseFloat(r.gmv),
        commission: parseFloat(r.commission),
        tcs: parseFloat(r.tcs),
        tds: parseFloat(r.tds),
        netPayable: parseFloat(r.netPayable),
        status: r.status,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "brand settlements error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
