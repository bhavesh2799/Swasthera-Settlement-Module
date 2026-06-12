---
name: Bank account lazy migration
description: Legacy/seed onboardings store bank data as denormalized fields; bankAccountsTable may be empty even when a bank exists, causing a second "Add Account" to hide the original.
---

# Bank account lazy migration

Onboardings created before the `bank_accounts` table feature store bank info only in the denormalized `onboarding.bankAccount / bankIfsc / bankName` columns. `bankAccountsTable` is empty for these rows.

The OnboardingDetail UI shows the card list when `bankAccounts.length > 0`, falling back to the denormalized fields when empty. When a user adds a *second* bank via "Add Account" and approves it, `bankAccounts.length` becomes 1 — the card list shows only the new account, silently hiding the original bank from the denormalized fields.

**Fix:** `GET /api/onboardings/:id/bank-accounts` lazily seeds a primary ACTIVE `bank_accounts` row from the onboarding's denormalized fields when the table is empty. This is a safe one-time migration — the schema default for `status` is `"ACTIVE"`.

**Why:** Writing to the DB in a GET handler is unusual, but the alternative (syncing denormalized + table data in every UI render) is worse. The seed is idempotent: it only fires when rows = 0 and stops after inserting one row.

**How to apply:** Any new GET list endpoint that reads from `bank_accounts` for an onboarding should include this lazy-migration guard if pre-table seed data is a concern.
