---
name: Brand ledger posting policy
description: When settlement credits and payout debits post to the running brand ledger
---

# Running brand ledger: what posts and when

The compliance brand ledger is a liability ledger — running balance = amount
outstanding (owed) to the brand. It is built ONLY from settlements (credits) and
payouts (debits); invoices are deliberately excluded to avoid double-counting
commission that is already netted inside the settlement waterfall.

**Rule:** A payout debit posts to the ledger only when the payout has actually
been paid — i.e. status SETTLED (UTR generated). Pending/initiated payouts must
NOT reduce the outstanding balance.

**Why:** Payout rows get an `initiatedAt` timestamp at creation, so keying the
debit off "earliest available timestamp" caused even PENDING_APPROVAL payouts to
debit the ledger, understating what was still owed before money left. The balance
must reflect cash actually disbursed, not intent to disburse.

**How to apply:** Any aggregation that turns payout rows into ledger/cash-out
entries must gate on settled status, not on presence of a timestamp. Same caution
applies if a "cleared" or partial-payment status is ever added.
