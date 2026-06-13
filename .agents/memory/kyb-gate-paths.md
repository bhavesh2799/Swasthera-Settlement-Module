---
name: KYB gate has two independent pass paths
description: Onboarding kybStatus can be set PASSED at create time OR via the kyb-check endpoint; both must validate, not just check presence.
---

# KYB gate: two independent pass paths

`onboardings.kybStatus` can become `PASSED` two different ways, and the submit
gate (`POST /onboardings/:id/submit`) only checks `kybStatus === "PASSED"`:

1. **Create time** (`POST /onboardings`) — sets PASSED based on a `kybVerified`
   flag computed inline in `routes/onboardings.ts`.
2. **Explicit check** (`POST /onboardings/:id/kyb-check`) — runs `runKyb` in
   `services/kybService.ts` (PAN + GST format, plus real bank IFSC lookup and CIN).

**Why this matters:** create-time once set `kybVerified = !!body.masterGstin`
(presence only), so any garbage GSTIN string passed the governance gate. It now
requires `GSTIN_RE.test(masterGstin) && PAN_RE.test(pan)` (both regexes exported
from kybService).

**How to apply:** if you change KYB validation rules, update BOTH paths or they
drift. The create-time path is a lighter format-only check; the kyb-check
endpoint is the full verification (bank + CIN). Don't make the submit gate
trust a presence-only signal.
