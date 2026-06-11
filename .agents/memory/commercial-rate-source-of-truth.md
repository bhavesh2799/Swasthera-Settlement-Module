---
name: Commercial rate source of truth
description: Which table the settlement engine actually reads commercial rates from, and why brand-level edits must propagate to the onboarding.
---

# Commercial rate source of truth (settlement compute)

At settlement compute, the operative commercial rates — `commissionRate`, `tcsRate`,
`tdsRate`, and `mdrRate` — are read from the **onboarding row** (`ob.*`), NOT from the
`brands` table. Bags also link to the onboarding (`bags.brandId === onboarding.id`),
so settlement is effectively per-onboarding.

The `brands` / `commission_master` tables carry their own copies of these rate columns
for the Company→Brand hierarchy and config UI, but they are display/config — they are
NOT what the calculator consumes.

**Why:** brand rows can diverge from the onboarding (e.g. brand renamed; multiple brand
rows per onboarding). Matching a brand by `brandName` is non-deterministic, so the
onboarding is the single deterministic source the engine trusts.

**How to apply:** when adding a new percentage-based commercial rate that must affect
settlement, mirror `commissionRate`: add the column to onboarding (+ brand/commission_master
for parity), source it from `ob.<rate>` in the settlement route, and coerce blank→0.
Crucially, any UI that edits the rate at the **brand** level (via `/brands/:id/propose-edit`)
must, on checker **approval**, propagate the approved value onto the onboarding row —
otherwise the approved edit never reaches the next settlement run (silent drift).
