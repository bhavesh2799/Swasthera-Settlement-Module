import { Router } from "express";
import { db } from "@workspace/db";
import { settlementsTable, onboardingsTable, bagsTable, payoutsTable, activityTable } from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { authorize } from "../middlewares/rbac";
import { writeAudit } from "../services/audit";
import { calculateSettlement } from "../services/settlementCalculator";
import { notify } from "../services/notify";

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

    const calc = calculateSettlement({
      bags: eligibleBags.map((b) => ({ esp: b.esp, qty: b.qty, tcsAmount: b.tcsAmount, tdsAmount: b.tdsAmount })),
      commissionRate: parseFloat(ob.commissionRate),
      priorCarryForward,
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
      commissionRate: ob.commissionRate,
      gstOnCommission: calc.gstOnCommission.toFixed(2),
      tcsAmount: calc.tcsAmount.toFixed(2),
      tdsAmount: calc.tdsAmount.toFixed(2),
      mdrCharges: calc.mdrCharges.toFixed(2),
      penalty: calc.penalty.toFixed(2),
      netPayable: calc.netPayable.toFixed(2),
      carryForward: calc.carryForward.toFixed(2),
      status: "PENDING_APPROVAL",
    }).returning();

    const cfNote = priorCarryForward < 0 ? ` (applied ₹${Math.abs(priorCarryForward).toFixed(0)} carry-forward)` : "";
    const negNote = calc.carryForward < 0 ? ` — net negative, ₹${Math.abs(calc.carryForward).toFixed(0)} carried to next cycle, payout floored at ₹0` : "";
    await db.insert(activityTable).values({ user: req.user?.name ?? "Anjali Patel", action: `Computed settlement for ${ob.brandName} — ${cycle} (${eligibleBags.length} bags, GMV ₹${calc.grossGmv.toFixed(0)})${cfNote}${negNote}`, entityType: "settlement", entityRef: String(row.id), level: calc.carryForward < 0 ? "warning" : "info" });

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

// Get the payout linked to this settlement
router.get("/settlements/:id/payout", async (req, res) => {
  try {
    const settlementId = parseInt(req.params.id);
    const [payout] = await db.select().from(payoutsTable).where(eq(payoutsTable.settlementId, settlementId));
    if (!payout) return res.status(404).json({ error: "No payout created yet for this settlement" });
    res.json({
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
    res.status(500).json({ error: "Internal server error" });
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

    res.json({
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
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/settlements/:id/approve", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { financeNotes, approvedBy } = req.body as { financeNotes?: string; approvedBy?: string };
    const checker = approvedBy || "Rajesh Kumar";
    const [existing] = await db.select().from(settlementsTable).where(eq(settlementsTable.id, parseInt(req.params.id)));
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.status === "APPROVED" || existing.status === "PAID") {
      return res.status(409).json({ error: `Settlement is already ${existing.status}. A payout has already been created.` });
    }
    if (existing.onHold) {
      return res.status(409).json({ error: `Settlement #${existing.id} is on payout hold (${existing.holdReason ?? "stopped by finance"}). Resume it before approving.` });
    }

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
      const returnStatus = b.eligibility === "on_hold" ? "INITIATED" : "NONE";
      const mrp = (parseFloat(b.esp) * 1.15 * b.qty).toFixed(2);

      return [
        settlement.cycle, b.orderId, b.bagId, b.invoiceDate ?? "", b.invoiceDate ?? "",
        b.deliveryDate ?? "", b.windowExpiryDate ?? "", b.sku, b.sku, b.qty,
        mrp, esp.toFixed(2), brandDiscount.toFixed(2), marketplaceDiscount.toFixed(2),
        netEsp.toFixed(2), commRate.toFixed(2), commission.toFixed(2), gstOnCommission.toFixed(2),
        tcs.toFixed(2), tds.toFixed(2), mdr.toFixed(2), net.toFixed(2),
        b.eligibility.toUpperCase(), b.omsState, returnStatus, utr, settlementDate,
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

    res.json(mapSettlement(row));
  } catch (err) {
    req.log.error({ err }, "hold settlement error");
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
