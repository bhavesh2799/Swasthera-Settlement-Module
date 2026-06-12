import { Router } from "express";
import { db } from "@workspace/db";
import { tcsRecordsTable, tdsRecordsTable, bagsTable, activityTable, settlementsTable, payoutsTable, onboardingsTable, settlementAdjustmentsTable, invoicesTable } from "@workspace/db";
import { eq, and, sql, inArray, like } from "drizzle-orm";
import { reversalDeadline, isPastReversalDeadline, canReverseTDS, transactionPeriod, classifyCancellation } from "../services/tdsReversalService";
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

    return res.json({
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
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Shared helper — cycle prefix from month name + year (e.g. "May" 2026 → "MAY-2026")
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_ABBREV = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
function cyclePrefix(month: string, year: number): string {
  const idx = MONTH_NAMES.indexOf(month);
  return idx >= 0 ? `${MONTH_ABBREV[idx]}-${year}` : `${month.toUpperCase().slice(0, 3)}-${year}`;
}

const STATE_NAMES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
  "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
  "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
  "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "32": "Kerala",
  "33": "Tamil Nadu", "36": "Telangana", "37": "Andhra Pradesh",
};

// GET /compliance/tcs-records — bag-level view aggregated by brand + warehouse state.
// For each brand-state pair: IGST bags (interstate) vs intrastate bags broken out.
// IGST = stateCode (ship-from) ≠ customerStateCode (place of supply).
// TCS reversal uses the same deadline rules as TDS (7th of following month).
router.get("/compliance/tcs-records", async (req, res) => {
  try {
    const month = (req.query.month as string) || "May";
    const year = parseInt((req.query.year as string) || "2026");
    const prefix = cyclePrefix(month, year);

    const [cycleBags, tcsRecs, allOnboardings] = await Promise.all([
      db.select().from(bagsTable).where(like(bagsTable.cycle, `${prefix}%`)),
      db.select().from(tcsRecordsTable).where(and(eq(tcsRecordsTable.month, month), eq(tcsRecordsTable.year, year))),
      db.select().from(onboardingsTable),
    ]);

    if (cycleBags.length === 0) return res.json([]);

    const obMap = new Map(allOnboardings.map((o) => [o.id, o]));

    // Status lookup from tcs_records by brandName (filing/payment tracking)
    const tcsStatusByBrand = new Map<string, { id: number; status: string; paymentRef?: string | null; paymentDate?: string | null }>();
    for (const r of tcsRecs) {
      if (!r.isReversal) tcsStatusByBrand.set(r.brandName, { id: r.id, status: r.status, paymentRef: r.paymentRef, paymentDate: r.paymentDate });
    }

    // Group bags by brandId + stateCode (each state files TCS separately)
    const groups = new Map<string, typeof cycleBags>();
    for (const bag of cycleBags) {
      const key = `${bag.brandId}__${bag.stateCode ?? ""}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(bag);
    }

    const result = Array.from(groups.entries()).map(([key, bags]) => {
      const [brandIdStr, stateCode] = key.split("__");
      const brandId = parseInt(brandIdStr);
      const ob = obMap.get(brandId);
      const firstBag = bags[0];
      const totalTcsAmount = Math.round(bags.reduce((s, b) => s + parseFloat(b.tcsAmount), 0) * 100) / 100;
      const grossGmv = Math.round(bags.reduce((s, b) => s + parseFloat(b.esp) * b.qty, 0) * 100) / 100;

      // IGST = ship-from state ≠ customer state; intrastate = same state
      const igstBags = bags.filter((b) => stateCode && b.customerStateCode && stateCode !== b.customerStateCode);
      const intrastateBags = bags.filter((b) => !b.customerStateCode || !stateCode || stateCode === b.customerStateCode);
      const igstTcsAmount = Math.round(igstBags.reduce((s, b) => s + parseFloat(b.tcsAmount), 0) * 100) / 100;
      const intrastateTcsAmount = Math.round(intrastateBags.reduce((s, b) => s + parseFloat(b.tcsAmount), 0) * 100) / 100;
      const tcsStatus = tcsStatusByBrand.get(firstBag.brandName);

      return {
        brandId,
        brandName: firstBag.brandName,
        companyName: ob?.companyName ?? "",
        stateCode,
        stateGstin: firstBag.stateGstin ?? "",
        stateName: STATE_NAMES[stateCode] ?? stateCode,
        bagCount: bags.length,
        igstBagCount: igstBags.length,
        intrastateBagCount: intrastateBags.length,
        grossGmv,
        tcsRate: 1.0,
        totalTcsAmount,
        igstTcsAmount,
        intrastateTcsAmount,
        tcsRecordId: tcsStatus?.id ?? null,
        status: tcsStatus?.status ?? "Accrued",
        paymentRef: tcsStatus?.paymentRef ?? null,
        paymentDate: tcsStatus?.paymentDate ?? null,
        bags: bags.map((b) => ({
          bagId: b.bagId,
          orderId: b.orderId,
          esp: parseFloat(b.esp) * b.qty,
          stateCode: b.stateCode ?? stateCode,
          customerStateCode: b.customerStateCode ?? "",
          customerState: b.customerState ?? "",
          gstType: (stateCode && b.customerStateCode && stateCode !== b.customerStateCode) ? "IGST" : "INTRA",
          tcsAmount: parseFloat(b.tcsAmount),
          deliveryDate: b.deliveryDate ?? "",
          omsState: b.omsState,
          eligibility: b.eligibility,
          reversalStatus: b.reversalStatus ?? null,
          isReturnPending: b.eligibility === "on_hold" || b.reversalStatus === "RETURN_INITIATED",
        })),
      };
    });

    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "tcs records error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /compliance/tds-records — bag-level view aggregated by brand (TDS at company/TAN level).
// Each brand row includes per-bag breakdown + any reversal entries from tds_records.
// TDS is reversible before the 7th-of-following-month deposit deadline.
router.get("/compliance/tds-records", async (req, res) => {
  try {
    const month = (req.query.month as string) || "May";
    const year = parseInt((req.query.year as string) || "2026");
    const prefix = cyclePrefix(month, year);

    const [cycleBags, tdsRecs, allOnboardings] = await Promise.all([
      db.select().from(bagsTable).where(like(bagsTable.cycle, `${prefix}%`)),
      db.select().from(tdsRecordsTable).where(and(eq(tdsRecordsTable.month, month), eq(tdsRecordsTable.year, year))),
      db.select().from(onboardingsTable),
    ]);

    const obMap = new Map(allOnboardings.map((o) => [o.id, o]));

    // Status/TAN lookup from tds_records by companyName
    const tdsStatusByCompany = new Map<string, { id: number; status: string; depositRef?: string | null; depositDate?: string | null; tan?: string | null }>();
    for (const r of tdsRecs) {
      if (!r.isReversal) tdsStatusByCompany.set(r.companyName, { id: r.id, status: r.status, depositRef: r.depositRef, depositDate: r.depositDate, tan: r.tan });
    }

    // Group bags by brandId
    const groups = new Map<number, typeof cycleBags>();
    for (const bag of cycleBags) {
      if (!groups.has(bag.brandId)) groups.set(bag.brandId, []);
      groups.get(bag.brandId)!.push(bag);
    }

    const result = Array.from(groups.entries()).map(([brandId, bags]) => {
      const ob = obMap.get(brandId);
      const companyName = ob?.companyName ?? bags[0]?.brandName ?? "";
      const statusInfo = tdsStatusByCompany.get(companyName);

      const tdsAmount = Math.round(bags.reduce((s, b) => s + parseFloat(b.tdsAmount), 0) * 100) / 100;
      const grossPayment = Math.round(bags.reduce((s, b) => s + parseFloat(b.esp) * b.qty, 0) * 100) / 100;

      // Match reversals from tds_records to this brand's bags
      const brandBagIds = new Set(bags.map((b) => b.bagId));
      const reversals = tdsRecs.filter((r) => r.isReversal && (r.originalBagId ? brandBagIds.has(r.originalBagId) : r.companyName === companyName));
      const tdsReversed = Math.round(reversals.reduce((s, r) => s + Math.abs(parseFloat(r.tdsAmount)), 0) * 100) / 100;

      return {
        brandId,
        tdsRecordId: statusInfo?.id ?? null,
        brandName: ob?.brandName ?? bags[0]?.brandName ?? "",
        companyName,
        tan: statusInfo?.tan ?? ob?.tan ?? "",
        bagCount: bags.length,
        grossPayment,
        tdsRate: 1.0,
        tdsAmount,
        tdsReversed,
        reversalCount: reversals.length,
        netTds: Math.round((tdsAmount - tdsReversed) * 100) / 100,
        status: statusInfo?.status ?? "Pending",
        depositRef: statusInfo?.depositRef ?? null,
        depositDate: statusInfo?.depositDate ?? null,
        bags: bags.map((b) => ({
          bagId: b.bagId,
          orderId: b.orderId,
          esp: parseFloat(b.esp) * b.qty,
          tdsAmount: parseFloat(b.tdsAmount),
          deliveryDate: b.deliveryDate ?? "",
          omsState: b.omsState,
          eligibility: b.eligibility,
          reversalStatus: b.reversalStatus ?? null,
          isReturnPending: b.eligibility === "on_hold" || b.reversalStatus === "RETURN_INITIATED",
          hasReversal: tdsRecs.some((r) => r.isReversal && r.originalBagId === b.bagId),
        })),
        reversals: reversals.map((r) => ({
          id: r.id,
          bagId: r.originalBagId ?? "",
          reason: r.reversalReason ?? "",
          tdsAmount: parseFloat(r.tdsAmount),
          month: r.month,
          year: r.year,
        })),
      };
    });

    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "tds records error");
    return res.status(500).json({ error: "Internal server error" });
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
      .where(eq(tcsRecordsTable.id, parseInt(String(req.params.id))))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });

    await db.insert(activityTable).values({
      user: "Finance Team",
      action: `TCS record #${row.id} marked as ${status ?? "updated"} — ${paymentRef ? `Ref: ${paymentRef}` : ""}`,
      entityType: "compliance",
      entityRef: String(row.id),
      level: "success",
    });

    return res.json({ id: row.id, status: row.status, paymentRef: row.paymentRef, paymentDate: row.paymentDate });
  } catch (err) {
    req.log.error({ err }, "update tcs record error");
    return res.status(500).json({ error: "Internal server error" });
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
      .where(eq(tdsRecordsTable.id, parseInt(String(req.params.id))))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });

    await db.insert(activityTable).values({
      user: "Finance Team",
      action: `TDS record #${row.id} marked as ${status ?? "updated"} — ${depositRef ? `Ref: ${depositRef}` : ""}`,
      entityType: "compliance",
      entityRef: String(row.id),
      level: "success",
    });

    return res.json({ id: row.id, status: row.status, depositRef: row.depositRef, depositDate: row.depositDate });
  } catch (err) {
    req.log.error({ err }, "update tds record error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /compliance/reconciliation — month-end tie-out: computed vs deposited per tax head.
// Computed totals come from the same records the tie-out cards use (net of reversals);
// the IGST/CGST/SGST split is derived from the cycle bags (interstate vs intrastate).
// Deposited comes from records marked Paid/Deposited/Filed. GST on commission discharges
// via GSTR-3B (no challan), so it has no "deposited" column. The challan register is read
// straight from the deposit references stored on the records (no separate challan table).
router.get("/compliance/reconciliation", async (req, res) => {
  try {
    const month = (req.query.month as string) || "May";
    const year = parseInt((req.query.year as string) || "2026");
    const prefix = cyclePrefix(month, year);
    const r2 = (n: number) => Math.round(n * 100) / 100;

    const [cycleBags, tcsRecs, tdsRecs] = await Promise.all([
      db.select().from(bagsTable).where(like(bagsTable.cycle, `${prefix}%`)),
      db.select().from(tcsRecordsTable).where(and(eq(tcsRecordsTable.month, month), eq(tcsRecordsTable.year, year))),
      db.select().from(tdsRecordsTable).where(and(eq(tdsRecordsTable.month, month), eq(tdsRecordsTable.year, year))),
    ]);

    // --- TCS: net computed from records, split fractions from bags ---
    const tcsComputed = r2(tcsRecs.reduce((s, r) => s + parseFloat(r.tcsAmount), 0));
    const tcsDeposited = r2(
      tcsRecs.filter((r) => !r.isReversal && (r.status === "Paid" || r.status === "Filed")).reduce((s, r) => s + parseFloat(r.tcsAmount), 0),
    );
    const igstBagTcs = cycleBags
      .filter((b) => b.stateCode && b.customerStateCode && b.stateCode !== b.customerStateCode)
      .reduce((s, b) => s + parseFloat(b.tcsAmount), 0);
    const intraBagTcs = cycleBags
      .filter((b) => !b.customerStateCode || !b.stateCode || b.stateCode === b.customerStateCode)
      .reduce((s, b) => s + parseFloat(b.tcsAmount), 0);
    const totalBagTcs = igstBagTcs + intraBagTcs;
    const igstFrac = totalBagTcs > 0 ? igstBagTcs / totalBagTcs : 0;
    const intraFrac = totalBagTcs > 0 ? intraBagTcs / totalBagTcs : 1;

    const tcsAnyFiled = tcsRecs.some((r) => !r.isReversal && r.status === "Filed");
    const tcsRef = tcsRecs.find((r) => r.paymentRef)?.paymentRef ?? null;
    const tcsReturnStatus = tcsAnyFiled ? "GSTR-8 filed" : "GSTR-8 pending";

    const tcsHead = (label: string, frac: number) => {
      const computed = r2(tcsComputed * frac);
      const deposited = r2(tcsDeposited * frac);
      const variance = r2(deposited - computed);
      return {
        head: label,
        computed,
        deposited,
        variance,
        ref: tcsRef,
        returnStatus: tcsReturnStatus,
        status: variance < -0.01 ? "Short" : computed > 0 ? "Matched" : "Nil",
      };
    };

    // --- TDS: net computed (incl. negative reversals) from records ---
    const tdsComputed = r2(tdsRecs.reduce((s, r) => s + parseFloat(r.tdsAmount), 0));
    const tdsDeposited = r2(
      tdsRecs.filter((r) => !r.isReversal && (r.status === "Deposited" || r.status === "Filed")).reduce((s, r) => s + parseFloat(r.tdsAmount), 0),
    );
    const tdsVariance = r2(tdsDeposited - tdsComputed);
    const tdsRef = tdsRecs.find((r) => r.depositRef)?.depositRef ?? null;
    const tdsAnyFiled = tdsRecs.some((r) => !r.isReversal && r.status === "Filed");

    // --- GST on commission (platform output, discharged via GSTR-3B) ---
    const cycleOrderIds = cycleBags.map((b) => b.orderId);
    const commissionInvoices = cycleOrderIds.length
      ? await db.select().from(invoicesTable).where(and(inArray(invoicesTable.orderId, cycleOrderIds), eq(invoicesTable.invoiceType, "INVOICE")))
      : [];
    const gstOnCommission = r2(commissionInvoices.reduce((s, i) => s + parseFloat(i.gstOnCommission), 0));

    const rows = [
      tcsHead("TCS — IGST", igstFrac),
      tcsHead("TCS — CGST", intraFrac / 2),
      tcsHead("TCS — SGST", intraFrac / 2),
      {
        head: "TDS §194-O",
        computed: tdsComputed,
        deposited: tdsDeposited,
        variance: tdsVariance,
        ref: tdsRef,
        returnStatus: tdsAnyFiled ? "26Q filed" : "26Q · Q1 open",
        status: tdsVariance < -0.01 ? "Short" : tdsComputed > 0 ? "Matched" : "Nil",
      },
      {
        head: "GST on commission (output)",
        computed: gstOnCommission,
        deposited: null,
        variance: null,
        ref: `${commissionInvoices.length} invoices`,
        returnStatus: "GSTR-1 pending",
        status: "Open",
      },
    ];

    // --- Challan register (read from deposit refs on records) ---
    type Challan = { ref: string; head: string; period: string; amount: number; date: string | null; status: string };
    const challanMap = new Map<string, Challan>();
    for (const r of tcsRecs) {
      if (!r.paymentRef) continue;
      const k = `TCS__${r.paymentRef}`;
      const c = challanMap.get(k) ?? { ref: r.paymentRef, head: "TCS (§52)", period: `${month} ${year}`, amount: 0, date: r.paymentDate ?? null, status: r.status === "Filed" ? "Filed" : "Verified" };
      c.amount = r2(c.amount + parseFloat(r.tcsAmount));
      challanMap.set(k, c);
    }
    for (const r of tdsRecs) {
      if (!r.depositRef) continue;
      const k = `TDS__${r.depositRef}`;
      const c = challanMap.get(k) ?? { ref: r.depositRef, head: "TDS (§194-O)", period: `${month} ${year}`, amount: 0, date: r.depositDate ?? null, status: r.status === "Pending" ? "Awaiting checker" : "Verified" };
      c.amount = r2(c.amount + parseFloat(r.tdsAmount));
      challanMap.set(k, c);
    }

    return res.json({
      month,
      year,
      rows,
      challanRegister: Array.from(challanMap.values()),
      totals: {
        tcsComputed,
        tcsDeposited,
        tcsVariance: r2(tcsDeposited - tcsComputed),
        tcsFiled: tcsAnyFiled,
        tdsComputed,
        tdsDeposited,
        tdsVariance,
        tdsFiled: tdsAnyFiled,
        gstOnCommission,
      },
    });
  } catch (err) {
    req.log.error({ err }, "reconciliation error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /compliance/commission-gst — the platform's OWN output GST liability raised on
// commission invoices (distinct from GST on goods, which is the brand's liability and
// lives in the GST register). Issuer is always USEKIWI (Haryana, state 06): recipient
// POS ≠ 06 → IGST 18%; POS = 06 → CGST 9% + SGST 9%.
const COMMISSION_ISSUER_STATE = "06";
router.get("/compliance/commission-gst", async (req, res) => {
  try {
    const month = (req.query.month as string) || "May";
    const year = parseInt((req.query.year as string) || "2026");
    const prefix = cyclePrefix(month, year);
    const r2 = (n: number) => Math.round(n * 100) / 100;

    const cycleBags = await db.select().from(bagsTable).where(like(bagsTable.cycle, `${prefix}%`));
    const orderIds = cycleBags.map((b) => b.orderId);
    const [invoices, allOnboardings] = await Promise.all([
      orderIds.length
        ? db.select().from(invoicesTable).where(and(inArray(invoicesTable.orderId, orderIds), eq(invoicesTable.invoiceType, "INVOICE")))
        : Promise.resolve([] as typeof invoicesTable.$inferSelect[]),
      db.select().from(onboardingsTable),
    ]);
    const obMap = new Map(allOnboardings.map((o) => [o.id, o]));

    const rows = invoices
      .filter((inv) => parseFloat(inv.commissionAmount) > 0)
      .map((inv) => {
        const ob = obMap.get(inv.brandId);
        const recipientGstin = ob?.masterGstin ?? inv.sellerGstin ?? "";
        const recipientState = recipientGstin.slice(0, 2);
        const taxable = r2(parseFloat(inv.commissionAmount));
        const totalGst = parseFloat(inv.gstOnCommission) > 0 ? r2(parseFloat(inv.gstOnCommission)) : r2(taxable * 0.18);
        const isIntra = recipientState === COMMISSION_ISSUER_STATE;
        return {
          invoiceNumber: inv.invoiceNumber,
          recipientName: ob?.companyName ?? inv.brandName ?? "",
          recipientGstin,
          posCode: recipientState,
          posName: STATE_NAMES[recipientState] ?? recipientState,
          taxable,
          igstAmount: isIntra ? 0 : totalGst,
          cgstAmount: isIntra ? r2(totalGst / 2) : 0,
          sgstAmount: isIntra ? r2(totalGst / 2) : 0,
          totalGst,
          status: "Pending",
        };
      })
      .sort((a, b) => b.taxable - a.taxable);

    const summary = rows.reduce(
      (acc, r) => ({
        invoiceCount: acc.invoiceCount + 1,
        taxable: r2(acc.taxable + r.taxable),
        igstAmount: r2(acc.igstAmount + r.igstAmount),
        cgstAmount: r2(acc.cgstAmount + r.cgstAmount),
        sgstAmount: r2(acc.sgstAmount + r.sgstAmount),
        totalGst: r2(acc.totalGst + r.totalGst),
      }),
      { invoiceCount: 0, taxable: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, totalGst: 0 },
    );

    const monthIndex = MONTH_NAMES.indexOf(month);
    const dueYear = monthIndex === 11 ? year + 1 : year;
    const dueMonth = (monthIndex + 2).toString().padStart(2, "0");

    return res.json({
      month,
      year,
      issuer: { name: "USEKIWI WELLNESS SOLUTIONS", gstin: "06AADCU9163E1Z9", stateCode: COMMISSION_ISSUER_STATE },
      gstr1DueDate: `${dueYear}-${dueMonth}-11`,
      summary,
      rows,
    });
  } catch (err) {
    req.log.error({ err }, "commission-gst error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /compliance/gst-register — sales register by cycle/month/brand.
// Returns per-bag invoice breakdown with CGST/SGST/IGST split and credit-note cross-reference.
router.get("/compliance/gst-register", async (req, res) => {
  try {
    const month = (req.query.month as string) || "May";
    const year = parseInt((req.query.year as string) || "2026");
    const brandIdFilter = req.query.brandId ? parseInt(req.query.brandId as string) : undefined;
    const prefix = cyclePrefix(month, year);

    const cycleBags = await db.select().from(bagsTable).where(
      brandIdFilter
        ? and(like(bagsTable.cycle, `${prefix}%`), eq(bagsTable.brandId, brandIdFilter))
        : like(bagsTable.cycle, `${prefix}%`)
    );

    if (cycleBags.length === 0) {
      return res.json({ summary: { totalTaxableValue: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0, totalGst: 0, totalInvoiceValue: 0, bagCount: 0 }, entries: [] });
    }

    const orderIds = cycleBags.map((b) => b.orderId);
    const [invoices, creditNotes] = await Promise.all([
      db.select().from(invoicesTable).where(and(inArray(invoicesTable.orderId, orderIds), eq(invoicesTable.invoiceType, "INVOICE"))),
      db.select().from(invoicesTable).where(and(inArray(invoicesTable.orderId, orderIds), eq(invoicesTable.invoiceType, "CREDIT_NOTE"))),
    ]);

    const invoiceByOrder = new Map(invoices.map((i) => [i.orderId, i]));
    const cnByOrder = new Map(creditNotes.map((c) => [c.orderId, c]));

    const entries = cycleBags.map((b) => {
      const inv = invoiceByOrder.get(b.orderId);
      const cn = cnByOrder.get(b.orderId);
      const esp = parseFloat(b.esp) * b.qty;
      const warehouseState = b.stateCode ?? "";
      const customerState = b.customerStateCode ?? "";
      const gstType = inv?.gstType ?? (warehouseState && customerState && warehouseState !== customerState ? "INTER" : "INTRA");
      const taxableValue = inv ? parseFloat(inv.taxableValue ?? "0") : esp;
      const cgstAmount = inv ? parseFloat(inv.cgstAmount ?? "0") : 0;
      const sgstAmount = inv ? parseFloat(inv.sgstAmount ?? "0") : 0;
      const igstAmount = inv ? parseFloat(inv.igstAmount ?? "0") : 0;
      const totalInvoiceValue = inv ? parseFloat(inv.totalInvoiceValue ?? "0") : esp;

      return {
        bagId: b.bagId,
        orderId: b.orderId,
        brandId: b.brandId,
        brandName: b.brandName,
        invoiceNumber: inv?.invoiceNumber ?? null,
        invoiceDate: inv?.invoiceDate ?? b.invoiceDate ?? null,
        customerName: b.customerName ?? "",
        customerState: b.customerState ?? "",
        customerStateCode: customerState,
        sellerGstin: inv?.sellerGstin ?? "",
        warehouseStateCode: warehouseState,
        gstType,
        esp,
        taxableValue,
        cgstRate: inv ? parseFloat(inv.cgstRate ?? "0") : 0,
        cgstAmount,
        sgstRate: inv ? parseFloat(inv.sgstRate ?? "0") : 0,
        sgstAmount,
        igstRate: inv ? parseFloat(inv.igstRate ?? "0") : 0,
        igstAmount,
        totalGstAmount: cgstAmount + sgstAmount + igstAmount,
        totalInvoiceValue,
        omsState: b.omsState,
        eligibility: b.eligibility,
        hasCreditNote: !!cn,
        creditNoteNumber: cn?.invoiceNumber ?? null,
        creditNoteValue: cn ? parseFloat(cn.totalInvoiceValue) : null,
        cycle: b.cycle,
      };
    });

    const r = (n: number) => Math.round(n * 100) / 100;
    const totalTaxableValue = r(entries.reduce((s, e) => s + e.taxableValue, 0));
    const totalCgst = r(entries.reduce((s, e) => s + e.cgstAmount, 0));
    const totalSgst = r(entries.reduce((s, e) => s + e.sgstAmount, 0));
    const totalIgst = r(entries.reduce((s, e) => s + e.igstAmount, 0));
    const totalGst = r(totalCgst + totalSgst + totalIgst);
    const totalInvoiceValue = r(entries.reduce((s, e) => s + e.totalInvoiceValue, 0));

    return res.json({
      summary: { totalTaxableValue, totalCgst, totalSgst, totalIgst, totalGst, totalInvoiceValue, bagCount: entries.length },
      entries,
    });
  } catch (err) {
    req.log.error({ err }, "gst register error");
    return res.status(500).json({ error: "Internal server error" });
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

    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "order breakdown error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// TDS + TCS reversal — BRD §5.4
// Both taxes use the same 7th-of-following-month deposit deadline.
// TDS (§194-O IT Act): negative entry written to tds_records within the window;
//   carry-forward settlement adjustment when past deadline.
// TCS (§52 GST / GSTR-8): negative entry written to tcs_records (GSTR-8 amendment
//   reduces marketplace liability, credits brand electronic ledger) within the window;
//   TCS_CARRY_FORWARD adjustment when past deadline.
// Past deadline: 422 returned so the caller shows the carry-forward message.
router.post("/compliance/reversal", authorize(["backend", "admin"]), async (req, res) => {
  try {
    const { bagId, reason, month, year } = req.body as { bagId: string; reason: string; month: string; year: number };
    if (!bagId || !reason || !month || !year) {
      return res.status(400).json({ error: "bagId, reason, month, and year are required" });
    }

    const [bag] = await db.select().from(bagsTable).where(eq(bagsTable.bagId, bagId));
    if (!bag) return res.status(404).json({ error: "Bag not found" });

    const tdsAmt = parseFloat(bag.tdsAmount);
    const tcsAmt = parseFloat(bag.tcsAmount);
    if (tdsAmt === 0 && tcsAmt === 0) {
      return res.status(400).json({ error: "No TDS or TCS accrual found for this bag to reverse" });
    }

    // Enforce the canonical reversal path: only bags that have already completed
    // the order cancel/return flow may use this endpoint. Active orders must go
    // through POST /transactions/:orderId/cancel (or /return/accept) which enforces
    // scenario classification, credit-note generation, and brand acceptance atomically.
    const cancellationCase = classifyCancellation(bag.deliveryDate, bag.windowExpiryDate);
    if (bag.reversalStatus === "WINDOW_EXPIRED_REJECTED") {
      return res.status(400).json({
        error: `Bag ${bagId} was rejected due to an expired return window (Scenario 3 — BRD §5.4). No tax reversal can be logged.`,
        reversalStatus: bag.reversalStatus,
      });
    }
    if (bag.reversalStatus === "RETURN_INITIATED") {
      return res.status(400).json({
        error: `Bag ${bagId} has a return in progress. Accept or reject the return from the Orders page before logging a tax reversal.`,
        redirectHint: "/orders",
        reversalStatus: bag.reversalStatus,
      });
    }
    if (!bag.reversalStatus && cancellationCase !== "PAST_RETURN_WINDOW") {
      // Active order that hasn't gone through the cancel/return flow yet.
      // Must use the Orders page to get credit-note generation + scenario enforcement.
      const label = cancellationCase === "PRE_DELIVERY"
        ? "not yet delivered"
        : "within return window";
      return res.status(400).json({
        error: `Bag ${bagId} is ${label} and has not been cancelled or returned yet. Use the Orders page to initiate the cancellation/return flow — credit-note generation and scenario rules are enforced there.`,
        redirectHint: "/orders",
        cancellationCase,
      });
    }

    // Eligibility derives strictly from bag data — client-supplied month/year are
    // only used for display labels and must not influence the statutory deadline check.
    const txnDate = bag.invoiceDate ? new Date(bag.invoiceDate) : new Date(bag.createdAt);
    const deadline = reversalDeadline(txnDate);
    const reversalEligible = canReverseTDS(txnDate, new Date());
    const { month: txnMonth, year: txnYear } = transactionPeriod(txnDate);

    if (!reversalEligible) {
      // Both deposit deadlines have passed — write carry-forward adjustments for
      // the next settlement cycle and return 422 so the caller shows the right message.
      if (tdsAmt > 0) {
        await db.insert(settlementAdjustmentsTable).values({
          onboardingId: bag.brandId,
          cycle: bag.cycle,
          bagId: bag.bagId,
          adjustmentType: "TDS_CARRY_FORWARD",
          amount: tdsAmt.toFixed(2),
          reason: `TDS deposit deadline ${deadline} passed — carried forward from compliance reversal (${reason})`,
        });
      }
      if (tcsAmt > 0) {
        await db.insert(settlementAdjustmentsTable).values({
          onboardingId: bag.brandId,
          cycle: bag.cycle,
          bagId: bag.bagId,
          adjustmentType: "TCS_CARRY_FORWARD",
          amount: tcsAmt.toFixed(2),
          reason: `TCS GSTR-8 deadline ${deadline} passed — credit carried forward from compliance reversal (${reason})`,
        });
      }
      await db.insert(activityTable).values({
        user: req.user?.name ?? "System",
        action: `TDS/TCS already deposited for ${bagId} (deadline ${deadline} passed) — carry-forwards recorded (${reason})`,
        entityType: "compliance",
        entityRef: bagId,
        level: "warning",
      });
      return res.status(422).json({
        success: false,
        reversalEligible: false,
        deadline,
        message: `Deposit deadline (${deadline}) has already passed for bag ${bagId}. TDS ₹${tdsAmt.toFixed(2)} and TCS ₹${tcsAmt.toFixed(2)} recorded as carry-forward adjustments for the next settlement cycle.`,
        tdsCarryForward: tdsAmt,
        tcsCarryForward: tcsAmt,
      });
    }

    // Deadline has not passed — insert negative reversal entries for both taxes.
    if (tdsAmt > 0) {
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
    }

    if (tcsAmt > 0) {
      await db.insert(tcsRecordsTable).values({
        month: txnMonth, year: txnYear,
        stateGstin: bag.stateGstin,
        stateCode: bag.stateCode,
        stateName: STATE_NAMES[bag.stateCode] ?? bag.stateCode,
        brandName: bag.brandName,
        taxableSupply: String(-parseFloat(bag.esp)),
        tcsRate: "1.00",
        tcsAmount: String(-tcsAmt),
        status: "Accrued",
        paymentDueDate: deadline,
        isReversal: true,
        reversalReason: reason,
        originalBagId: bagId,
      });
    }

    await db.update(bagsTable)
      .set({ eligibility: "on_hold", omsState: "return_bag_delivered" })
      .where(eq(bagsTable.bagId, bagId));

    await db.insert(activityTable).values({
      user: req.user?.name ?? "System",
      action: `TDS/TCS reversal logged for bag ${bagId} (deadline ${deadline}) — ${reason}`,
      entityType: "compliance",
      entityRef: bagId,
      level: "warning",
    });

    return res.json({
      success: true,
      reversalEligible: true,
      deadline,
      message: `TDS ₹${tdsAmt.toFixed(2)} and TCS ₹${tcsAmt.toFixed(2)} reversal logged for bag ${bagId}.`,
      tdsReversed: tdsAmt,
      tcsReversed: tcsAmt,
    });
  } catch (err) {
    req.log.error({ err }, "compliance reversal error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/compliance/calendar", async (_req, res) => {
  return res.json([
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
    return res.json(ledger);
  } catch (err) {
    req.log.error({ err }, "ledger error");
    return res.status(500).json({ error: "Internal server error" });
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
    return res.send(csv);
  } catch (err) {
    req.log.error({ err }, "ledger export error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
