// Rule pack registry. The engine resolves a pack here and reads only from it.

import { FBA_V1 } from "./fba-v1";
import type { RulePack } from "./types";

export type { RulePack, RulePackRef } from "./types";

export const DEFAULT_RULE_PACK_ID = "fba";
export const DEFAULT_RULE_PACK_VERSION = "1";

function key(id: string, version: string): string {
  return `${id}@${version}`;
}

// Keyed by `${id}@${version}`.
const REGISTRY: Record<string, RulePack> = {
  [key(FBA_V1.id, FBA_V1.version)]: FBA_V1,
};

/**
 * Resolve a rule pack. With no id, returns the default pack. With a specific
 * id/version that is not registered, throws — an inspection must never silently
 * be judged against a different rulebook than the one requested.
 */
export function getRulePack(id?: string, version?: string): RulePack {
  if (!id) return REGISTRY[key(DEFAULT_RULE_PACK_ID, DEFAULT_RULE_PACK_VERSION)];
  const resolvedVersion = version || DEFAULT_RULE_PACK_VERSION;
  const pack = REGISTRY[key(id, resolvedVersion)];
  if (!pack) throw new Error(`Unknown rule pack: ${key(id, resolvedVersion)}`);
  return pack;
}

/** True when the given id/version is registered (used to validate catalog rows). */
export function rulePackExists(id: string, version: string): boolean {
  return Boolean(REGISTRY[key(id, version)]);
}

export function listRulePacks(): RulePack[] {
  return Object.values(REGISTRY);
}
