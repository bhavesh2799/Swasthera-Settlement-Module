/**
 * TDS/TCS reversal eligibility — BRD §5.4 / spec MODULE 3.
 *
 * A deduction can only be reversed before the TDS/TCS for that transaction has
 * been filed/deposited with the authorities. The statutory deposit deadline is
 * the 7th of the month FOLLOWING the transaction month. If the reversal is
 * requested on/after that 7th, the amount has already been deposited and must be
 * carried as an adjustment entry instead of a true reversal.
 */
export function canReverseTDS(originalTransactionDate: Date, reversalRequestDate: Date): boolean {
  // Reversible up to AND INCLUDING the 7th of the following month (statutory deposit
  // deadline). Same calendar month and the 1st–7th of the next month → full reversal;
  // on/after the 8th the amount has been deposited → adjustment, not reversal.
  const reqDay = reversalRequestDate.toISOString().split("T")[0];
  return reqDay <= reversalDeadline(originalTransactionDate);
}

/**
 * The TDS/TCS reversal deadline for a transaction: the 7th of the month FOLLOWING
 * the transaction month, returned as a YYYY-MM-DD string.
 */
export function reversalDeadline(originalTransactionDate: Date): string {
  const y = originalTransactionDate.getFullYear();
  const m = originalTransactionDate.getMonth(); // 0-based
  const nextMonth = m === 11 ? 0 : m + 1;
  const year = m === 11 ? y + 1 : y;
  return `${year}-${String(nextMonth + 1).padStart(2, "0")}-07`;
}

/** True when `now` is past the reversal deadline for the given transaction date. */
export function isPastReversalDeadline(originalTransactionDate: Date, now: Date = new Date()): boolean {
  return now.toISOString().split("T")[0] > reversalDeadline(originalTransactionDate);
}

export type CancellationCase = "PRE_DELIVERY" | "WITHIN_RETURN_WINDOW" | "PAST_RETURN_WINDOW";

/**
 * Classifies a cancellation/return against delivery + return-window dates.
 * - PRE_DELIVERY: not yet delivered → full void + credit note + reversal-if-eligible
 * - WITHIN_RETURN_WINDOW: delivered, window still open → credit note + reversal-if-eligible
 * - PAST_RETURN_WINDOW: window expired → no credit note, no reversal
 */
export function classifyCancellation(
  deliveryDate: string | null,
  windowExpiryDate: string | null,
  now: Date = new Date(),
): CancellationCase {
  if (!deliveryDate) return "PRE_DELIVERY";
  const today = now.toISOString().split("T")[0];
  if (windowExpiryDate && today > windowExpiryDate) return "PAST_RETURN_WINDOW";
  return "WITHIN_RETURN_WINDOW";
}

/** Resolves the {month, year} a transaction date falls in (for reversal records). */
export function transactionPeriod(transactionDate: Date): { month: string; year: number } {
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return { month: months[transactionDate.getMonth()], year: transactionDate.getFullYear() };
}
