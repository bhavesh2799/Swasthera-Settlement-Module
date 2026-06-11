/**
 * Mandatory field rules per company entity type (BRD onboarding).
 * Used by both the onboarding submit gate and the frontend stepper.
 */
export type EntityType =
  | "private_limited"
  | "public_limited"
  | "llp"
  | "partnership"
  | "proprietorship";

export const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: "private_limited", label: "Private Limited" },
  { value: "public_limited", label: "Public Limited" },
  { value: "llp", label: "LLP" },
  { value: "partnership", label: "Partnership" },
  { value: "proprietorship", label: "Proprietorship" },
];

export const mandatoryFields: Record<EntityType, string[]> = {
  private_limited: ["pan", "gstn", "tan", "cin"],
  public_limited: ["pan", "gstn", "tan", "cin"],
  llp: ["pan", "gstn", "tan", "cin", "llp_code"],
  partnership: ["pan", "gstn", "tan"],
  proprietorship: ["pan", "tan"], // cin optional; gstn optional via toggle
};

/** Maps a free-text/legacy company type to a normalised EntityType. */
export function normaliseEntityType(companyType: string | undefined | null): EntityType {
  const t = String(companyType ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (t.includes("public")) return "public_limited";
  if (t.includes("private")) return "private_limited";
  if (t.includes("llp")) return "llp";
  if (t.includes("partnership")) return "partnership";
  if (t.includes("propriet")) return "proprietorship";
  return "private_limited";
}

/** Field name in our schema for each abstract mandatory field key. */
const fieldColumnMap: Record<string, string> = {
  pan: "pan",
  gstn: "masterGstin",
  tan: "tan",
  cin: "cin",
  llp_code: "llpCode",
};

export interface ValidationResult {
  valid: boolean;
  missing: string[];
}

/**
 * Validates that all mandatory fields for the company's entity type are present.
 * `gstAvailable=false` waives the GST requirement for proprietorships.
 */
export function validateCompany(
  company: Record<string, unknown>,
  opts: { gstAvailable?: boolean } = {},
): ValidationResult {
  const entityType = normaliseEntityType(company.companyType as string);
  const required = mandatoryFields[entityType];
  const missing: string[] = [];

  for (const key of required) {
    if (key === "gstn" && entityType === "proprietorship" && opts.gstAvailable === false) {
      continue;
    }
    const col = fieldColumnMap[key] ?? key;
    const val = company[col];
    if (val === undefined || val === null || String(val).trim() === "") {
      missing.push(key);
    }
  }

  return { valid: missing.length === 0, missing };
}
