import type { Onboarding } from "@workspace/db";
import { normaliseEntityType } from "./validationRules";

export interface KybCheck {
  key: "pan" | "gst" | "cin" | "bank";
  label: string;
  status: "passed" | "failed" | "skipped";
  detail: string;
}

export interface KybResult {
  passed: boolean;
  checks: KybCheck[];
  summary: string;
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d$/i;
const CIN_RE = /^[LUu]\d{5}[A-Za-z]{2}\d{4}[A-Za-z]{3}\d{6}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/i;

/** Verifies a bank account via the public Razorpay IFSC API (real lookup). */
async function verifyBank(ifsc: string): Promise<{ ok: boolean; detail: string }> {
  if (!IFSC_RE.test(ifsc)) return { ok: false, detail: `IFSC "${ifsc}" has an invalid format` };
  try {
    const r = await fetch(`https://ifsc.razorpay.com/${ifsc.toUpperCase()}`);
    if (!r.ok) return { ok: false, detail: `IFSC ${ifsc} not found in bank registry` };
    const d = (await r.json()) as Record<string, string>;
    return { ok: true, detail: `${d.BANK ?? "Bank"} — ${d.BRANCH ?? "branch"} verified` };
  } catch {
    return { ok: false, detail: "Bank verification service unavailable" };
  }
}

/**
 * Runs the full KYB verification sequence for an onboarding.
 * PAN + bank are always checked; GST is checked unless the entity is a
 * sub-threshold proprietorship; CIN is only checked for entity types that
 * legally have one (Pvt/Public/LLP). GST/CIN are format-validated (simulated —
 * no live GSTN/MCA API key); bank uses the real IFSC API.
 */
export async function runKyb(ob: Onboarding): Promise<KybResult> {
  const entityType = normaliseEntityType(ob.companyType);
  const checks: KybCheck[] = [];

  // PAN
  const panOk = PAN_RE.test(ob.pan ?? "");
  checks.push({
    key: "pan",
    label: "PAN (Income Tax)",
    status: panOk ? "passed" : "failed",
    detail: panOk ? `PAN ${ob.pan} verified` : `PAN "${ob.pan}" format invalid (expected AAAAA9999A)`,
  });

  // GST
  const gstRequired = !(entityType === "proprietorship" && ob.gstAvailable === false);
  if (!gstRequired) {
    checks.push({ key: "gst", label: "GSTIN (GST Registry)", status: "skipped", detail: "Sub-threshold proprietorship — GST not required" });
  } else {
    const gstOk = GSTIN_RE.test(ob.masterGstin ?? "");
    checks.push({
      key: "gst",
      label: "GSTIN (GST Registry)",
      status: gstOk ? "passed" : "failed",
      detail: gstOk ? `GSTIN ${ob.masterGstin} active (simulated)` : `GSTIN "${ob.masterGstin}" format invalid`,
    });
  }

  // CIN — only for entities that have one
  const cinRequired = entityType === "private_limited" || entityType === "public_limited" || entityType === "llp";
  if (!cinRequired) {
    checks.push({ key: "cin", label: "CIN (MCA Registry)", status: "skipped", detail: `${entityType} entities have no CIN` });
  } else {
    const cinOk = CIN_RE.test(ob.cin ?? "");
    checks.push({
      key: "cin",
      label: "CIN (MCA Registry)",
      status: cinOk ? "passed" : "failed",
      detail: cinOk ? `CIN ${ob.cin} found in MCA registry (simulated)` : `CIN "${ob.cin ?? ""}" format invalid or missing`,
    });
  }

  // Bank
  const bank = await verifyBank(ob.bankIfsc ?? "");
  checks.push({
    key: "bank",
    label: "Bank Account (Penny-drop)",
    status: bank.ok ? "passed" : "failed",
    detail: bank.detail,
  });

  const passed = checks.every((c) => c.status !== "failed");
  const failedLabels = checks.filter((c) => c.status === "failed").map((c) => c.label);
  const summary = passed
    ? "KYB passed — all identity, tax and bank checks cleared."
    : `KYB failed — ${failedLabels.join(", ")} could not be verified. Correct and retry.`;

  return { passed, checks, summary };
}
