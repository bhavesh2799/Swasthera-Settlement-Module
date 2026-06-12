---
name: Swasthera settlement data-model quirks
description: Non-obvious linkages and a cycle-value mismatch in the Swasthera settlement module.
---

# Swasthera settlement data-model quirks

- **bags.brandId == onboarding.id (denormalized).** A bag's `brandId` is actually
  the onboarding id, not `brands.id`. Settlements are per onboarding, so fetch
  eligible bags with `bagsTable.brandId == onboarding.id`.
- **Bank accounts are keyed by onboardingId.** `bankAccountsTable` has both
  `onboardingId` and `brandId` (= `brandsTable.id`). Jurisdiction routing keys on
  `(onboardingId, stateCode)` so it works regardless of brand tagging.
- **Routing fallback chain** (jurisdictionRouting.ts): mapped state→account →
  flagged primary ACTIVE account → first ACTIVE account → legacy onboarding bank
  fields (`bankAccountId = null`, uses `onboarding.bankAccount/bankIfsc/bankName`).
  Seed brands 1/2/3 have eligible bags but NO `bank_accounts` rows, so they hit the
  legacy fallback (single group). Accounts only exist for some other onboardings.

## Cycle-value mismatch gotcha
**Why:** Bags use TWO different `cycle` formats in seed data: the named
`"MAY-2026-C1"` (holds the bulk of eligible bags, ~11) and ISO-month `"2026-05"`
(a few bags). `generateCycleOptions()` in SettlementList/BulkSettlement only emits
ISO-month values, so a UI default of `"2026-05"` finds far fewer eligible bags than
`"MAY-2026-C1"`.
**How to apply:** When testing settlement/bulk flows, prefer cycle
`"MAY-2026-C1"` to exercise the full eligible set. BulkSettlement.tsx explicitly
adds that named cycle to its options for this reason.
