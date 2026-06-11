---
name: KYB done via GSTIN at onboarding
description: KYB has no separate verification step — it is implied by the GSTIN fetch during onboarding creation.
---

# KYB is verified up-front via GSTIN, not as a separate detail-page step

POST /onboardings auto-sets `kybStatus='PASSED'` + `kybVerifiedAt` whenever a master GSTIN
is present (the onboarding form fetches/validates the GSTIN). There is no separate "Run KYB
Check" action on the onboarding detail page, and Submit/Re-submit is NOT gated on kybStatus.

**Why:** KYB is effectively completed when the user fetches company data via GSTIN during
onboarding, so a second manual KYB gate was redundant and blocked the flow. The detail page
just shows a green "KYB Verified via GSTIN" badge when kybStatus==='PASSED'.

**How to apply:** Do not reintroduce a KYB phase-gate panel or gate submission on KYB. If
GSTIN-based onboarding ever changes, revisit where kybStatus gets set (POST /onboardings).
