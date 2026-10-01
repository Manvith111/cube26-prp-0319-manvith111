// Shared type definitions for OpsConsole.
// The same EvidenceRecord shape is the "one evidence chain" every Manager writes.

export type Verdict =
  | "PASS"
  | "FAIL"
  | "UNCERTAIN"
  | "NOT_VERIFIABLE"
  | "NOT_APPLICABLE";

export type OverallStatus = "PASS" | "FAIL" | "UNCERTAIN";
export type Confidence = "high" | "medium" | "low";

export type CheckId =
  | "polybag_present"
  | "polybag_sealed"
  | "suffocation_warning_present"
  | "suffocation_warning_legible"
  | "fnsku_present"
  | "fnsku_placement"
  | "fnsku_text_match"
  | "original_barcode_covered"
  | "expiry_visible"
  | "handling_marks_present"
  | "bag_thickness_material";

// Product configuration — which requirements apply to this unit.
export interface ProductInput {
  sku: string;
  expectedFnsku: string;
  name: string;
  category: string;
  requiresPolybag: boolean;
  hasExpiry: boolean;
  isFragile: boolean;
  requiredHandlingMarks: string[];
  coverOriginalBarcode: boolean;
}

export interface PhotoMeta {
  index: number; // 1-based
  filename: string;
  mediaType: string;
  sha256: string;
  storedPath: string; // relative path under /data
}

// ---- AI observation step (the AI NEVER emits verdicts) ----
export type ObservationStatus = "met" | "not_met" | "cant_tell";

export interface Observation {
  checkId: CheckId;
  status: ObservationStatus;
  confidence: Confidence;
  photoIndex: number | null;
  location: string;
  evidence: string;
}

export interface PhotoQuality {
  photoIndex: number;
  usable: boolean;
  issues: string[]; // blurry | glare | cropped | too_dark | out_of_frame | low_resolution
}

export interface LabelRead {
  value: string | null;
  photoIndex: number | null;
  legible: boolean;
  confidence: Confidence;
}

export interface VisionResult {
  photoQuality: PhotoQuality[];
  labelRead: LabelRead;
  observations: Observation[];
  raw: string; // raw model text
  model: string;
  available: boolean; // false if the API could not be reached / parsed
  note?: string; // explanation when unavailable
}

// ---- Deterministic rules output ----
export interface CheckResult {
  checkId: CheckId;
  name: string;
  verdict: Verdict;
  applicable: boolean;
  verifiable: boolean;
  expected: string;
  observed: string;
  photoIndex: number | null;
  location: string | null;
  confidence: Confidence | null;
  ruleQuote: string;
  ruleClause: string;
}

export interface OverallResult {
  status: OverallStatus;
  reason: string;
  retake: string[]; // what to re-photograph when UNCERTAIN
}

export interface EvidenceRecord {
  id: string;
  manager: "prep";
  createdAt: string; // ISO-8601
  product: ProductInput;
  shipmentId?: string;
  unitId?: string;
  notes?: string;
  photos: PhotoMeta[];
  checks: CheckResult[];
  overall: OverallResult;
  vision: {
    model: string;
    available: boolean;
    note?: string;
    raw: string;
  };
}
