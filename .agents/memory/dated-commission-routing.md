---
name: Dated commission & warehouse bank routing
description: How dated commission resolution and warehouse->bank routing work, and the snapshot rule that keeps historical documents non-retroactive.
---

# Dated commission
- Each order is settled at the commission rate effective on its OWN order date, resolved from versioned `commission_master` via `commissionResolver.ts` (`buildCommissionResolver(onboardingId, fallbackRate)` → `rateForDate(date)`).
- Windows are half-open `[effectiveFromDate, effectiveToDate)`: a date equal to a boundary belongs to the NEWER version. Predates earliest → earliest rate; null/unknown date → latest; no versions or missing percent → onboarding fallback rate.
- `settlementCalculator` takes optional per-bag `commissionRate`; when present it computes commission per bag (brandPromotions allocated proportionally by GMV) and returns `commissionRate` = the rounded BLENDED effective rate, which is what gets persisted on the settlement.

**Rule:** Documents (SoC CSV, brand settlement PDF) MUST derive from the blended `settlement.commissionRate` persisted at compute time — NOT a freshly rebuilt resolver.
**Why:** A later/backdated `commission_master` version would otherwise retroactively change a historical document. The settlement row is the immutable snapshot.
**How to apply:** In settlements.ts SoC/PDF handlers use `parseFloat(settlement.commissionRate)`; only the POST/bulk-confirm compute paths build a resolver.

# Warehouse → bank routing
- `warehouse_bank_routing` table (warehouseId UNIQUE → bankAccountId, scoped by onboardingId). `bags.warehouseId` (nullable) is the routing key, stamped on POST /bags and backfilled from each onboarding's primary warehouse.
- `jurisdictionRouting.ts` buckets eligible bags by `bag.warehouseId` → account; one settlement record per destination account. Unmapped/null-warehouse bags fall back to the brand's primary ACTIVE account, surfaced via an "Unmapped" label + `usingPrimaryFallback` flag (never silent).
- Routing replaced the old state-based jurisdiction mapping; DestinationGroup carries `warehouseIds`/`warehouseLabels` (was stateCodes).

**Rule:** onboarding-scoped mapping routes must filter by BOTH warehouseId AND onboardingId.
**Why:** warehouseId is globally unique but a delete keyed only on warehouseId ignored the URL `:id`, allowing cross-onboarding deletion.
