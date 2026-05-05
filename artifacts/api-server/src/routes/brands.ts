import { Router } from "express";
import { db } from "@workspace/db";
import { brandsTable, warehousesTable, onboardingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

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
    tcsApplicable: b.tcsApplicable,
    fyndBrandId: b.fyndBrandId,
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
    stateCode: w.stateCode ?? w.warehouseGstin?.substring(0, 2),
    fyndLocationId: w.fyndLocationId,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

// ── Brands ───────────────────────────────────────────────────────────────────

// List all brands for an onboarding
router.get("/onboardings/:id/brands", async (req, res) => {
  try {
    const onboardingId = parseInt(req.params.id);
    const brands = await db
      .select()
      .from(brandsTable)
      .where(eq(brandsTable.onboardingId, onboardingId))
      .orderBy(brandsTable.createdAt);
    res.json(brands.map(mapBrand));
  } catch (err) {
    req.log.error({ err }, "list brands error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a brand for an onboarding
router.post("/onboardings/:id/brands", async (req, res) => {
  try {
    const onboardingId = parseInt(req.params.id);
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
        tcsApplicable: body.tcsApplicable !== false,
        status: "ACTIVE",
      })
      .returning();

    // Set the brand code now that we have the ID
    const [updated] = await db
      .update(brandsTable)
      .set({ brandCode: genBrandCode(brand.id) })
      .where(eq(brandsTable.id, brand.id))
      .returning();

    res.status(201).json(mapBrand(updated));
  } catch (err) {
    req.log.error({ err }, "create brand error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update a brand
router.put("/brands/:id", async (req, res) => {
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
    if (body.tcsApplicable !== undefined) updates.tcsApplicable = body.tcsApplicable as boolean;
    if (body.status !== undefined) updates.status = body.status as "DRAFT" | "ACTIVE" | "INACTIVE";
    if (body.fyndBrandId !== undefined) updates.fyndBrandId = body.fyndBrandId as string;
    updates.updatedAt = new Date();

    const [row] = await db
      .update(brandsTable)
      .set(updates)
      .where(eq(brandsTable.id, parseInt(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: "Brand not found" });
    res.json(mapBrand(row));
  } catch (err) {
    req.log.error({ err }, "update brand error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Warehouses ────────────────────────────────────────────────────────────────

// List warehouses for a brand
router.get("/brands/:id/warehouses", async (req, res) => {
  try {
    const brandId = parseInt(req.params.id);
    const warehouses = await db
      .select()
      .from(warehousesTable)
      .where(and(eq(warehousesTable.brandId, brandId), eq(warehousesTable.isActive, true)))
      .orderBy(warehousesTable.createdAt);
    res.json(warehouses.map(mapWarehouse));
  } catch (err) {
    req.log.error({ err }, "list warehouses error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a warehouse for a brand
router.post("/brands/:id/warehouses", async (req, res) => {
  try {
    const brandId = parseInt(req.params.id);
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

    // If this is primary, unset all others for this brand
    if (body.isPrimary) {
      await db
        .update(warehousesTable)
        .set({ isPrimary: false })
        .where(eq(warehousesTable.brandId, brandId));
    }

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
        stateCode: body.warehouseGstin.substring(0, 2),
      })
      .returning();

    // Set warehouse code
    const [updated] = await db
      .update(warehousesTable)
      .set({ warehouseCode: genWarehouseCode(warehouse.id) })
      .where(eq(warehousesTable.id, warehouse.id))
      .returning();

    res.status(201).json(mapWarehouse(updated));
  } catch (err) {
    req.log.error({ err }, "create warehouse error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update a warehouse
router.put("/warehouses/:id", async (req, res) => {
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
    if (body.fyndLocationId !== undefined) updates.fyndLocationId = body.fyndLocationId as string;
    updates.updatedAt = new Date();

    const [row] = await db
      .update(warehousesTable)
      .set(updates)
      .where(eq(warehousesTable.id, parseInt(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: "Warehouse not found" });
    res.json(mapWarehouse(row));
  } catch (err) {
    req.log.error({ err }, "update warehouse error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Deactivate a warehouse
router.delete("/warehouses/:id", async (req, res) => {
  try {
    const [row] = await db
      .update(warehousesTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(warehousesTable.id, parseInt(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: "Warehouse not found" });
    res.json({ deactivated: true, id: row.id });
  } catch (err) {
    req.log.error({ err }, "delete warehouse error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
