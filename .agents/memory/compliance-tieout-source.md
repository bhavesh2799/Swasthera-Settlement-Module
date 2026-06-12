---
name: Compliance tie-out single source of truth
description: Why the Compliance tie-out header and Reconciliation tab must read the same endpoint
---

# Compliance tie-out cards must match the Reconciliation tab

The Compliance page header (TCS/TDS tie-out cards + period-close banner) and the
Reconciliation tab must both read their Computed / Deposited / Variance / Filed numbers
from `GET /compliance/reconciliation` `totals`. Do NOT source the cards from
`GET /compliance/tcs-tds` while the tab uses reconciliation.

**Why:** the two endpoints define the numbers differently and silently disagree:
- `tcs-tds` `tcsPaid` counts only records with status `Paid`.
- `reconciliation` deposited counts `Paid` OR `Filed`, and its computed is net of reversals.
Mixing them made the header show a different tax position than the tab for the same month,
and a hardcoded `filed={false}` on the TDS card broke close-readiness gating.

**How to apply:** the reconciliation `totals` expose `tcsFiled` / `tdsFiled` booleans —
use those for the "Filed" step and for `periodClosed` gating, never a hardcoded value or
the GSTR-8 string from the summary. The per-head TCS IGST/CGST/SGST split is derived from
the inter- vs intra-state share of bags and the deposited amount is allocated pro-rata
(disclosed in the tab's info banner) — it is an allocation, not a true head-level discharge.
