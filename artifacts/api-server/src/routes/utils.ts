import { Router } from "express";
import { db, auditLogTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { ENTITY_TYPES, mandatoryFields } from "../services/validationRules";

const router = Router();

// Entity types + their mandatory fields (drives the dynamic onboarding form)
router.get("/utils/entity-types", (_req, res) => {
  res.json({ entityTypes: ENTITY_TYPES, mandatoryFields });
});

// Structured audit trail (optionally filtered by entity)
router.get("/audit-log", async (req, res) => {
  try {
    const { entityType, entityId } = req.query as { entityType?: string; entityId?: string };
    const conditions = [];
    if (entityType) conditions.push(eq(auditLogTable.entityType, entityType));
    if (entityId) conditions.push(eq(auditLogTable.entityId, entityId));
    const rows = await db
      .select()
      .from(auditLogTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLogTable.createdAt))
      .limit(200);
    res.json({ entries: rows });
  } catch (err) {
    req.log.error({ err }, "audit log read failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * IFSC lookup — proxies the public Razorpay IFSC API (no key required).
 * Returns { bank, branch, city, state } for bank-account auto-populate.
 */
router.get("/utils/ifsc/:code", async (req, res) => {
  const code = String(req.params.code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) {
    return res.status(400).json({ error: "Invalid IFSC format", code });
  }
  try {
    const r = await fetch(`https://ifsc.razorpay.com/${code}`);
    if (!r.ok) {
      return res.status(404).json({ error: "IFSC not found", code });
    }
    const data = (await r.json()) as Record<string, string>;
    return res.json({
      ifsc: code,
      bank: data.BANK ?? "",
      branch: data.BRANCH ?? "",
      city: data.CITY ?? "",
      state: data.STATE ?? "",
      address: data.ADDRESS ?? "",
    });
  } catch (err) {
    req.log.error({ err }, "IFSC lookup failed");
    return res.status(502).json({ error: "IFSC lookup service unavailable", code });
  }
});

/**
 * PIN code lookup — proxies the public India Post API (no key required).
 * Returns { city, state, district } for warehouse address auto-populate.
 */
router.get("/utils/pincode/:pin", async (req, res) => {
  const pin = String(req.params.pin ?? "").trim();
  if (!/^\d{6}$/.test(pin)) {
    return res.status(400).json({ error: "Invalid PIN format", pin });
  }
  try {
    const r = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const arr = (await r.json()) as Array<{ Status: string; PostOffice?: Array<Record<string, string>> }>;
    const first = arr?.[0];
    if (!first || first.Status !== "Success" || !first.PostOffice?.length) {
      return res.status(404).json({ error: "PIN not found", pin });
    }
    const po = first.PostOffice[0];
    return res.json({
      pin,
      city: po.District ?? "",
      district: po.District ?? "",
      state: po.State ?? "",
    });
  } catch (err) {
    req.log.error({ err }, "PIN lookup failed");
    return res.status(502).json({ error: "PIN lookup service unavailable", pin });
  }
});

// State name → GST state code (first 2 digits of GSTIN)
const STATE_CODE_MAP: Record<string, string> = {
  "jammu and kashmir": "01", "himachal pradesh": "02", "punjab": "03", "chandigarh": "04",
  "uttarakhand": "05", "haryana": "06", "delhi": "07", "rajasthan": "08", "uttar pradesh": "09",
  "bihar": "10", "sikkim": "11", "arunachal pradesh": "12", "nagaland": "13", "manipur": "14",
  "mizoram": "15", "tripura": "16", "meghalaya": "17", "assam": "18", "west bengal": "19",
  "jharkhand": "20", "odisha": "21", "chhattisgarh": "22", "madhya pradesh": "23", "gujarat": "24",
  "maharashtra": "27", "karnataka": "29", "goa": "30", "kerala": "32", "tamil nadu": "33",
  "puducherry": "34", "telangana": "36", "andhra pradesh": "37",
};

/**
 * GST auto-fetch (SIMULATED — no live GSTN API key configured).
 * Derives a deterministic mock registered address/trade-name from the GSTIN so
 * the onboarding form can demonstrate auto-populate behaviour.
 */
router.post("/utils/gst-lookup", (req, res) => {
  const { gstn } = req.body as { gstn?: string };
  const code = String(gstn ?? "").trim().toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d$/.test(code)) {
    return res.status(400).json({ error: "Invalid GSTIN format", gstn: code });
  }
  const stateCode = code.slice(0, 2);
  const stateName =
    Object.entries(STATE_CODE_MAP).find(([, c]) => c === stateCode)?.[0] ?? "maharashtra";
  const titleState = stateName.replace(/\b\w/g, (m) => m.toUpperCase());
  return res.json({
    gstn: code,
    status: "Active",
    state: titleState,
    stateCode,
    tradeName: `${code.slice(2, 7)} Enterprises`,
    registeredAddress: `Unit 4, Commercial Complex, ${titleState}`,
    simulated: true,
  });
});

export default router;
