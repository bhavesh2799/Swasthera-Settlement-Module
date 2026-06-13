/**
 * Credit-note-driven reversal posting (Task #12).
 *
 * Replaces the old 7th-of-next-month statutory deadline timing. A reversal-eligible
 * cancellation/return is logged in the credit_note_register as AWAITING when its
 * credit note is generated — no tax reversal posts yet. When finance marks the row
 * RECEIVED (recording the actual arrival date), the TCS, TDS, and credit-note
 * adjustment all reverse into the settlement cycle of the arrival month.
 */
import {
  db,
  bagsTable,
  tcsRecordsTable,
  tdsRecordsTable,
  activityTable,
  settlementAdjustmentsTable,
  creditNoteRegisterTable,
  type CreditNoteRegister,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { stateName } from "./stateCodes";
import { transactionPeriod, parseLocalDate } from "./tdsReversalService";
import type { Invoice } from "@workspace/db";
import type { Request } from "express";

type Bag = typeof bagsTable.$inferSelect;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_ABBREV = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * Parses a settlement-cycle label into its calendar month/year. Cycles are
 * operator-chosen strings with several conventions in use: `MMM-YYYY`
 * (`JUN-2026`), `MMM-YYYY-<suffix>` (`JUN-2026-DEMO`, `MAY-2026-C1`), and
 * `YYYY-MM` (`2026-06`). Returns null if the label doesn't encode a month.
 */
function cycleMonthYear(cycle: string): { month: number; year: number } | null {
  const parts = cycle.split("-");
  const mi = MONTH_ABBREV.indexOf((parts[0] ?? "").toUpperCase());
  if (mi >= 0 && /^\d{4}$/.test(parts[1] ?? "")) return { month: mi + 1, year: parseInt(parts[1], 10) };
  if (/^\d{4}$/.test(parts[0] ?? "") && /^\d{1,2}$/.test(parts[1] ?? "")) {
    return { month: parseInt(parts[1], 10), year: parseInt(parts[0], 10) };
  }
  return null;
}

/**
 * Resolves the settlement cycle a credit-note reversal should post into, given
 * the arrival date — using REAL, settleable cycle labels rather than a
 * synthesized one (which would never match the settlement engine's strict
 * cycle-equality consumption). Preference order:
 *   1. The bag's own original cycle, if it falls in the arrival month (the
 *      common case — CN arrives within the same cycle).
 *   2. Any existing bag cycle for this brand that falls in the arrival month.
 *   3. Fall back to the bag's original cycle (guaranteed to be a settleable
 *      label, so the adjustment is consumed on that cycle's (re)compute).
 */
async function resolveArrivalCycle(onboardingId: number, originalCycle: string, arrival: Date): Promise<string> {
  const am = arrival.getMonth() + 1;
  const ay = arrival.getFullYear();

  const oc = cycleMonthYear(originalCycle);
  if (oc && oc.month === am && oc.year === ay) return originalCycle;

  const rows = await db
    .selectDistinct({ cycle: bagsTable.cycle })
    .from(bagsTable)
    .where(eq(bagsTable.brandId, onboardingId));
  const matches = rows
    .map((r) => r.cycle)
    .filter((c): c is string => {
      const my = cycleMonthYear(c);
      return !!my && my.month === am && my.year === ay;
    });
  if (matches.includes(originalCycle)) return originalCycle;
  if (matches.length > 0) return matches[0];

  return originalCycle;
}

/** End-of-month date (YYYY-MM-DD) for the bag's cycle month — the default expected arrival. */
function defaultExpectedArrival(now: Date = new Date()): string {
  const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return eom.toISOString().slice(0, 10);
}

/**
 * Logs a reversal-eligible cancellation/return as AWAITING in the credit note
 * register. Captures the TDS/TCS/CN amounts from the bag + generated credit note
 * so the reversal can be posted later when the credit note arrives.
 */
export async function createCreditNoteRegisterEntry(
  bag: Bag,
  creditNote: Invoice,
  scenario: string,
  reason: string,
): Promise<CreditNoteRegister> {
  // One register entry per bag — if a prior one exists (idempotent retries), reuse it.
  const [existing] = await db
    .select()
    .from(creditNoteRegisterTable)
    .where(eq(creditNoteRegisterTable.bagId, bag.bagId))
    .limit(1);
  if (existing) return existing;

  const [row] = await db
    .insert(creditNoteRegisterTable)
    .values({
      onboardingId: bag.brandId,
      brandName: bag.brandName,
      bagId: bag.bagId,
      orderId: bag.orderId,
      creditNoteInvoiceId: creditNote.id,
      creditNoteNumber: creditNote.invoiceNumber,
      scenario,
      originalCycle: bag.cycle,
      status: "AWAITING",
      expectedArrivalDate: defaultExpectedArrival(),
      tdsAmount: parseFloat(bag.tdsAmount).toFixed(2),
      tcsAmount: parseFloat(bag.tcsAmount).toFixed(2),
      cnAmount: Math.abs(parseFloat(creditNote.netPayable)).toFixed(2),
      reason,
    })
    .returning();

  await db.insert(activityTable).values({
    user: "System",
    action: `Credit note ${creditNote.invoiceNumber} awaiting arrival for ${bag.bagId} — tax reversal deferred until received (${reason})`,
    entityType: "compliance",
    entityRef: bag.bagId,
    level: "info",
  });

  return row;
}

/**
 * Posts the credit-note-driven reversal for a register row: negative TDS + negative
 * TCS entries dated to the arrival month (parity), plus a CREDIT_NOTE settlement
 * adjustment in the arrival cycle so the settlement engine deducts it there.
 *
 * Idempotent: a row already RECEIVED is returned unchanged.
 */
export async function postCreditNoteReversal(
  entry: CreditNoteRegister,
  actualArrivalDate: string,
  actor: string,
): Promise<{ posted: boolean; arrivalCycle: string; month: string; year: number; tdsReversed: number; tcsReversed: number; cnAmount: number }> {
  const arrivalDate = parseLocalDate(actualArrivalDate);
  const { month, year } = transactionPeriod(arrivalDate);
  const arrivalCycle = await resolveArrivalCycle(entry.onboardingId, entry.originalCycle, arrivalDate);

  const tdsAmt = parseFloat(entry.tdsAmount);
  const tcsAmt = parseFloat(entry.tcsAmount);
  const cnAmount = parseFloat(entry.cnAmount);

  return await db.transaction(async (tx) => {
    // Atomic idempotency gate: only the caller that flips AWAITING→RECEIVED
    // proceeds to post. A concurrent/duplicate request sees 0 updated rows and
    // posts nothing (no double-posting). The whole posting is one transaction,
    // so any failure rolls the status flip back too.
    const gated = await tx
      .update(creditNoteRegisterTable)
      .set({ status: "RECEIVED", actualArrivalDate, arrivalCycle, receivedAt: new Date() })
      .where(and(eq(creditNoteRegisterTable.id, entry.id), eq(creditNoteRegisterTable.status, "AWAITING")))
      .returning();
    if (gated.length === 0) {
      return { posted: false, arrivalCycle: entry.arrivalCycle ?? arrivalCycle, month, year, tdsReversed: tdsAmt, tcsReversed: tcsAmt, cnAmount };
    }

    // Re-read the bag for state identity needed by the reversal entries. Parity:
    // if any tax must reverse, the source bag is required — otherwise we'd risk
    // posting TDS without its matching TCS. Fail (rollback) rather than partially post.
    const [bag] = await tx.select().from(bagsTable).where(eq(bagsTable.bagId, entry.bagId)).limit(1);
    if ((tdsAmt > 0 || tcsAmt > 0) && !bag) {
      throw new Error(`Cannot post reversal for ${entry.bagId}: source bag not found (required for TDS/TCS parity).`);
    }

    // TDS reversal — negative entry dated to the arrival month.
    if (tdsAmt > 0) {
      await tx.insert(tdsRecordsTable).values({
        month,
        year,
        companyName: entry.brandName,
        tan: "DELN00000A",
        grossPayment: String(-parseFloat(bag!.esp)),
        tdsRate: "1.00",
        tdsAmount: String(-tdsAmt),
        netPaid: String(tdsAmt),
        status: "Pending",
        isReversal: true,
        reversalReason: `CN ${entry.creditNoteNumber ?? ""} received ${actualArrivalDate} — ${entry.reason ?? ""}`,
        originalBagId: entry.bagId,
      });
    }

    // TCS reversal — parity with TDS, negative entry dated to the arrival month.
    if (tcsAmt > 0) {
      await tx.insert(tcsRecordsTable).values({
        month,
        year,
        stateGstin: bag!.stateGstin,
        stateCode: bag!.stateCode,
        stateName: stateName(bag!.stateCode),
        brandName: entry.brandName,
        taxableSupply: String(-parseFloat(bag!.esp)),
        tcsRate: "1.00",
        tcsAmount: String(-tcsAmt),
        status: "Accrued",
        paymentDueDate: `${year}-${String(MONTH_NAMES.indexOf(month) + 2).padStart(2, "0")}-07`,
        isReversal: true,
        reversalReason: `CN ${entry.creditNoteNumber ?? ""} received ${actualArrivalDate} — ${entry.reason ?? ""}`,
        originalBagId: entry.bagId,
      });
    }

    // CREDIT_NOTE settlement adjustment — deducted from the brand's net in the
    // ARRIVAL cycle (not the original order cycle).
    if (cnAmount > 0) {
      await tx.insert(settlementAdjustmentsTable).values({
        onboardingId: entry.onboardingId,
        cycle: arrivalCycle,
        bagId: entry.bagId,
        adjustmentType: "CREDIT_NOTE",
        amount: cnAmount.toFixed(2),
        reason: `CN ${entry.creditNoteNumber ?? ""} received ${actualArrivalDate} (${entry.reason ?? ""})`,
      });
    }

    await tx.insert(activityTable).values({
      user: actor,
      action: `Credit note ${entry.creditNoteNumber ?? entry.bagId} received ${actualArrivalDate} — TDS ₹${tdsAmt.toFixed(2)} + TCS ₹${tcsAmt.toFixed(2)} reversed into ${arrivalCycle}`,
      entityType: "compliance",
      entityRef: entry.bagId,
      level: "success",
    });

    return { posted: true, arrivalCycle, month, year, tdsReversed: tdsAmt, tcsReversed: tcsAmt, cnAmount };
  });
}
