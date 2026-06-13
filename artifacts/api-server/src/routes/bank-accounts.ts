import { Router } from "express";
import { db, bankAccountsTable, brandsTable, activityTable, bankAccountJurisdictionsTable, warehouseBankRoutingTable, warehousesTable, onboardingsTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { writeAudit } from "../services/audit";
import { authorize } from "../middlewares/rbac";
import { stateName } from "../services/stateCodes";

const router = Router();

async function logActivity(
  user: string,
  action: string,
  entityRef: string,
  level: "info" | "success" | "warning" = "info",
) {
  await db.insert(activityTable).values({ user, action, entityType: "bank", entityRef, level });
}

function parsePending(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mapBankAccount(b: typeof bankAccountsTable.$inferSelect) {
  return {
    id: b.id,
    brandId: b.brandId,
    onboardingId: b.onboardingId,
    accountNumber: b.accountNumber,
    ifsc: b.ifsc,
    bankName: b.bankName,
    branchName: b.branchName,
    accountType: b.accountType,
    isPrimary: b.isPrimary,
    status: b.status,
    pendingChanges: parsePending(b.pendingChanges),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

const BANK_EDITABLE = [
  "accountNumber", "ifsc", "bankName", "branchName", "accountType", "brandId", "isPrimary",
] as const;

function maskAcct(n: string) {
  return n.length > 4 ? `••••${n.slice(-4)}` : n;
}

// List bank accounts for a brand
router.get("/brands/:brandId/bank-accounts", async (req, res) => {
  try {
    const brandId = parseInt(String(req.params.brandId));
    const rows = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.brandId, brandId));
    return res.json({ bankAccounts: rows.map(mapBankAccount) });
  } catch (err) {
    req.log.error({ err }, "list bank accounts failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// List all bank accounts for an onboarding (across all its brands).
// Lazy-migrate: if the table is empty but the onboarding row has denormalized bank
// fields (legacy seed / pre-bankAccountsTable data), seed a primary ACTIVE entry so the
// detail page always shows at least one card and a second "Add Account" doesn't
// silently hide the original bank.
router.get("/onboardings/:id/bank-accounts", async (req, res) => {
  try {
    const onboardingId = parseInt(String(req.params.id));
    let rows = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.onboardingId, onboardingId));

    if (rows.length === 0) {
      const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, onboardingId));
      if (ob?.bankAccount && ob?.bankIfsc && ob?.bankName) {
        const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.onboardingId, onboardingId)).limit(1);
        if (brand) {
          const [seeded] = await db.insert(bankAccountsTable).values({
            brandId: brand.id,
            onboardingId,
            accountNumber: ob.bankAccount,
            ifsc: ob.bankIfsc.toUpperCase(),
            bankName: ob.bankName,
            branchName: null,
            accountType: "current",
            isPrimary: true,
            status: "ACTIVE",
          }).returning();
          rows = [seeded];
        }
      }
    }

    return res.json({ bankAccounts: rows.map(mapBankAccount) });
  } catch (err) {
    req.log.error({ err }, "list onboarding bank accounts failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Add a bank account to a brand — created PENDING_APPROVAL, awaits Checker
router.post("/onboarding/bank-account", authorize(["maker", "admin"]), async (req, res) => {
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

    // A new account stays PENDING_APPROVAL. Do NOT clear other primaries here —
    // live primary selection only changes at approval time (see /approve).
    const [row] = await db.insert(bankAccountsTable).values({
      brandId,
      onboardingId: brand.onboardingId,
      accountNumber,
      ifsc: ifsc.toUpperCase(),
      bankName,
      branchName: branchName ?? null,
      accountType: accountType ?? "current",
      isPrimary: isPrimary ?? false,
      status: "PENDING_APPROVAL",
    }).returning();

    await writeAudit(req, { entityType: "BankAccount", entityId: row.id, action: "create", changedFields: { accountNumber: maskAcct(accountNumber), bankName, brandId } });
    await logActivity(
      req.user?.name ?? "Maker",
      `Added bank account ${maskAcct(accountNumber)} (${bankName}) to ${brand.brandName} — awaiting Checker approval`,
      brand.brandCode ?? String(brandId),
      "info",
    );
    return res.status(201).json(mapBankAccount(row));
  } catch (err) {
    req.log.error({ err }, "add bank account failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Maker proposes an edit to a bank account — stored as pendingChanges, awaits Checker approval
router.post("/onboarding/bank-account/:id/propose-edit", authorize(["maker", "admin"]), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const [acct] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, parseInt(String(req.params.id))));
    if (!acct) return res.status(404).json({ error: "Bank account not found" });

    const proposed: Record<string, unknown> = {};
    for (const f of BANK_EDITABLE) {
      if (body[f] !== undefined) proposed[f] = body[f];
    }
    if (proposed.ifsc !== undefined) proposed.ifsc = String(proposed.ifsc).toUpperCase();
    if (Object.keys(proposed).length === 0) {
      return res.status(400).json({ error: "No editable fields supplied" });
    }

    // If re-tagging to another brand, it must exist and stay within the same onboarding.
    if (proposed.brandId !== undefined) {
      const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.id, Number(proposed.brandId)));
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      if (brand.onboardingId !== acct.onboardingId) {
        return res.status(400).json({ error: "Brand belongs to a different onboarding" });
      }
    }

    const [row] = await db
      .update(bankAccountsTable)
      .set({ pendingChanges: JSON.stringify(proposed), status: "PENDING_APPROVAL", updatedAt: new Date() })
      .where(eq(bankAccountsTable.id, acct.id))
      .returning();

    await writeAudit(req, { entityType: "BankAccount", entityId: acct.id, action: "propose_edit", changedFields: proposed });
    await logActivity(
      req.user?.name ?? "Maker",
      `Proposed edit to bank account ${maskAcct(acct.accountNumber)} (${acct.bankName}) — awaiting Checker approval`,
      acct.brandId != null ? String(acct.brandId) : String(acct.id),
      "info",
    );
    return res.json(mapBankAccount(row));
  } catch (err) {
    req.log.error({ err }, "propose bank account edit failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Checker approves a pending bank account (new account or proposed edit)
router.post("/onboarding/bank-account/:id/approve", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const [acct] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, parseInt(String(req.params.id))));
    if (!acct) return res.status(404).json({ error: "Bank account not found" });
    if (acct.status !== "PENDING_APPROVAL") {
      return res.status(400).json({ error: "Bank account is not pending approval" });
    }

    const pending = parsePending(acct.pendingChanges);
    const updates: Partial<typeof bankAccountsTable.$inferInsert> = { status: "ACTIVE", pendingChanges: null, updatedAt: new Date() };
    if (pending) {
      for (const f of BANK_EDITABLE) {
        if (pending[f] === undefined) continue;
        (updates as Record<string, unknown>)[f] = pending[f];
      }
    }

    // Determine final brand + primary intent (edit may re-tag to another brand).
    const finalBrandId = (updates.brandId as number | undefined) ?? acct.brandId;
    // Final primary = the proposed value if the edit touched it, else the row's
    // current flag (covers a brand-new primary account that later got an edit).
    const wantsPrimary = pending && pending.isPrimary !== undefined
      ? pending.isPrimary === true
      : acct.isPrimary === true;
    if (wantsPrimary) {
      await db
        .update(bankAccountsTable)
        .set({ isPrimary: false })
        .where(and(eq(bankAccountsTable.brandId, finalBrandId), ne(bankAccountsTable.id, acct.id)));
      updates.isPrimary = true;
    }

    const [row] = await db.update(bankAccountsTable).set(updates).where(eq(bankAccountsTable.id, acct.id)).returning();
    await writeAudit(req, { entityType: "BankAccount", entityId: acct.id, action: pending ? "approve_edit" : "approve_create" });
    await logActivity(
      req.user?.name ?? "Checker",
      `Approved bank account ${maskAcct(row.accountNumber)} (${row.bankName})${pending ? " edit" : ""}`,
      row.brandId != null ? String(row.brandId) : String(row.id),
      "success",
    );
    return res.json(mapBankAccount(row));
  } catch (err) {
    req.log.error({ err }, "approve bank account failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Checker rejects a pending bank account — discards edit, or marks a new entry REJECTED
router.post("/onboarding/bank-account/:id/reject", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { notes } = (req.body ?? {}) as { notes?: string };
    const [acct] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, parseInt(String(req.params.id))));
    if (!acct) return res.status(404).json({ error: "Bank account not found" });
    if (acct.status !== "PENDING_APPROVAL") {
      return res.status(400).json({ error: "Bank account is not pending approval" });
    }

    const wasEdit = !!acct.pendingChanges;
    const newStatus = wasEdit ? "ACTIVE" : "REJECTED";
    const [row] = await db
      .update(bankAccountsTable)
      .set({ status: newStatus, pendingChanges: null, updatedAt: new Date() })
      .where(eq(bankAccountsTable.id, acct.id))
      .returning();

    await writeAudit(req, { entityType: "BankAccount", entityId: acct.id, action: wasEdit ? "reject_edit" : "reject_create", changedFields: notes ? { notes } : undefined });
    await logActivity(
      req.user?.name ?? "Checker",
      `Rejected bank account ${maskAcct(row.accountNumber)} (${row.bankName})${wasEdit ? " edit" : ""}${notes ? ` — ${notes}` : ""}`,
      row.brandId != null ? String(row.brandId) : String(row.id),
      "warning",
    );
    return res.json(mapBankAccount(row));
  } catch (err) {
    req.log.error({ err }, "reject bank account failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Set a bank account as primary — privileged override only. Maker primary changes
// MUST go through propose-edit so they are checker-approved (governance).
router.post("/onboarding/bank-account/:id/primary", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [acct] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, id));
    if (!acct) return res.status(404).json({ error: "Bank account not found" });
    await db.update(bankAccountsTable).set({ isPrimary: false }).where(eq(bankAccountsTable.brandId, acct.brandId));
    const [row] = await db.update(bankAccountsTable).set({ isPrimary: true }).where(eq(bankAccountsTable.id, id)).returning();
    await writeAudit(req, { entityType: "BankAccount", entityId: id, action: "set_primary" });
    return res.json(mapBankAccount(row));
  } catch (err) {
    req.log.error({ err }, "set primary bank account failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------------------------------------------------------------------
// Jurisdiction → bank-account routing (per onboarding/brand)
// ----------------------------------------------------------------------------

// List the state→bank-account mappings for an onboarding.
router.get("/onboardings/:id/jurisdiction-mappings", async (req, res) => {
  try {
    const onboardingId = parseInt(String(req.params.id));
    const rows = await db
      .select()
      .from(bankAccountJurisdictionsTable)
      .where(eq(bankAccountJurisdictionsTable.onboardingId, onboardingId));
    const accounts = await db
      .select()
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.onboardingId, onboardingId));
    const acctById = new Map(accounts.map((a) => [a.id, a]));
    const mappings = rows
      .map((r) => {
        const acct = acctById.get(r.bankAccountId);
        return {
          id: r.id,
          stateCode: r.stateCode,
          stateName: stateName(r.stateCode),
          bankAccountId: r.bankAccountId,
          brandId: r.brandId,
          bankName: acct?.bankName ?? null,
          accountNumber: acct ? maskAcct(acct.accountNumber) : null,
          ifsc: acct?.ifsc ?? null,
          accountStatus: acct?.status ?? "MISSING",
        };
      })
      .sort((a, b) => a.stateCode.localeCompare(b.stateCode));
    return res.json({ mappings });
  } catch (err) {
    req.log.error({ err }, "list jurisdiction mappings failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Upsert a single state→account mapping. A state resolves to exactly one account
// per onboarding, so re-assigning a state replaces its previous account.
router.post("/onboardings/:id/jurisdiction-mappings", authorize(["maker", "checker", "admin"]), async (req, res) => {
  try {
    const onboardingId = parseInt(String(req.params.id));
    const { stateCode, bankAccountId } = req.body as { stateCode?: string; bankAccountId?: number };
    const code = String(stateCode ?? "").trim();
    if (!/^\d{2}$/.test(code)) {
      return res.status(400).json({ error: "A valid 2-digit GST state code is required" });
    }
    if (!bankAccountId) {
      return res.status(400).json({ error: "bankAccountId is required" });
    }

    const [acct] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, bankAccountId));
    if (!acct) return res.status(404).json({ error: "Bank account not found" });
    if (acct.onboardingId !== onboardingId) {
      return res.status(400).json({ error: "Bank account belongs to a different onboarding" });
    }
    if (acct.status !== "ACTIVE") {
      return res.status(400).json({ error: "Only an ACTIVE bank account can be a routing destination" });
    }

    const [existing] = await db
      .select()
      .from(bankAccountJurisdictionsTable)
      .where(and(eq(bankAccountJurisdictionsTable.onboardingId, onboardingId), eq(bankAccountJurisdictionsTable.stateCode, code)));

    let row;
    if (existing) {
      [row] = await db
        .update(bankAccountJurisdictionsTable)
        .set({ bankAccountId, brandId: acct.brandId, updatedAt: new Date() })
        .where(eq(bankAccountJurisdictionsTable.id, existing.id))
        .returning();
    } else {
      [row] = await db
        .insert(bankAccountJurisdictionsTable)
        .values({ onboardingId, brandId: acct.brandId, bankAccountId, stateCode: code })
        .returning();
    }

    await writeAudit(req, { entityType: "BankAccountJurisdiction", entityId: row.id, action: existing ? "update" : "create", changedFields: { stateCode: code, bankAccountId } });
    await logActivity(
      req.user?.name ?? "Maker",
      `Routed ${stateName(code)} (${code}) orders to ${acct.bankName} ${maskAcct(acct.accountNumber)}`,
      acct.brandId != null ? String(acct.brandId) : String(onboardingId),
      "info",
    );
    return res.status(existing ? 200 : 201).json({ id: row.id, stateCode: code, bankAccountId, brandId: acct.brandId });
  } catch (err) {
    req.log.error({ err }, "upsert jurisdiction mapping failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Remove a state mapping (state then falls back to the primary account at settlement time).
router.delete("/onboardings/:id/jurisdiction-mappings/:stateCode", authorize(["maker", "checker", "admin"]), async (req, res) => {
  try {
    const onboardingId = parseInt(String(req.params.id));
    const code = String(req.params.stateCode).trim();
    const [row] = await db
      .delete(bankAccountJurisdictionsTable)
      .where(and(eq(bankAccountJurisdictionsTable.onboardingId, onboardingId), eq(bankAccountJurisdictionsTable.stateCode, code)))
      .returning();
    if (!row) return res.status(404).json({ error: "Mapping not found" });
    await writeAudit(req, { entityType: "BankAccountJurisdiction", entityId: row.id, action: "delete", changedFields: { stateCode: code } });
    return res.json({ deleted: true, stateCode: code });
  } catch (err) {
    req.log.error({ err }, "delete jurisdiction mapping failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------------------------------------------------------------------
// Warehouse → bank-account routing (Task #11) — the settlement routing source.
// Each warehouse resolves to exactly one account; an account can hold many
// warehouses. Warehouses with no mapping fall back to the primary account.
// ----------------------------------------------------------------------------

// List all warehouses for an onboarding with their current routing (if any).
router.get("/onboardings/:id/warehouse-mappings", async (req, res) => {
  try {
    const onboardingId = parseInt(String(req.params.id));
    const warehouses = await db
      .select()
      .from(warehousesTable)
      .where(eq(warehousesTable.onboardingId, onboardingId));
    const routing = await db
      .select()
      .from(warehouseBankRoutingTable)
      .where(eq(warehouseBankRoutingTable.onboardingId, onboardingId));
    const accounts = await db
      .select()
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.onboardingId, onboardingId));
    const acctById = new Map(accounts.map((a) => [a.id, a]));
    const routeByWarehouse = new Map(routing.map((r) => [r.warehouseId, r]));
    const primaryAccount = accounts.find((a) => a.isPrimary && a.status === "ACTIVE")
      ?? accounts.find((a) => a.status === "ACTIVE")
      ?? null;

    const mappings = warehouses
      .map((w) => {
        const route = routeByWarehouse.get(w.id);
        const acct = route ? acctById.get(route.bankAccountId) : undefined;
        const effectiveAcct = acct ?? (primaryAccount ?? undefined);
        return {
          warehouseId: w.id,
          warehouseCode: w.warehouseCode ?? `WH-${String(w.id).padStart(5, "0")}`,
          warehouseName: w.warehouseName,
          warehouseState: w.warehouseState,
          brandId: w.brandId,
          isMapped: !!acct,
          bankAccountId: acct?.id ?? null,
          bankName: effectiveAcct?.bankName ?? null,
          accountNumber: effectiveAcct ? maskAcct(effectiveAcct.accountNumber) : null,
          ifsc: effectiveAcct?.ifsc ?? null,
          // True when this warehouse has no explicit mapping and is using the primary fallback.
          usingPrimaryFallback: !acct && !!primaryAccount,
        };
      })
      .sort((a, b) => a.warehouseCode.localeCompare(b.warehouseCode));
    return res.json({ mappings });
  } catch (err) {
    req.log.error({ err }, "list warehouse mappings failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Upsert a single warehouse → account mapping. A warehouse resolves to exactly
// one account, so re-assigning a warehouse replaces its previous account.
router.post("/onboardings/:id/warehouse-mappings", authorize(["maker", "checker", "admin"]), async (req, res) => {
  try {
    const onboardingId = parseInt(String(req.params.id));
    const { warehouseId, bankAccountId } = req.body as { warehouseId?: number; bankAccountId?: number };
    if (!warehouseId) return res.status(400).json({ error: "warehouseId is required" });
    if (!bankAccountId) return res.status(400).json({ error: "bankAccountId is required" });

    const [wh] = await db.select().from(warehousesTable).where(eq(warehousesTable.id, warehouseId));
    if (!wh) return res.status(404).json({ error: "Warehouse not found" });
    if (wh.onboardingId !== onboardingId) {
      return res.status(400).json({ error: "Warehouse belongs to a different onboarding" });
    }

    const [acct] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, bankAccountId));
    if (!acct) return res.status(404).json({ error: "Bank account not found" });
    if (acct.onboardingId !== onboardingId) {
      return res.status(400).json({ error: "Bank account belongs to a different onboarding" });
    }
    if (acct.status !== "ACTIVE") {
      return res.status(400).json({ error: "Only an ACTIVE bank account can be a routing destination" });
    }

    const [existing] = await db
      .select()
      .from(warehouseBankRoutingTable)
      .where(eq(warehouseBankRoutingTable.warehouseId, warehouseId));

    let row;
    if (existing) {
      [row] = await db
        .update(warehouseBankRoutingTable)
        .set({ bankAccountId, brandId: wh.brandId, updatedAt: new Date() })
        .where(eq(warehouseBankRoutingTable.id, existing.id))
        .returning();
    } else {
      [row] = await db
        .insert(warehouseBankRoutingTable)
        .values({ onboardingId, brandId: wh.brandId, warehouseId, bankAccountId })
        .returning();
    }

    await writeAudit(req, { entityType: "WarehouseBankRouting", entityId: row.id, action: existing ? "update" : "create", changedFields: { warehouseId, bankAccountId } });
    await logActivity(
      req.user?.name ?? "Maker",
      `Routed warehouse ${wh.warehouseCode ?? wh.warehouseName} settlements to ${acct.bankName} ${maskAcct(acct.accountNumber)}`,
      String(wh.brandId),
      "info",
    );
    return res.status(existing ? 200 : 201).json({ id: row.id, warehouseId, bankAccountId, brandId: wh.brandId });
  } catch (err) {
    req.log.error({ err }, "upsert warehouse mapping failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Remove a warehouse mapping (warehouse then falls back to the primary account).
router.delete("/onboardings/:id/warehouse-mappings/:warehouseId", authorize(["maker", "checker", "admin"]), async (req, res) => {
  try {
    const onboardingId = parseInt(String(req.params.id));
    const warehouseId = parseInt(String(req.params.warehouseId));
    // Scope the delete to the onboarding in the URL so a known warehouseId can
    // never remove a mapping belonging to a different onboarding.
    const [row] = await db
      .delete(warehouseBankRoutingTable)
      .where(and(
        eq(warehouseBankRoutingTable.warehouseId, warehouseId),
        eq(warehouseBankRoutingTable.onboardingId, onboardingId),
      ))
      .returning();
    if (!row) return res.status(404).json({ error: "Mapping not found" });
    await writeAudit(req, { entityType: "WarehouseBankRouting", entityId: row.id, action: "delete", changedFields: { warehouseId } });
    return res.json({ deleted: true, warehouseId });
  } catch (err) {
    req.log.error({ err }, "delete warehouse mapping failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Remove a bank account — privileged override only (checker/admin)
router.delete("/onboarding/bank-account/:id", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
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
