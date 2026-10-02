// A rule pack is the citable rulebook an inspection is judged against.
//
// Everything verifiable already lives as data (clauses + checks); a pack simply
// bundles one named, versioned rulebook so the engine can be pointed at FBA,
// Walmart WFS, house rules, etc. without any logic change. "Rules are data, not
// code" holds by construction: the engine only ever reads from a pack.

import type { CheckDef, RuleClause } from "../prepRequirements";

export interface RulePack {
  id: string; // e.g. "fba"
  version: string; // e.g. "1"
  name: string; // human label
  source: string; // provenance of the rulebook text
  clauses: Record<string, RuleClause>;
  checks: CheckDef[];
}

export interface RulePackRef {
  id: string;
  version: string;
}
