---
name: Brand/Warehouse entity governance pattern
description: How maker-checker approval is enforced for brand/warehouse create & edit, and the pending-state isolation rule.
---

# Brand/Warehouse maker-checker governance

Brand and warehouse mutations flow through propose-edit → approve/reject (checker/admin only).
New entities are created in `PENDING_APPROVAL`; edits store a diff in `pendingChanges` (JSON text)
and flip status to `PENDING_APPROVAL`. Approve applies the diff / activates; reject reverts an edit
to `ACTIVE` or marks a brand-new entity `REJECTED`.

**Rule: every route that mutates live brand/warehouse state must be `authorize(["checker","admin"])`
or go through propose→approve.** This includes the legacy `PUT /brands/:id`, `PUT /warehouses/:id`,
AND `DELETE /warehouses/:id` (deactivation is a material edit). Any maker-reachable live mutation is a
governance hole — audit ALL verbs (PUT/DELETE/POST), not just the obvious edit endpoints.
**Why:** these routes predate the approval flow and the frontend no longer uses them (it uses
propose-edit). Leaving them open let a maker mutate live rows without checker sign-off.

**Rule: a PENDING entity must never mutate live state.** Specifically, a new/edited warehouse that
requests `isPrimary` does NOT unset other primaries at create/propose time — that only happens at
approve time. And reads of the authoritative primary warehouse (e.g. order/bag state-code sourcing)
must filter `status = 'ACTIVE'` so a pending primary cannot shadow the live one.
**Why:** unsetting the old primary before approval, then rejecting, left the brand with zero primaries
and let a pending warehouse drive order calculations.
**How to apply:** any future "draft then approve" entity — defer all live-state side effects to the
approve handler, and make every read of that state ACTIVE-only.
