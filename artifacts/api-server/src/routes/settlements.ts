import { Router } from "express";
import { db } from "@workspace/db";
import { settlementsTable, onboardingsTable, bagsTable, payoutsTable, activityTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

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
      companyName: r.companyName,
      brandName: r.brandName,
      eligibleBags: r.eligibleBags,
      grossGmv: parseFloat(r.grossGmv),
      netPayable: parseFloat(r.netPayable),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "list settlements error");
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

    const grossGmv = eligibleBags.reduce((s, b) => s + parseFloat(b.esp) * b.qty, 0);
    // BRD §7 waterfall: brand-funded promotions reduce brand payout; marketplace-funded do NOT
    const brandPromotions = 0;
    const marketplacePromotions = 0;
    const netBeforeCommission = grossGmv - brandPromotions; // marketplace NOT deducted (BRD §7 note)
    const commissionRate = parseFloat(ob.commissionRate);
    const commission = netBeforeCommission * commissionRate / 100;
    const gstOnCommission = commission * 0.18;
    const tcsAmount = eligibleBags.reduce((s, b) => s + parseFloat(b.tcsAmount), 0);
    const tdsAmount = eligibleBags.reduce((s, b) => s + parseFloat(b.tdsAmount), 0);
    const mdrCharges = 0;
    const penalty = 0;
    const netPayable = netBeforeCommission - commission - gstOnCommission - tcsAmount - tdsAmount - mdrCharges - penalty;

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
      grossGmv: String(grossGmv.toFixed(2)),
      brandPromotions: "0",
      marketplacePromotions: "0",
      netBeforeCommission: String(netBeforeCommission.toFixed(2)),
      commission: String(commission.toFixed(2)),
      commissionRate: ob.commissionRate,
      gstOnCommission: String(gstOnCommission.toFixed(2)),
      tcsAmount: String(tcsAmount.toFixed(2)),
      tdsAmount: String(tdsAmount.toFixed(2)),
      mdrCharges: "0",
      penalty: "0",
      netPayable: String(netPayable.toFixed(2)),
      status: "PENDING_APPROVAL",
    }).returning();

    await db.insert(activityTable).values({ user: "Anjali Patel", action: `Computed settlement for ${ob.brandName} — ${cycle}`, entityType: "settlement", entityRef: String(row.id), level: "info" });

    res.status(201).json(mapSettlement(row));
  } catch (err) {
    req.log.error({ err }, "create settlement error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/settlements/:id", async (req, res) => {
  try {
    const [row] = await db.select().from(settlementsTable).where(eq(settlementsTable.id, parseInt(req.params.id)));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(mapSettlement(row));
  } catch (err) {
    req.log.error({ err }, "get settlement error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/settlements/:id/approve", async (req, res) => {
  try {
    const { financeNotes, approvedBy } = req.body as { financeNotes?: string; approvedBy?: string };
    const checker = approvedBy || "Rajesh Kumar";
    const [existing] = await db.select().from(settlementsTable).where(eq(settlementsTable.id, parseInt(req.params.id)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const [row] = await db.update(settlementsTable)
      .set({ status: "APPROVED", financeNotes, approvedBy: checker, approvedAt: new Date() })
      .where(eq(settlementsTable.id, parseInt(req.params.id)))
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
      status: "INITIATED",
      bagCount: row.eligibleBags,
      bagIds: row.bagIds,
    });

    await db.insert(activityTable).values({ user: checker, action: `Approved settlement #${row.id} for ${row.brandName} — payout initiated`, entityType: "settlement", entityRef: String(row.id), level: "success" });

    res.json(mapSettlement(row));
  } catch (err) {
    req.log.error({ err }, "approve settlement error");
    res.status(500).json({ error: "Internal server error" });
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

    // Fetch payout for UTR
    const [payout] = await db.select().from(payoutsTable).where(eq(payoutsTable.settlementId, settlement.id));

    const commRate = parseFloat(settlement.commissionRate);
    const utr = payout?.utr ?? "";
    const settlementDate = payout?.settledAt?.toISOString().split("T")[0] ?? "";

    const headers = [
      "Settlement Cycle", "Order ID", "Bag ID", "Order Date", "Invoice Date",
      "Delivery Date", "Return Window Expiry", "Product SKU", "SKU Code", "Quantity",
      "MRP (₹)", "Effective Selling Price (₹)", "Brand-funded Discount (₹)", "Marketplace-funded Discount (₹)",
      "Net ESP after Brand Discount (₹)", "Commission %", "Commission Amount (₹)",
      "GST on Commission 18% (₹)", "TCS Amount (₹)", "TDS Amount (₹)",
      "MDR Amount (₹)", "Net Payable (₹)", "Bag Settlement Status", "OMS State",
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
      const mdr = 0;
      const net = netEsp - commission - gstOnCommission - tcs - tds - mdr;
      const returnStatus = b.eligibility === "on_hold" ? "INITIATED" : b.eligibility === "settled" ? "NONE" : "NONE";
      const mrp = (parseFloat(b.esp) * 1.15 * b.qty).toFixed(2);

      return [
        settlement.cycle,
        b.orderId,
        b.bagId,
        b.invoiceDate ?? "",
        b.invoiceDate ?? "",
        b.deliveryDate ?? "",
        b.windowExpiryDate ?? "",
        b.sku,
        b.sku,
        b.qty,
        mrp,
        esp.toFixed(2),
        brandDiscount.toFixed(2),
        marketplaceDiscount.toFixed(2),
        netEsp.toFixed(2),
        commRate.toFixed(2),
        commission.toFixed(2),
        gstOnCommission.toFixed(2),
        tcs.toFixed(2),
        tds.toFixed(2),
        mdr.toFixed(2),
        net.toFixed(2),
        b.eligibility.toUpperCase(),
        b.omsState,
        returnStatus,
        utr,
        settlementDate,
      ];
    });

    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const filename = `SoC-${settlement.cycle}-${settlement.brandName.replace(/\s+/g, "-")}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    req.log.error({ err }, "soc download error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function mapSettlement(r: typeof settlementsTable.$inferSelect) {
  return {
    id: r.id,
    cycle: r.cycle,
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
    penalty: parseFloat(r.penalty),
    netPayable: parseFloat(r.netPayable),
    status: r.status,
    financeNotes: r.financeNotes,
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt?.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

export default router;
