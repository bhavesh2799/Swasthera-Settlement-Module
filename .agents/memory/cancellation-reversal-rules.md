---
name: Cancellation & TDS/TCS reversal rules
description: How order cancellation maps to credit notes and tax-deduction reversals in the Swasthera transaction engine
---

# Cancellation → credit note → tax reversal

Three cancellation cases (classifyCancellation in services/tdsReversalService.ts), driven by a bag's delivery_date + window_expiry_date. Each sets bags.reversalStatus:
- **PRE_DELIVERY** (no delivery_date): void → credit note → reverse-if-eligible → status CANCELLED. (Note: POST /bags always defaults a delivery_date, so PRE_DELIVERY bags can't be created via that endpoint.)
- **WITHIN_RETURN_WINDOW** (delivered, today ≤ window_expiry): does NOT issue a credit note immediately — initiates a return journey (status RETURN_INITIATED, no CN/reversal yet). Then POST /transactions/:orderId/return/accept = CN + reverse-if-eligible → RETURNED; return/reject = no CN, status RETURN_REJECTED, order stays Delivered (eligibility restored).
- **PAST_RETURN_WINDOW** (today > window_expiry): HTTP 200 with rejected:true, status WINDOW_EXPIRED_REJECTED, NO credit note, NO reversal — only an audit log.

GET /transactions/:orderId/reversal-preview returns scenario/title/deadline/eligibility with NO writes (drives the frontend ReversalDialog).

# Reversal eligibility (canReverseTDS) — 7th is INCLUSIVE
A deduction can only be truly reversed BEFORE it's been deposited with authorities. Statutory deposit deadline = **7th of the month following the transaction month** (reversalDeadline(date) returns YYYY-MM-07 of next month, string-based to avoid Date rollover; uses bag.invoice_date, falls back to createdAt).
- Eligible (request date ≤ that 7th, i.e. same month OR 1st–7th of next month): insert NEGATIVE rows into tcs_records / tds_records (isReversal=true, originalBagId).
- Not eligible (request date AFTER the 7th): do NOT reverse — log a warning adjustment row in `activity` instead. Response carries `adjustmentLogged:true`. isPastReversalDeadline() uses strict `>`.

**Why:** mirrors GST/IT deposit cycle — once filed, money is with the govt, so it's an adjustment carried forward, never a clawback. The 7th itself is still within the deposit window, so a same-day-as-deadline request is allowed (full reversal).
**How to apply:** any new flow that voids a transaction (returns, disputes) must run the same case-classify + eligibility gate; don't blindly insert reversal rows.

# Idempotency / safety guards (transactions.ts)
- POST /cancel rejects with 409 if bags.reversalStatus is already set (any non-null value) — re-cancelling would insert DUPLICATE financial reversal rows. applyTaxReversal has NO internal dedupe, so the route-level guard is the protection.
- generateCreditNote throws "No invoice to reverse..." when no INVOICE row exists; /cancel and /return/accept catch this and return 422 (domain error) instead of a generic 500. So a scenario-1 cancel / return-accept requires a prior POST /transactions/capture (invoice) or it 422s.
