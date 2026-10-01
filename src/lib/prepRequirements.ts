import type { CheckId, ProductInput } from "./types";

// ---------------------------------------------------------------------------
// The prep requirements document, encoded as traceable clauses.
//
// These quotes model the standard marketplace (FBA-style) poly-bagging and
// labeling rules so that EVERY check can cite an exact clause. Replace the
// `quote`/`clause` strings with the official challenge document verbatim and
// nothing else in the app has to change — the rules engine only ever reads
// from here, so "no invented rules" holds by construction.
// ---------------------------------------------------------------------------

export const PREP_REQUIREMENTS_SOURCE =
  "Marketplace Prep & Labeling Requirements (provided document)";

export interface RuleClause {
  clause: string;
  title: string;
  quote: string;
}

export const RULE_CLAUSES: Record<string, RuleClause> = {
  polybag: {
    clause: "§2.1 Poly-bagging",
    title: "Poly-bag required",
    quote:
      "Units that are not already in sealed retail-ready packaging must be placed inside a transparent poly bag so that the FNSKU label can be applied to the bag.",
  },
  seal: {
    clause: "§2.2 Sealing",
    title: "Poly-bag sealed",
    quote:
      "Poly bags must be completely sealed. The product must not be able to fall out of the bag.",
  },
  suffocation: {
    clause: "§2.3 Suffocation warning",
    title: "Suffocation warning",
    quote:
      "Any poly bag with an opening of 5 inches (12.7 cm) or larger, measured when laid flat, must carry a suffocation warning printed on the bag or on an attached label.",
  },
  fnsku: {
    clause: "§3.1 FNSKU label",
    title: "FNSKU label applied",
    quote:
      "Each unit must have a single scannable FNSKU barcode label applied to the exterior of the unit or its poly bag.",
  },
  placement: {
    clause: "§3.2 Label placement",
    title: "FNSKU on a flat, scannable surface",
    quote:
      "The FNSKU label must be placed on a flat surface. Do not place the barcode across a curved surface, seam, corner or edge where it cannot be scanned reliably.",
  },
  match: {
    clause: "§3.3 Correct FNSKU",
    title: "FNSKU matches the product",
    quote:
      "The FNSKU printed on the label must correspond to the product it is applied to. A unit bearing the wrong FNSKU is mislabeled.",
  },
  cover: {
    clause: "§3.4 Original barcodes",
    title: "Original manufacturer barcode covered",
    quote:
      "Any pre-existing scannable barcode on the exterior (for example the manufacturer UPC or EAN) must be covered or rendered unscannable so that only the FNSKU is scanned.",
  },
  expiry: {
    clause: "§4.1 Expiration dates",
    title: "Expiry date visible",
    quote:
      "For products that carry an expiration date, the date must be printed on each individual unit and must remain visible after prep. A poly bag must not obscure the expiration date.",
  },
  handling: {
    clause: "§4.2 Handling marks",
    title: "Required handling marks present",
    quote:
      "Fragile units, and units requiring special handling, must display the required handling marking (for example 'Fragile') on the exterior so it is visible during handling.",
  },
  thickness: {
    clause: "§2.4 Bag material",
    title: "Bag thickness / material",
    quote: "Poly bags must be made of durable material at least 1.5 mil thick.",
  },
};

export interface CheckDef {
  id: CheckId;
  name: string;
  clauseKey: keyof typeof RULE_CLAUSES;
  verifiable: boolean; // can a photo verify it?
  appliesTo: (p: ProductInput) => boolean;
  expected: string;
}

// Ordered catalog of every check the Prep Manager can run.
export const CHECK_CATALOG: CheckDef[] = [
  {
    id: "polybag_present",
    name: "Poly-bag present",
    clauseKey: "polybag",
    verifiable: true,
    appliesTo: (p) => p.requiresPolybag,
    expected: "The unit is enclosed in a transparent poly bag.",
  },
  {
    id: "polybag_sealed",
    name: "Poly-bag sealed",
    clauseKey: "seal",
    verifiable: true,
    appliesTo: (p) => p.requiresPolybag,
    expected: "The poly bag is fully sealed with no open side.",
  },
  {
    id: "suffocation_warning_present",
    name: "Suffocation warning present",
    clauseKey: "suffocation",
    verifiable: true,
    appliesTo: (p) => p.requiresPolybag,
    expected: "A suffocation warning is printed on the bag or an attached label.",
  },
  {
    id: "suffocation_warning_legible",
    name: "Suffocation warning legible",
    clauseKey: "suffocation",
    verifiable: true,
    appliesTo: (p) => p.requiresPolybag,
    expected: "The suffocation warning text is fully visible and readable.",
  },
  {
    id: "fnsku_present",
    name: "FNSKU label present",
    clauseKey: "fnsku",
    verifiable: true,
    appliesTo: () => true,
    expected: "A scannable FNSKU barcode label is applied to the unit.",
  },
  {
    id: "fnsku_placement",
    name: "FNSKU placement",
    clauseKey: "placement",
    verifiable: true,
    appliesTo: () => true,
    expected:
      "The FNSKU label lies flat — not across a curve, seam, corner or edge.",
  },
  {
    id: "fnsku_text_match",
    name: "FNSKU text matches product",
    clauseKey: "match",
    verifiable: true,
    appliesTo: () => true,
    expected: "The printed FNSKU equals the expected code for this product.",
  },
  {
    id: "original_barcode_covered",
    name: "Original barcode covered",
    clauseKey: "cover",
    verifiable: true,
    appliesTo: (p) => p.coverOriginalBarcode,
    expected: "The manufacturer barcode is covered or unscannable.",
  },
  {
    id: "expiry_visible",
    name: "Expiry date visible",
    clauseKey: "expiry",
    verifiable: true,
    appliesTo: (p) => p.hasExpiry,
    expected: "The expiration date is printed on the unit and still visible.",
  },
  {
    id: "handling_marks_present",
    name: "Handling marks present",
    clauseKey: "handling",
    verifiable: true,
    appliesTo: (p) => p.isFragile || p.requiredHandlingMarks.length > 0,
    expected: "The required handling marking is displayed on the exterior.",
  },
  {
    id: "bag_thickness_material",
    name: "Bag thickness / material",
    clauseKey: "thickness",
    verifiable: false, // cannot be judged from a photo
    appliesTo: (p) => p.requiresPolybag,
    expected: "Bag is a durable material at least 1.5 mil thick.",
  },
];

// A few real-world products to demo with (the "load sample product" option).
export const SAMPLE_PRODUCTS: ProductInput[] = [
  {
    sku: "PC-IP15-BLK",
    expectedFnsku: "X001ABC123",
    name: "Silicone Phone Case (iPhone 15, Black)",
    category: "Electronics Accessories",
    requiresPolybag: true,
    hasExpiry: false,
    isFragile: false,
    requiredHandlingMarks: [],
    coverOriginalBarcode: true,
  },
  {
    sku: "BTL-GLS-750",
    expectedFnsku: "X002DEF456",
    name: "Glass Water Bottle 750 ml",
    category: "Home & Kitchen",
    requiresPolybag: true,
    hasExpiry: false,
    isFragile: true,
    requiredHandlingMarks: ["Fragile"],
    coverOriginalBarcode: true,
  },
  {
    sku: "VIT-D3-120",
    expectedFnsku: "X003GHI789",
    name: "Vitamin D3 Softgels (120 ct)",
    category: "Health & Household",
    requiresPolybag: true,
    hasExpiry: true,
    isFragile: false,
    requiredHandlingMarks: [],
    coverOriginalBarcode: true,
  },
  {
    sku: "MUG-CER-350",
    expectedFnsku: "X004JKL012",
    name: "Ceramic Coffee Mug 350 ml",
    category: "Home & Kitchen",
    requiresPolybag: true,
    hasExpiry: false,
    isFragile: true,
    requiredHandlingMarks: ["Fragile"],
    coverOriginalBarcode: false,
  },
  {
    sku: "TEE-CTN-M",
    expectedFnsku: "X005MNO345",
    name: "Cotton T-Shirt (Medium)",
    category: "Apparel",
    requiresPolybag: true,
    hasExpiry: false,
    isFragile: false,
    requiredHandlingMarks: [],
    coverOriginalBarcode: false,
  },
];

export function emptyProduct(): ProductInput {
  return {
    sku: "",
    expectedFnsku: "",
    name: "",
    category: "",
    requiresPolybag: true,
    hasExpiry: false,
    isFragile: false,
    requiredHandlingMarks: [],
    coverOriginalBarcode: false,
  };
}
