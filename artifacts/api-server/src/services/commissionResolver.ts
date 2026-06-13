import { db, commissionMasterTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Dated commission resolution (Task #11).
 *
 * A new commercial rate version must not retroactively change settlements for
 * orders that predate it. Each order is settled at the commission rate that was
 * effective on its own order date, read from the versioned `commission_master`
 * history. This builder loads all versions once and returns a pure lookup so a
 * settlement run does not issue one query per bag.
 *
 * Version coverage is the half-open interval [effectiveFromDate, effectiveToDate):
 * archiving a version sets its effectiveToDate to the new version's
 * effectiveFromDate, so a date that equals a boundary belongs to the newer
 * version. Orders that predate the earliest version use that earliest rate; a
 * version missing a percent (e.g. TIERED) or no versions at all fall back to the
 * onboarding's current flat rate.
 */
export interface CommissionResolver {
  /** Commission percent effective on the given order date (YYYY-MM-DD). */
  rateForDate(orderDate: string | null | undefined): number;
}

interface RateWindow {
  from: string;
  to: string | null;
  rate: number;
}

function normalizeDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(d);
  return m ? m[1] : null;
}

export async function buildCommissionResolver(
  onboardingId: number,
  fallbackRate: number,
): Promise<CommissionResolver> {
  const versions = await db
    .select()
    .from(commissionMasterTable)
    .where(eq(commissionMasterTable.onboardingId, onboardingId));

  const windows: RateWindow[] = versions
    .filter((v) => v.commissionPercent != null)
    .map((v) => ({
      from: normalizeDate(v.effectiveFromDate) ?? v.effectiveFromDate,
      to: normalizeDate(v.effectiveToDate),
      rate: parseFloat(v.commissionPercent as string),
    }))
    .filter((w) => !Number.isNaN(w.rate))
    .sort((a, b) => a.from.localeCompare(b.from));

  return {
    rateForDate(orderDate) {
      if (windows.length === 0) return fallbackRate;
      const d = normalizeDate(orderDate);
      // Unknown order date — use the current/latest known rate rather than guess.
      if (!d) return windows[windows.length - 1].rate;
      // Order predates the earliest version — bill at the earliest rate.
      if (d < windows[0].from) return windows[0].rate;
      const match = windows.find((w) => w.from <= d && (w.to == null || d < w.to));
      return match ? match.rate : windows[windows.length - 1].rate;
    },
  };
}
