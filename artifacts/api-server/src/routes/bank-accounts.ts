import { Router } from "express";
import { db, bankAccountsTable, brandsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { writeAudit } from "../services/audit";

const router = Router();

// List bank accounts for a brand
router.get("/brands/:brandId/bank-accounts", async (req, res) => {
  try {
    const brandId = parseInt(req.params.brandId);
    const rows = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.brandId, brandId));
    return res.json({ bankAccounts: rows });
  } catch (err) {
    req.log.error({ err }, "list bank accounts failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Add a bank account to a brand
router.post("/onboarding/bank-account", async (req, res) => {
  try {
    const { brandId, accountNumber, ifsc, bankName, branchName, accountType, isPrimary } = req.body as {
      brandId?: number;
      accountNumber?: string;
      ifsc?: string;
      bankName?: string;
      branchName?: string;
      accountType?: "current" | "savings";
      isPrimary?: boolean;
    };
    if (!brandId || !accountNumber || !ifsc || !bankName) {
      return res.status(400).json({ error: "brandId, accountNumber, ifsc and bankName are required" });
    }
    const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.id, brandId));
    if (!brand) return res.status(404).json({ error: "Brand not found" });

    // If marking primary, clear other primaries for this brand
    if (isPrimary) {
      await db.update(bankAccountsTable).set({ isPrimary: false }).where(eq(bankAccountsTable.brandId, brandId));
    }

    const [row] = await db.insert(bankAccountsTable).values({
      brandId,
      onboardingId: brand.onboardingId,
      accountNumber,
      ifsc: ifsc.toUpperCase(),
      bankName,
      branchName: branchName ?? null,
      accountType: accountType ?? "current",
      isPrimary: isPrimary ?? false,
    }).returning();

    await writeAudit(req, { entityType: "BankAccount", entityId: row.id, action: "create", changedFields: { accountNumber, bankName } });
    return res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "add bank account failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Set a bank account as primary
router.post("/onboarding/bank-account/:id/primary", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [acct] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, id));
    if (!acct) return res.status(404).json({ error: "Bank account not found" });
    await db.update(bankAccountsTable).set({ isPrimary: false }).where(eq(bankAccountsTable.brandId, acct.brandId));
    const [row] = await db.update(bankAccountsTable).set({ isPrimary: true }).where(eq(bankAccountsTable.id, id)).returning();
    await writeAudit(req, { entityType: "BankAccount", entityId: id, action: "set_primary" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "set primary bank account failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Remove a bank account
router.delete("/onboarding/bank-account/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.delete(bankAccountsTable).where(eq(bankAccountsTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Bank account not found" });
    await writeAudit(req, { entityType: "BankAccount", entityId: id, action: "delete" });
    return res.json({ deleted: true, id });
  } catch (err) {
    req.log.error({ err }, "delete bank account failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
