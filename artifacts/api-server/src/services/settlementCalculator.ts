/**
 * Settlement calculator — spec MODULE 3.
 *
 * Applies the BRD deduction waterfall and the negative-net guard:
 * a brand is never paid a negative amount. When the raw net is below zero, the
 * payout is clamped to ₹0 and the deficit is carried forward into the next
 * cycle (returned as a negative `carryForward`).
 *
 * MDR (payment gateway fee) has been removed from the waterfall per product
 * decision — it is no longer charged to brands.
 */

export interface SettlementBag {
  esp: string;
  qty: number;
  tcsAmount: string;
  tdsAmount: string;
}

export interface SettlementInput {
  bags: SettlementBag[];
  commissionRate: number; // percent
  brandPromotions?: number;
  marketplacePromotions?: number; // tracked but NOT deducted from payout
  penalty?: number;
  /** Negative deficit carried in from the brand's previous cycle (≤ 0). */
  priorCarryForward?: number;
  /**
   * Sum of credit-note deductions and carry-forward TDS/TCS amounts from
   * settlement_adjustments for this brand+cycle. Applied as an additional
   * reduction against rawNet before the zero-floor/carry-forward logic.
   */
  creditNoteDeductions?: number;
}

export interface SettlementResult {
  grossGmv: number;
  brandPromotions: number;
  marketplacePromotions: number;
  netBeforeCommission: number;
  commission: number;
  commissionRate: number;
  gstOnCommission: number;
  tcsAmount: number;
  tdsAmount: number;
  penalty: number;
  /** Credit-note deductions and TDS/TCS carry-forwards applied this cycle. */
  creditNoteDeductions: number;
  /** Raw net before applying the prior carry-forward and the zero-floor. */
  rawNet: number;
  /** Final amount actually payable to the brand — never negative. */
  netPayable: number;
  /** Deficit carried into the next cycle (≤ 0); 0 when the cycle is positive. */
  carryForward: number;
}

const GST_ON_COMMISSION_RATE = 0.18;

export function calculateSettlement(input: SettlementInput): SettlementResult {
  const num = (v: string) => parseFloat(v) || 0;
  const brandPromotions = input.brandPromotions ?? 0;
  const marketplacePromotions = input.marketplacePromotions ?? 0;
  const penalty = input.penalty ?? 0;
  const priorCarryForward = input.priorCarryForward ?? 0;
  const creditNoteDeductions = input.creditNoteDeductions ?? 0;

  const grossGmv = input.bags.reduce((s, b) => s + num(b.esp) * b.qty, 0);
  // Brand-funded promotions ARE deducted; marketplace-funded promotions are NOT.
  const netBeforeCommission = grossGmv - brandPromotions;
  const commission = (netBeforeCommission * input.commissionRate) / 100;
  const gstOnCommission = commission * GST_ON_COMMISSION_RATE;
  const tcsAmount = input.bags.reduce((s, b) => s + num(b.tcsAmount), 0);
  const tdsAmount = input.bags.reduce((s, b) => s + num(b.tdsAmount), 0);

  // creditNoteDeductions covers CN reversals and TDS/TCS carry-forwards from
  // settlement_adjustments — amounts the brand owes back or that were deposited
  // with authorities in a prior period and cannot be reversed.
  const rawNet =
    netBeforeCommission - commission - gstOnCommission - tcsAmount - tdsAmount - penalty - creditNoteDeductions;

  // Apply any deficit carried in from the previous cycle, then floor at zero.
  const adjustedNet = rawNet + priorCarryForward;
  const netPayable = adjustedNet > 0 ? adjustedNet : 0;
  const carryForward = adjustedNet < 0 ? adjustedNet : 0;

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    grossGmv: round(grossGmv),
    brandPromotions: round(brandPromotions),
    marketplacePromotions: round(marketplacePromotions),
    netBeforeCommission: round(netBeforeCommission),
    commission: round(commission),
    commissionRate: input.commissionRate,
    gstOnCommission: round(gstOnCommission),
    tcsAmount: round(tcsAmount),
    tdsAmount: round(tdsAmount),
    penalty: round(penalty),
    creditNoteDeductions: round(creditNoteDeductions),
    rawNet: round(rawNet),
    netPayable: round(netPayable),
    carryForward: round(carryForward),
  };
}
