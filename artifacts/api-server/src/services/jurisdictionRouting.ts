import { db, bagsTable, bankAccountsTable, bankAccountJurisdictionsTable, onboardingsTable, settlementsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { calculateSettlement, type SettlementResult } from "./settlementCalculator";

type Bag = typeof bagsTable.$inferSelect;
type Onboarding = typeof onboardingsTable.$inferSelect;

export interface DestinationGroup {
  /** bank_accounts.id this group pays to, or null when falling back to legacy onboarding bank fields. */
  bankAccountId: number | null;
  bankAccount: string;
  bankIfsc: string;
  bankName: string;
  /** True for the group that receives unmapped states (the primary / legacy destination). */
  isPrimaryDestination: boolean;
  /** State codes routed to this account (mapped states, plus "unmapped" on the primary group). */
  stateCodes: string[];
  bags: Bag[];
  calc: SettlementResult;
}

export interface RoutedSettlement {
  onboarding: Onboarding;
  cycle: string;
  eligibleBags: number;
  groups: DestinationGroup[];
  /** Set when the brand has no eligible bags for the cycle. */
  warning?: string;
}

/**
 * The jurisdiction used for routing an order. Prefer the shipping (customer)
 * state; fall back to the warehouse-GSTIN-derived state code, which is always
 * present. This mirrors the BRD "warehouse GSTIN / shipping state" wording.
 */
function bagJurisdiction(bag: Bag): string {
  return bag.customerStateCode || bag.stateCode;
}

/**
 * Resolve the routed settlement groups for one onboarding + cycle WITHOUT
 * writing anything. Groups eligible bags by destination bank account using the
 * brand's jurisdiction mappings, falling back to the primary (or legacy) account
 * for unmapped states. Each group is costed independently via calculateSettlement.
 *
 * Carry-forward from the brand's most recent prior settlement is applied only to
 * the primary destination group, so a brand-level deficit is netted once.
 */
export async function resolveRoutedSettlement(onboardingId: number, cycle: string): Promise<RoutedSettlement | null> {
  const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, onboardingId));
  if (!ob) return null;

  const eligibleBags = await db
    .select()
    .from(bagsTable)
    .where(and(eq(bagsTable.brandId, ob.id), eq(bagsTable.cycle, cycle), eq(bagsTable.eligibility, "eligible")));

  if (eligibleBags.length === 0) {
    return { onboarding: ob, cycle, eligibleBags: 0, groups: [], warning: `No eligible bags for ${ob.brandName} in cycle ${cycle}.` };
  }

  // Active accounts + mappings for this onboarding.
  const accounts = (await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.onboardingId, ob.id)))
    .filter((a) => a.status === "ACTIVE");
  const acctById = new Map(accounts.map((a) => [a.id, a]));
  const mappingRows = await db
    .select()
    .from(bankAccountJurisdictionsTable)
    .where(eq(bankAccountJurisdictionsTable.onboardingId, ob.id));
  const stateToAccountId = new Map<string, number>();
  for (const m of mappingRows) {
    if (acctById.has(m.bankAccountId)) stateToAccountId.set(m.stateCode, m.bankAccountId);
  }

  // Primary fallback account: the flagged primary, else the first active account.
  const primaryAccount = accounts.find((a) => a.isPrimary) ?? accounts[0] ?? null;
  const primaryAccountId = primaryAccount?.id ?? null; // null => legacy onboarding bank fields

  // Group bags by destination account id (null = legacy/onboarding fields).
  interface Bucket { bankAccountId: number | null; states: Set<string>; bags: Bag[]; }
  const buckets = new Map<string, Bucket>();
  const keyFor = (id: number | null) => (id === null ? "legacy" : String(id));

  for (const bag of eligibleBags) {
    const state = bagJurisdiction(bag);
    const mapped = stateToAccountId.get(state);
    const destId = mapped ?? primaryAccountId;
    const key = keyFor(destId);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { bankAccountId: destId, states: new Set(), bags: [] };
      buckets.set(key, bucket);
    }
    bucket.states.add(state);
    bucket.bags.push(bag);
  }

  const priorCarryForward = await mostRecentCarryForward(ob.id);
  const primaryKey = keyFor(primaryAccountId);

  const groups: DestinationGroup[] = [];
  for (const [key, bucket] of buckets) {
    const isPrimaryDestination = key === primaryKey;
    const acct = bucket.bankAccountId != null ? acctById.get(bucket.bankAccountId) : undefined;
    const calc = calculateSettlement({
      bags: bucket.bags.map((b) => ({ esp: b.esp, qty: b.qty, tcsAmount: b.tcsAmount, tdsAmount: b.tdsAmount })),
      commissionRate: parseFloat(ob.commissionRate),
      // Apply the brand-level carry-forward to the primary group only.
      priorCarryForward: isPrimaryDestination ? priorCarryForward : 0,
    });
    groups.push({
      bankAccountId: bucket.bankAccountId,
      bankAccount: acct?.accountNumber ?? ob.bankAccount,
      bankIfsc: acct?.ifsc ?? ob.bankIfsc,
      bankName: acct?.bankName ?? ob.bankName,
      isPrimaryDestination,
      stateCodes: Array.from(bucket.states).sort(),
      bags: bucket.bags,
      calc,
    });
  }

  // Primary destination first, then by net payable descending — stable display order.
  groups.sort((a, b) => Number(b.isPrimaryDestination) - Number(a.isPrimaryDestination) || b.calc.netPayable - a.calc.netPayable);

  return { onboarding: ob, cycle, eligibleBags: eligibleBags.length, groups };
}

/** Pull the unconsumed deficit from the brand's most recent prior settlement (≤ 0). */
async function mostRecentCarryForward(onboardingId: number): Promise<number> {
  const [prior] = await db
    .select()
    .from(settlementsTable)
    .where(eq(settlementsTable.onboardingId, onboardingId))
    .orderBy(desc(settlementsTable.createdAt))
    .limit(1);
  return prior ? parseFloat(prior.carryForward) : 0;
}
