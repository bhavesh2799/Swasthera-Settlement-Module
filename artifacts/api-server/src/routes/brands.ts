import { Router } from "express";
import { db } from "@workspace/db";
import { brandsTable, warehousesTable, onboardingsTable, activityTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { authorize } from "../middlewares/rbac";

const router = Router();

async function logActivity(
  user: string,
  action: string,
  entityType: string,
  entityRef: string,
  level: "info" | "success" | "warning" = "info",
) {
  await db.insert(activityTable).values({ user, action, entityType, entityRef, level });
}

function parsePending(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function genBrandCode(id: number) {
  return `BR-${String(id).padStart(5, "0")}`;
}

function genWarehouseCode(id: number) {
  return `WH-${String(id).padStart(5, "0")}`;
}

function mapBrand(b: typeof brandsTable.$inferSelect) {
  return {
    id: b.id,
    brandCode: b.brandCode ?? genBrandCode(b.id),
    onboardingId: b.onboardingId,
    companyId: b.companyId ?? `CO-${String(b.onboardingId).padStart(5, "0")}`,
    brandName: b.brandName,
    brandLegalName: b.brandLegalName,
    brandCategory: b.brandCategory,
    brandType: b.brandType,
    status: b.status,
    commissionRate: parseFloat(String(b.commissionRate)),
    commissionType: b.commissionType,
    tierConfig: b.tierConfig ? JSON.parse(b.tierConfig) : null,
    returnWindowDays: b.returnWindowDays,
    tcsRate: parseFloat(String(b.tcsRate)),
    tdsRate: parseFloat(String(b.tdsRate)),
    mdrRate: parseFloat(String(b.mdrRate)),
    tcsApplicable: b.tcsApplicable,
    fyndBrandId: b.fyndBrandId,
    pendingChanges: parsePending(b.pendingChanges),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

function mapWarehouse(w: typeof warehousesTable.$inferSelect) {
  return {
    id: w.id,
    warehouseCode: w.warehouseCode ?? genWarehouseCode(w.id),
    brandId: w.brandId,
    onboardingId: w.onboardingId,
    warehouseName: w.warehouseName,
    warehouseState: w.warehouseState,
    warehouseGstin: w.warehouseGstin,
    warehouseAddress: w.warehouseAddress,
    isPrimary: w.isPrimary,
    isActive: w.isActive,
    status: w.status,
    pendingChanges: parsePending(w.pendingChanges),
    stateCode: w.stateCode ?? w.warehouseGstin?.substring(0, 2),
    fyndLocationId: w.fyndLocationId,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

// ── Brands ───────────────────────────────────────────────────────────────────

// List ALL brands across all onboardings (used by bulk upload for brand code lookup)
router.get("/brands", async (req, res) => {
  try {
    const brands = await db.select().from(brandsTable).orderBy(brandsTable.createdAt);
    return res.json(brands.map(mapBrand));
  } catch (err) {
    req.log.error({ err }, "list all brands error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// List all brands for an onboarding (auto-populates from onboarding data if table is empty for this record)
router.get("/onboardings/:id/brands", async (req, res) => {
  try {
    const onboardingId = parseInt(String(req.params.id));
    let brands = await db
      .select()
      .from(brandsTable)
      .where(eq(brandsTable.onboardingId, onboardingId))
      .orderBy(brandsTable.createdAt);

    // Auto-populate: if no brands exist yet, seed from the onboarding's denormalized brand fields
    if (brands.length === 0) {
      const [ob] = await db.select().from(onboardingsTable).where(eq(onboardingsTable.id, onboardingId));
      if (ob && ob.brandName) {
        const [newBrand] = await db.insert(brandsTable).values({
          onboardingId: ob.id,
          companyId: `CO-${String(ob.id).padStart(5, "0")}`,
          brandName: ob.brandName,
          brandLegalName: ob.brandLegalName,
          brandCategory: ob.brandCategory,
          brandType: ob.brandType,
          commissionRate: ob.commissionRate,
          commissionType: ob.commissionType ?? "FLAT_PERCENT",
          returnWindowDays: ob.returnWindowDays,
          tcsRate: ob.tcsRate,
          tdsRate: ob.tdsRate,
          mdrRate: ob.mdrRate,
          tcsApplicable: ob.tcsApplicable,
          status: "ACTIVE",
        }).returning();

        const [brandWithCode] = await db.update(brandsTable)
          .set({ brandCode: genBrandCode(newBrand.id) })
          .where(eq(brandsTable.id, newBrand.id))
          .returning();

        // Also create the primary warehouse for this brand
        if (ob.warehouseName && ob.warehouseGstin) {
          const [newWarehouse] = await db.insert(warehousesTable).values({
            brandId: brandWithCode.id,
            onboardingId: ob.id,
            warehouseName: ob.warehouseName,
            warehouseState: ob.warehouseState,
            warehouseGstin: ob.warehouseGstin,
            warehouseAddress: ob.warehouseAddress,
            isPrimary: true,
            isActive: true,
            stateCode: ob.warehouseGstin.substring(0, 2),
          }).returning();

          await db.update(warehousesTable)
            .set({ warehouseCode: genWarehouseCode(newWarehouse.id) })
            .where(eq(warehousesTable.id, newWarehouse.id));
        }

        brands = [brandWithCode];
      }
    }

    return res.json(brands.map(mapBrand));
  } catch (err) {
    req.log.error({ err }, "list brands error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Create a brand for an onboarding
router.post("/onboardings/:id/brands", authorize(["maker", "admin"]), async (req, res) => {
  try {
    const onboardingId = parseInt(String(req.params.id));
    const [ob] = await db
      .select()
      .from(onboardingsTable)
      .where(eq(onboardingsTable.id, onboardingId));
    if (!ob) return res.status(404).json({ error: "Onboarding not found" });

    const body = req.body as {
      brandName: string;
      brandLegalName?: string;
      brandCategory: string;
      brandType: string;
      commissionRate?: number;
      commissionType?: string;
      tierConfig?: object;
      returnWindowDays?: number;
      tcsRate?: number;
      tdsRate?: number;
      mdrRate?: number;
      tcsApplicable?: boolean;
    };

    if (!body.brandName || !body.brandCategory || !body.brandType) {
      return res.status(400).json({ error: "brandName, brandCategory, brandType are required" });
    }

    const [brand] = await db
      .insert(brandsTable)
      .values({
        onboardingId,
        companyId: `CO-${String(onboardingId).padStart(5, "0")}`,
        brandName: body.brandName,
        brandLegalName: body.brandLegalName,
        brandCategory: body.brandCategory,
        brandType: body.brandType,
        commissionRate: String(body.commissionRate ?? ob.commissionRate ?? "0"),
        commissionType: body.commissionType ?? ob.commissionType ?? "FLAT_PERCENT",
        tierConfig: body.tierConfig ? JSON.stringify(body.tierConfig) : null,
        returnWindowDays: body.returnWindowDays ?? ob.returnWindowDays ?? 15,
        tcsRate: String(body.tcsRate ?? ob.tcsRate ?? "1"),
        tdsRate: String(body.tdsRate ?? ob.tdsRate ?? "1"),
        mdrRate: String(body.mdrRate ?? ob.mdrRate ?? "0"),
        tcsApplicable: body.tcsApplicable !== false,
        status: "PENDING_APPROVAL",
      })
      .returning();

    // Set the brand code now that we have the ID
    const [updated] = await db
      .update(brandsTable)
      .set({ brandCode: genBrandCode(brand.id) })
      .where(eq(brandsTable.id, brand.id))
      .returning();

    await logActivity(
      req.user?.name ?? "Maker",
      `Added brand "${updated.brandName}" (${updated.brandCode}) — awaiting Checker approval`,
      "brand",
      updated.brandCode ?? genBrandCode(updated.id),
      "info",
    );

    return res.status(201).json(mapBrand(updated));
  } catch (err) {
    req.log.error({ err }, "create brand error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Direct brand update — privileged override only. Maker edits MUST go through
// /brands/:id/propose-edit so changes are checker-approved (governance).
router.put("/brands/:id", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const updates: Partial<typeof brandsTable.$inferInsert> = {};

    if (body.brandName !== undefined) updates.brandName = body.brandName as string;
    if (body.brandLegalName !== undefined) updates.brandLegalName = body.brandLegalName as string;
    if (body.brandCategory !== undefined) updates.brandCategory = body.brandCategory as string;
    if (body.brandType !== undefined) updates.brandType = body.brandType as string;
    if (body.commissionRate !== undefined) updates.commissionRate = String(body.commissionRate);
    if (body.commissionType !== undefined) updates.commissionType = body.commissionType as string;
    if (body.tierConfig !== undefined) updates.tierConfig = JSON.stringify(body.tierConfig);
    if (body.returnWindowDays !== undefined) updates.returnWindowDays = body.returnWindowDays as number;
    if (body.tcsRate !== undefined) updates.tcsRate = String(body.tcsRate);
    if (body.tdsRate !== undefined) updates.tdsRate = String(body.tdsRate);
    if (body.mdrRate !== undefined) updates.mdrRate = String(body.mdrRate);
    if (body.tcsApplicable !== undefined) updates.tcsApplicable = body.tcsApplicable as boolean;
    if (body.status !== undefined) updates.status = body.status as typeof brandsTable.$inferInsert["status"];
    if (body.fyndBrandId !== undefined) updates.fyndBrandId = body.fyndBrandId as string;
    updates.updatedAt = new Date();

    const [row] = await db
      .update(brandsTable)
      .set(updates)
      .where(eq(brandsTable.id, parseInt(String(req.params.id))))
      .returning();
    if (!row) return res.status(404).json({ error: "Brand not found" });
    return res.json(mapBrand(row));
  } catch (err) {
    req.log.error({ err }, "update brand error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Maker proposes an edit to a brand — stored as pendingChanges, awaits Checker approval
const BRAND_EDITABLE = [
  "brandName", "brandLegalName", "brandCategory", "brandType",
  "commissionRate", "commissionType", "returnWindowDays", "tcsRate", "tdsRate", "mdrRate", "tcsApplicable",
] as const;

router.post("/brands/:id/propose-edit", authorize(["maker", "admin"]), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.id, parseInt(String(req.params.id))));
    if (!brand) return res.status(404).json({ error: "Brand not found" });

    const proposed: Record<string, unknown> = {};
    for (const f of BRAND_EDITABLE) {
      if (body[f] !== undefined) proposed[f] = body[f];
    }
    if (Object.keys(proposed).length === 0) {
      return res.status(400).json({ error: "No editable fields supplied" });
    }

    const [row] = await db
      .update(brandsTable)
      .set({ pendingChanges: JSON.stringify(proposed), status: "PENDING_APPROVAL", updatedAt: new Date() })
      .where(eq(brandsTable.id, brand.id))
      .returning();

    await logActivity(
      req.user?.name ?? "Maker",
      `Proposed edit to brand "${brand.brandName}" (${row.brandCode}) — awaiting Checker approval`,
      "brand",
      row.brandCode ?? genBrandCode(row.id),
      "info",
    );
    return res.json(mapBrand(row));
  } catch (err) {
    req.log.error({ err }, "propose brand edit error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Checker approves a pending brand (new brand or proposed edit)
router.post("/brands/:id/approve", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.id, parseInt(String(req.params.id))));
    if (!brand) return res.status(404).json({ error: "Brand not found" });
    if (brand.status !== "PENDING_APPROVAL") {
      return res.status(400).json({ error: "Brand is not pending approval" });
    }

    const pending = parsePending(brand.pendingChanges);
    const updates: Partial<typeof brandsTable.$inferInsert> = { status: "ACTIVE", pendingChanges: null, updatedAt: new Date() };
    if (pending) {
      for (const f of BRAND_EDITABLE) {
        if (pending[f] === undefined) continue;
        if (f === "commissionRate" || f === "tcsRate" || f === "tdsRate" || f === "mdrRate") {
          (updates as Record<string, unknown>)[f] = String(pending[f]);
        } else {
          (updates as Record<string, unknown>)[f] = pending[f];
        }
      }
    }

    const [row] = await db.update(brandsTable).set(updates).where(eq(brandsTable.id, brand.id)).returning();

    // MDR is operationally sourced from the onboarding's commercial terms at
    // settlement time (mirroring commissionRate/tcsRate/tdsRate). Keep the
    // onboarding snapshot in sync when an approved brand edit changes the MDR
    // rate, so the new rate actually reaches the next settlement run.
    if (pending && pending.mdrRate !== undefined && row.onboardingId != null) {
      await db.update(onboardingsTable)
        .set({ mdrRate: String(pending.mdrRate), updatedAt: new Date() })
        .where(eq(onboardingsTable.id, row.onboardingId));
    }

    await logActivity(
      req.user?.name ?? "Checker",
      `Approved brand "${row.brandName}" (${row.brandCode})${pending ? " edit" : ""}`,
      "brand",
      row.brandCode ?? genBrandCode(row.id),
      "success",
    );
    return res.json(mapBrand(row));
  } catch (err) {
    req.log.error({ err }, "approve brand error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Checker rejects a pending brand — discards proposed edit, or marks a brand-new entry REJECTED
router.post("/brands/:id/reject", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { notes } = req.body as { notes?: string };
    const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.id, parseInt(String(req.params.id))));
    if (!brand) return res.status(404).json({ error: "Brand not found" });
    if (brand.status !== "PENDING_APPROVAL") {
      return res.status(400).json({ error: "Brand is not pending approval" });
    }

    const wasEdit = !!brand.pendingChanges;
    // An edit reverts to ACTIVE (live values untouched); a brand-new entry becomes REJECTED.
    const newStatus = wasEdit ? "ACTIVE" : "REJECTED";
    const [row] = await db
      .update(brandsTable)
      .set({ status: newStatus, pendingChanges: null, updatedAt: new Date() })
      .where(eq(brandsTable.id, brand.id))
      .returning();

    await logActivity(
      req.user?.name ?? "Checker",
      `Rejected brand "${row.brandName}" (${row.brandCode})${wasEdit ? " edit" : ""}${notes ? ` — ${notes}` : ""}`,
      "brand",
      row.brandCode ?? genBrandCode(row.id),
      "warning",
    );
    return res.json(mapBrand(row));
  } catch (err) {
    req.log.error({ err }, "reject brand error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Warehouses ────────────────────────────────────────────────────────────────

// List warehouses for a brand
router.get("/brands/:id/warehouses", async (req, res) => {
  try {
    const brandId = parseInt(String(req.params.id));
    const warehouses = await db
      .select()
      .from(warehousesTable)
      .where(and(eq(warehousesTable.brandId, brandId), eq(warehousesTable.isActive, true)))
      .orderBy(warehousesTable.createdAt);
    return res.json(warehouses.map(mapWarehouse));
  } catch (err) {
    req.log.error({ err }, "list warehouses error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Create a warehouse for a brand
router.post("/brands/:id/warehouses", authorize(["maker", "admin"]), async (req, res) => {
  try {
    const brandId = parseInt(String(req.params.id));
    const [brand] = await db
      .select()
      .from(brandsTable)
      .where(eq(brandsTable.id, brandId));
    if (!brand) return res.status(404).json({ error: "Brand not found" });

    const body = req.body as {
      warehouseName: string;
      warehouseState: string;
      warehouseGstin: string;
      warehouseAddress: string;
      isPrimary?: boolean;
    };

    if (!body.warehouseName || !body.warehouseState || !body.warehouseGstin || !body.warehouseAddress) {
      return res.status(400).json({ error: "warehouseName, warehouseState, warehouseGstin, warehouseAddress are required" });
    }

    // NOTE: do NOT unset other primaries here. A new warehouse stays
    // PENDING_APPROVAL and must not mutate live primary selection until a
    // Checker approves it (see /warehouses/:id/approve). orders.ts only reads
    // ACTIVE primary warehouses, so a pending primary never shadows the live one.
    const [warehouse] = await db
      .insert(warehousesTable)
      .values({
        brandId,
        onboardingId: brand.onboardingId,
        warehouseName: body.warehouseName,
        warehouseState: body.warehouseState,
        warehouseGstin: body.warehouseGstin,
        warehouseAddress: body.warehouseAddress,
        isPrimary: body.isPrimary ?? false,
        isActive: true,
        status: "PENDING_APPROVAL",
        stateCode: body.warehouseGstin.substring(0, 2),
      })
      .returning();

    // Set warehouse code
    const [updated] = await db
      .update(warehousesTable)
      .set({ warehouseCode: genWarehouseCode(warehouse.id) })
      .where(eq(warehousesTable.id, warehouse.id))
      .returning();

    await logActivity(
      req.user?.name ?? "Maker",
      `Added warehouse "${updated.warehouseName}" (${updated.warehouseCode}) — awaiting Checker approval`,
      "warehouse",
      updated.warehouseCode ?? genWarehouseCode(updated.id),
      "info",
    );

    return res.status(201).json(mapWarehouse(updated));
  } catch (err) {
    req.log.error({ err }, "create warehouse error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Direct warehouse update — privileged override only. Maker edits MUST go through
// /warehouses/:id/propose-edit so changes are checker-approved (governance).
router.put("/warehouses/:id", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const updates: Partial<typeof warehousesTable.$inferInsert> = {};

    if (body.warehouseName !== undefined) updates.warehouseName = body.warehouseName as string;
    if (body.warehouseState !== undefined) updates.warehouseState = body.warehouseState as string;
    if (body.warehouseGstin !== undefined) {
      updates.warehouseGstin = body.warehouseGstin as string;
      updates.stateCode = (body.warehouseGstin as string).substring(0, 2);
    }
    if (body.warehouseAddress !== undefined) updates.warehouseAddress = body.warehouseAddress as string;
    if (body.isPrimary !== undefined) updates.isPrimary = body.isPrimary as boolean;
    if (body.isActive !== undefined) updates.isActive = body.isActive as boolean;
    if (body.status !== undefined) updates.status = body.status as string;
    if (body.fyndLocationId !== undefined) updates.fyndLocationId = body.fyndLocationId as string;
    updates.updatedAt = new Date();

    const [row] = await db
      .update(warehousesTable)
      .set(updates)
      .where(eq(warehousesTable.id, parseInt(String(req.params.id))))
      .returning();
    if (!row) return res.status(404).json({ error: "Warehouse not found" });
    return res.json(mapWarehouse(row));
  } catch (err) {
    req.log.error({ err }, "update warehouse error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Maker proposes an edit to a warehouse — stored as pendingChanges, awaits Checker approval
const WAREHOUSE_EDITABLE = [
  "warehouseName", "warehouseState", "warehouseGstin", "warehouseAddress", "isPrimary",
] as const;

router.post("/warehouses/:id/propose-edit", authorize(["maker", "admin"]), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const [wh] = await db.select().from(warehousesTable).where(eq(warehousesTable.id, parseInt(String(req.params.id))));
    if (!wh) return res.status(404).json({ error: "Warehouse not found" });

    const proposed: Record<string, unknown> = {};
    for (const f of WAREHOUSE_EDITABLE) {
      if (body[f] !== undefined) proposed[f] = body[f];
    }
    if (Object.keys(proposed).length === 0) {
      return res.status(400).json({ error: "No editable fields supplied" });
    }

    const [row] = await db
      .update(warehousesTable)
      .set({ pendingChanges: JSON.stringify(proposed), status: "PENDING_APPROVAL", updatedAt: new Date() })
      .where(eq(warehousesTable.id, wh.id))
      .returning();

    await logActivity(
      req.user?.name ?? "Maker",
      `Proposed edit to warehouse "${wh.warehouseName}" (${row.warehouseCode}) — awaiting Checker approval`,
      "warehouse",
      row.warehouseCode ?? genWarehouseCode(row.id),
      "info",
    );
    return res.json(mapWarehouse(row));
  } catch (err) {
    req.log.error({ err }, "propose warehouse edit error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Checker approves a pending warehouse (new warehouse or proposed edit)
router.post("/warehouses/:id/approve", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const [wh] = await db.select().from(warehousesTable).where(eq(warehousesTable.id, parseInt(String(req.params.id))));
    if (!wh) return res.status(404).json({ error: "Warehouse not found" });
    if (wh.status !== "PENDING_APPROVAL") {
      return res.status(400).json({ error: "Warehouse is not pending approval" });
    }

    const pending = parsePending(wh.pendingChanges);
    const updates: Partial<typeof warehousesTable.$inferInsert> = { status: "ACTIVE", pendingChanges: null, updatedAt: new Date() };
    if (pending) {
      for (const f of WAREHOUSE_EDITABLE) {
        if (pending[f] === undefined) continue;
        (updates as Record<string, unknown>)[f] = pending[f];
      }
      if (pending.warehouseGstin !== undefined) {
        updates.stateCode = String(pending.warehouseGstin).substring(0, 2);
      }
    }

    // Enforce single-primary at approval time — covers both a brand-new primary
    // warehouse (pending === null, row already flagged primary) and an edit that
    // proposes primary. This is the only point where live primary state changes.
    const becomingPrimary = pending ? pending.isPrimary === true : wh.isPrimary === true;
    if (becomingPrimary) {
      await db
        .update(warehousesTable)
        .set({ isPrimary: false })
        .where(and(eq(warehousesTable.brandId, wh.brandId), ne(warehousesTable.id, wh.id)));
      updates.isPrimary = true;
    }

    const [row] = await db.update(warehousesTable).set(updates).where(eq(warehousesTable.id, wh.id)).returning();
    await logActivity(
      req.user?.name ?? "Checker",
      `Approved warehouse "${row.warehouseName}" (${row.warehouseCode})${pending ? " edit" : ""}`,
      "warehouse",
      row.warehouseCode ?? genWarehouseCode(row.id),
      "success",
    );
    return res.json(mapWarehouse(row));
  } catch (err) {
    req.log.error({ err }, "approve warehouse error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Checker rejects a pending warehouse — discards proposed edit, or marks a brand-new entry REJECTED
router.post("/warehouses/:id/reject", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const { notes } = req.body as { notes?: string };
    const [wh] = await db.select().from(warehousesTable).where(eq(warehousesTable.id, parseInt(String(req.params.id))));
    if (!wh) return res.status(404).json({ error: "Warehouse not found" });
    if (wh.status !== "PENDING_APPROVAL") {
      return res.status(400).json({ error: "Warehouse is not pending approval" });
    }

    const wasEdit = !!wh.pendingChanges;
    const newStatus = wasEdit ? "ACTIVE" : "REJECTED";
    const [row] = await db
      .update(warehousesTable)
      .set({ status: newStatus, pendingChanges: null, isActive: wasEdit ? wh.isActive : false, updatedAt: new Date() })
      .where(eq(warehousesTable.id, wh.id))
      .returning();

    await logActivity(
      req.user?.name ?? "Checker",
      `Rejected warehouse "${row.warehouseName}" (${row.warehouseCode})${wasEdit ? " edit" : ""}${notes ? ` — ${notes}` : ""}`,
      "warehouse",
      row.warehouseCode ?? genWarehouseCode(row.id),
      "warning",
    );
    return res.json(mapWarehouse(row));
  } catch (err) {
    req.log.error({ err }, "reject warehouse error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Deactivate a warehouse — privileged override only. Deactivation mutates live
// warehouse state, so it must be checker/admin gated (governance), never maker.
router.delete("/warehouses/:id", authorize(["checker", "admin"]), async (req, res) => {
  try {
    const [row] = await db
      .update(warehousesTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(warehousesTable.id, parseInt(String(req.params.id))))
      .returning();
    if (!row) return res.status(404).json({ error: "Warehouse not found" });
    await logActivity(
      req.user?.name ?? "Checker",
      `Deactivated warehouse "${row.warehouseName}" (${row.warehouseCode})`,
      "warehouse",
      row.warehouseCode ?? genWarehouseCode(row.id),
      "warning",
    );
    return res.json({ deactivated: true, id: row.id });
  } catch (err) {
    req.log.error({ err }, "delete warehouse error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
