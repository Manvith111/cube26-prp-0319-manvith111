// Recovery Manager (stretch).
//
// Reads a fee / reimbursement report and, for each charge, finds the matching
// Prep evidence record (by unit, SKU or shipment, captured BEFORE the charge)
// and classifies it. The goal is defensible claims, not maximum claims.

import type { EvidenceRecord } from "./types";

export interface FeeCharge {
  id: string;
  type: string;
  shipmentId?: string;
  sku?: string;
  unitId?: string;
  amount: number;
  currency: string;
  date: string; // ISO-8601
  reason: string;
  alreadyReimbursed?: boolean;
  relatedCheck?: string;
}

export type ChargeDisposition =
  | "CONTRADICTED"
  | "SUPPORTED"
  | "SILENT"
  | "DUPLICATE"
  | "ALREADY_REIMBURSED";

export interface ChargeResult {
  charge: FeeCharge;
  disposition: ChargeDisposition;
  explanation: string;
  matchedRecordId?: string;
  claimAmount: number;
}

export interface RecoveryOutput {
  results: ChargeResult[];
  totalClaim: number;
  duplicateFlagged: number;
  currency: string;
}

// Map a charge to the Prep check(s) it concerns.
function relevantChecksFor(charge: FeeCharge): string[] {
  const t = `${charge.relatedCheck ?? ""} ${charge.type} ${charge.reason}`.toLowerCase();
  if (t.includes("fnsku") || t.includes("label") || t.includes("mislabel"))
    return ["fnsku_present", "fnsku_placement", "fnsku_text_match"];
  if (
    t.includes("polybag") ||
    t.includes("poly bag") ||
    t.includes("packaging") ||
    t.includes("suffocation") ||
    t.includes("seal")
  )
    return [
      "polybag_present",
      "polybag_sealed",
      "suffocation_warning_present",
      "suffocation_warning_legible",
    ];
  if (t.includes("barcode")) return ["original_barcode_covered"];
  if (t.includes("expir")) return ["expiry_visible"];
  if (t.includes("fragile") || t.includes("handling") || t.includes("damage"))
    return ["handling_marks_present"];
  return [];
}

export function classifyCharges(charges: FeeCharge[], records: EvidenceRecord[]): RecoveryOutput {
  const seen = new Map<string, FeeCharge>();
  const results: ChargeResult[] = [];

  for (const charge of charges) {
    const dupKey = `${charge.type}|${charge.sku ?? ""}|${charge.shipmentId ?? ""}|${charge.amount}`;
    if (seen.has(dupKey)) {
      results.push({
        charge,
        disposition: "DUPLICATE",
        explanation: `Duplicate of charge ${seen.get(dupKey)!.id} — same fee type, SKU, shipment and amount.`,
        claimAmount: charge.amount,
      });
      continue;
    }
    seen.set(dupKey, charge);

    if (charge.alreadyReimbursed) {
      results.push({
        charge,
        disposition: "ALREADY_REIMBURSED",
        explanation: "Marketplace records already show this charge as reimbursed — no further claim.",
        claimAmount: 0,
      });
      continue;
    }

    const chargeTime = Date.parse(charge.date);
    const matches = records
      .filter(
        (r) =>
          (charge.unitId && r.unitId === charge.unitId) ||
          (charge.sku && r.product.sku === charge.sku) ||
          (charge.shipmentId && r.shipmentId === charge.shipmentId),
      )
      .filter((r) => isNaN(chargeTime) || Date.parse(r.createdAt) <= chargeTime)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    if (matches.length === 0) {
      results.push({
        charge,
        disposition: "SILENT",
        explanation:
          "No prep evidence record matches this charge (by unit, SKU or shipment) from before the charge date. Nothing to dispute with.",
        claimAmount: 0,
      });
      continue;
    }

    const rec = matches[0];
    const checksOfInterest = relevantChecksFor(charge);
    const relevant = rec.checks.filter((c) => checksOfInterest.includes(c.checkId));

    if (relevant.length === 0) {
      results.push({
        charge,
        disposition: "SILENT",
        explanation: `Record ${rec.id} matches but contains no check covering this charge type — cannot contradict.`,
        matchedRecordId: rec.id,
        claimAmount: 0,
      });
      continue;
    }

    const anyFail = relevant.some((c) => c.verdict === "FAIL");
    const anyUncertain = relevant.some((c) => c.verdict === "UNCERTAIN");
    const passed = relevant.find((c) => c.verdict === "PASS");

    if (anyFail) {
      results.push({
        charge,
        disposition: "SUPPORTED",
        explanation: `Prep record ${rec.id} shows the relevant check FAILED — our own evidence supports the charge. No claim.`,
        matchedRecordId: rec.id,
        claimAmount: 0,
      });
      continue;
    }
    if (passed && !anyUncertain) {
      results.push({
        charge,
        disposition: "CONTRADICTED",
        explanation: `Prep record ${rec.id}, captured ${rec.createdAt} (before the charge), shows "${passed.name}" PASSED with cited evidence (${passed.ruleClause}). This contradicts the charge — prepare a claim.`,
        matchedRecordId: rec.id,
        claimAmount: charge.amount,
      });
      continue;
    }
    results.push({
      charge,
      disposition: "SILENT",
      explanation: `Prep record ${rec.id} matches but the relevant check is UNCERTAIN — not defensible. No claim.`,
      matchedRecordId: rec.id,
      claimAmount: 0,
    });
  }

  const totalClaim = results
    .filter((r) => r.disposition === "CONTRADICTED")
    .reduce((s, r) => s + r.claimAmount, 0);
  const duplicateFlagged = results.filter((r) => r.disposition === "DUPLICATE").length;
  const currency = charges[0]?.currency ?? "USD";

  return { results, totalClaim, duplicateFlagged, currency };
}

// A sample fee report. SKUs line up with the sample products so that, after you
// run a PASS inspection for e.g. PC-IP15-BLK, the matching fee is CONTRADICTED.
export const SAMPLE_FEE_REPORT: FeeCharge[] = [
  {
    id: "FEE-10021",
    type: "Non-compliance: packaging defect",
    shipmentId: "FBA-SHIP-001",
    sku: "PC-IP15-BLK",
    amount: 0.6,
    currency: "USD",
    date: "2026-09-20T00:00:00Z",
    reason: "Unit received with poly bag not sealed / packaging defect.",
    relatedCheck: "polybag",
  },
  {
    id: "FEE-10022",
    type: "FNSKU labeling fee",
    shipmentId: "FBA-SHIP-001",
    sku: "VIT-D3-120",
    amount: 0.55,
    currency: "USD",
    date: "2026-09-21T00:00:00Z",
    reason: "FNSKU label missing or unscannable at fulfilment centre.",
    relatedCheck: "fnsku",
  },
  {
    id: "FEE-10023",
    type: "Non-compliance: packaging defect",
    shipmentId: "FBA-SHIP-001",
    sku: "PC-IP15-BLK",
    amount: 0.6,
    currency: "USD",
    date: "2026-09-20T00:00:00Z",
    reason: "Unit received with poly bag not sealed / packaging defect.",
    relatedCheck: "polybag",
  },
  {
    id: "FEE-10024",
    type: "Prep fee: polybagging",
    shipmentId: "FBA-SHIP-002",
    sku: "TEE-CTN-M",
    amount: 0.45,
    currency: "USD",
    date: "2026-09-22T00:00:00Z",
    reason: "Polybagging performed by fulfilment centre.",
    alreadyReimbursed: true,
    relatedCheck: "polybag",
  },
  {
    id: "FEE-10025",
    type: "Non-compliance: expiry not visible",
    shipmentId: "FBA-SHIP-003",
    sku: "SKU-NOT-IN-SYSTEM",
    amount: 0.75,
    currency: "USD",
    date: "2026-09-23T00:00:00Z",
    reason: "Expiration date not visible on unit.",
    relatedCheck: "expiry",
  },
];
