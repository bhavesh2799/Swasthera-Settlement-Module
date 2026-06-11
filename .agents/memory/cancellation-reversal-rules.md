---
name: Cancellation & TDS/TCS reversal rules
description: How order cancellation maps to credit notes and tax-deduction reversals in the Swasthera transaction engine
---

# Cancellation → credit note → tax reversal

Three cancellation cases (classifyCancellation in services/tdsReversalService.ts), driven by a bag's delivery_date + window_expiry_date:
- **PRE_DELIVERY** (no delivery_date): void → credit note → reverse-if-eligible.
- **WITHIN_RETURN_WINDOW** (delivered, today ≤ window_expiry): credit note → reverse-if-eligible.
- **PAST_RETURN_WINDOW** (today > window_expiry): HTTP 409, NO credit note, NO reversal.

# Reversal eligibility (canReverseTDS)
A deduction can only be truly reversed BEFORE it's been deposited with authorities. Statutory deposit deadline = **7th of the month following the transaction month** (uses bag.invoice_date, falls back to createdAt).
- Eligible (request date < that 7th): insert NEGATIVE rows into tcs_records / tds_records (isReversal=true, originalBagId).
- Not eligible (on/after the 7th): do NOT reverse — log a warning adjustment row in `activity` instead. Response carries `adjustmentLogged:true`.

**Why:** mirrors GST/IT deposit cycle — once filed, money is with the govt, so it's an adjustment carried forward, never a clawback.
**How to apply:** any new flow that voids a transaction (returns, disputes) must run the same case-classify + eligibility gate; don't blindly insert reversal rows.
