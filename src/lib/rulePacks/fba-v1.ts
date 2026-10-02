// Amazon FBA prep & labeling rulebook, version 1.
//
// Wraps the clauses + checks already defined in prepRequirements.ts as a named,
// versioned pack. To add another marketplace, create a sibling file exporting
// its own RulePack and register it in ./index.ts — nothing in the engine changes.

import { CHECK_CATALOG, PREP_REQUIREMENTS_SOURCE, RULE_CLAUSES } from "../prepRequirements";
import type { RulePack } from "./types";

export const FBA_V1: RulePack = {
  id: "fba",
  version: "1",
  name: "Amazon FBA Prep & Labeling",
  source: PREP_REQUIREMENTS_SOURCE,
  clauses: RULE_CLAUSES,
  checks: CHECK_CATALOG,
};
