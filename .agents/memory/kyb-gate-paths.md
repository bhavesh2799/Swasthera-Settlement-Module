---
name: KYB gate is the single authoritative onboarding governance check
description: Onboarding kybStatus only becomes PASSED via the kyb-check endpoint; create starts NOT_STARTED and submit requires a verified KYB timestamp.
---

# KYB gate: one authoritative path

`onboardings.kybStatus` only becomes `PASSED` through the explicit check
endpoint (`POST /onboardings/:id/kyb-check`), which runs `runKyb` in
`services/kybService.ts` (PAN + mandatory GST + conditional CIN + live bank
IFSC lookup). Onboarding creation always starts `NOT_STARTED` with no
`kybVerifiedAt` — there is no create-time auto-pass.

The submit gate (`POST /onboardings/:id/submit`) blocks unless
`kybStatus === "PASSED"` **and** `kybVerifiedAt` is set, so presence of a
status alone cannot bypass it; the timestamp proves the real check ran.

**Why this matters:** an earlier version set PASSED at create time from a
presence-only signal (`!!body.masterGstin`), so garbage GSTINs passed the
governance gate. GST registration is now mandatory and the only trusted
verification is the full kyb-check run.

**How to apply:** keep KYB validation in one place (`runKyb`). Never reintroduce
a create-time pass path, and never let the submit gate trust `kybStatus` without
also requiring `kybVerifiedAt`.
