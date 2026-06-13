import {
  db,
  bagsTable,
  bankAccountsTable,
  warehouseBankRoutingTable,
  warehousesTable,
  onboardingsTable,
  settlementsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { calculateSettlement, type SettlementResult } from "./settlementCalculator";
import { buildCommissionResolver } from "./commissionResolver";

type Bag = typeof bagsTable.$inferSelect;
type Onboarding = typeof onboardingsTable.$inferSelect;

export interface DestinationGroup {
  /** bank_accounts.id this group pays to, or null when falling back to legacy onboarding bank fields. */
  bankAccountId: number | null;
  bankAccount: string;
  bankIfsc: string;
  bankName: string;
  /** True for the group that receives unmapped warehouses (the primary / legacy destination). */
  isPrimaryDestination: boolean;
  /** Warehouse ids routed to this account. */
  warehouseIds: number[];
  /** Human labels for the warehouses routed here (e.g. "WH-00001 · Mumbai DC"), plus "Unmapped" when fallback bags have no warehouse. */
  warehouseLabels: string[];
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

/** Order date used to select the dated commission rate; falls back to created date. */
function bagOrderDate(bag: Bag): string {
  return bag.invoiceDate || (bag.createdAt ? bag.createdAt.toISOString().slice(0, 10) : "");
}

/**
 * Resolve the routed settlement groups for one onboarding + cycle WITHOUT
 * writing anything. Groups eligible bags by destination bank account using the
 * brand's warehouse→bank-account mappings (Task #11), falling back to the
 * primary (or legacy) account for warehouses that have no explicit mapping (and
 * for bags that carry no warehouse). Each group is costed independently via
 * calculateSettlement, with each bag's commission charged at the rate effective
 * on its own order date.
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

  // Active accounts + warehouse routing mappings for this onboarding.
  const accounts = (await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.onboardingId, ob.id)))
    .filter((a) => a.status === "ACTIVE");
  const acctById = new Map(accounts.map((a) => [a.id, a]));

  const routingRows = await db
    .select()
    .from(warehouseBankRoutingTable)
    .where(eq(warehouseBankRoutingTable.onboardingId, ob.id));
  const warehouseToAccountId = new Map<number, number>();
  for (const m of routingRows) {
    if (acctById.has(m.bankAccountId)) warehouseToAccountId.set(m.warehouseId, m.bankAccountId);
  }

  // Warehouse labels for display (code · name).
  const warehouseRows = await db.select().from(warehousesTable).where(eq(warehousesTable.onboardingId, ob.id));
  const warehouseLabel = new Map<number, string>();
  for (const w of warehouseRows) {
    const code = w.warehouseCode ?? `WH-${String(w.id).padStart(5, "0")}`;
    warehouseLabel.set(w.id, w.warehouseName ? `${code} · ${w.warehouseName}` : code);
  }

  // Primary fallback account: the flagged primary, else the first active account.
  const primaryAccount = accounts.find((a) => a.isPrimary) ?? accounts[0] ?? null;
  const primaryAccountId = primaryAccount?.id ?? null; // null => legacy onboarding bank fields

  // Dated commission resolver — one load for the whole run.
  const resolver = await buildCommissionResolver(ob.id, parseFloat(ob.commissionRate));

  // Group bags by destination account id (null = legacy/onboarding fields).
  interface Bucket { bankAccountId: number | null; warehouseIds: Set<number>; hasUnmapped: boolean; bags: Bag[]; }
  const buckets = new Map<string, Bucket>();
  const keyFor = (id: number | null) => (id === null ? "legacy" : String(id));

  for (const bag of eligibleBags) {
    const whId = bag.warehouseId ?? null;
    const mapped = whId != null ? warehouseToAccountId.get(whId) : undefined;
    const destId = mapped ?? primaryAccountId;
    const key = keyFor(destId);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { bankAccountId: destId, warehouseIds: new Set(), hasUnmapped: false, bags: [] };
      buckets.set(key, bucket);
    }
    if (whId != null) bucket.warehouseIds.add(whId);
    else bucket.hasUnmapped = true;
    bucket.bags.push(bag);
  }

  const priorCarryForward = await mostRecentCarryForward(ob.id);
  const primaryKey = keyFor(primaryAccountId);

  const groups: DestinationGroup[] = [];
  for (const [key, bucket] of buckets) {
    const isPrimaryDestination = key === primaryKey;
    const acct = bucket.bankAccountId != null ? acctById.get(bucket.bankAccountId) : undefined;
    const calc = calculateSettlement({
      bags: bucket.bags.map((b) => ({
        esp: b.esp,
        qty: b.qty,
        tcsAmount: b.tcsAmount,
        tdsAmount: b.tdsAmount,
        commissionRate: resolver.rateForDate(bagOrderDate(b)),
      })),
      commissionRate: parseFloat(ob.commissionRate),
      // Apply the brand-level carry-forward to the primary group only.
      priorCarryForward: isPrimaryDestination ? priorCarryForward : 0,
    });
    const warehouseIds = Array.from(bucket.warehouseIds).sort((a, b) => a - b);
    const warehouseLabels = warehouseIds.map((id) => warehouseLabel.get(id) ?? `WH-${String(id).padStart(5, "0")}`);
    if (bucket.hasUnmapped) warehouseLabels.push("Unmapped");
    groups.push({
      bankAccountId: bucket.bankAccountId,
      bankAccount: acct?.accountNumber ?? ob.bankAccount,
      bankIfsc: acct?.ifsc ?? ob.bankIfsc,
      bankName: acct?.bankName ?? ob.bankName,
      isPrimaryDestination,
      warehouseIds,
      warehouseLabels,
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
