// Deterministic decision engine.
//
// This is the ONLY place verdicts are produced. It consumes the AI's
// observations (which are only "met / not_met / cant_tell" + confidence +
// cited evidence) and turns them into PASS / FAIL / UNCERTAIN / NOT_VERIFIABLE
// / NOT_APPLICABLE using fixed logic. Same observations in → same verdicts out.

import { CHECK_CATALOG, RULE_CLAUSES } from "./prepRequirements";
import type {
  CheckResult,
  Confidence,
  Observation,
  OverallResult,
  ProductInput,
  Verdict,
  VisionResult,
} from "./types";

const CONFIDENCE_RANK: Record<Confidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function normalizeFnsku(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

interface CheckBase {
  checkId: CheckResult["checkId"];
  name: string;
  applicable: boolean;
  verifiable: boolean;
  expected: string;
  ruleQuote: string;
  ruleClause: string;
}

function uncertain(
  base: CheckBase,
  photoIndex: number | null,
  location: string | null,
  confidence: Confidence | null,
  observed: string,
): CheckResult {
  return { ...base, verdict: "UNCERTAIN", observed, photoIndex, location, confidence };
}

export function evaluate(
  product: ProductInput,
  vision: VisionResult,
): { checks: CheckResult[]; overall: OverallResult } {
  const usableByIndex = new Map<number, boolean>();
  for (const q of vision.photoQuality) usableByIndex.set(q.photoIndex, q.usable);

  const obsByCheck = new Map<string, Observation>();
  for (const o of vision.observations) obsByCheck.set(o.checkId, o);

  const checks: CheckResult[] = [];

  for (const def of CHECK_CATALOG) {
    const clause = RULE_CLAUSES[def.clauseKey];
    const applicable = def.appliesTo(product);
    const base: CheckBase = {
      checkId: def.id,
      name: def.name,
      applicable,
      verifiable: def.verifiable,
      expected: def.expected,
      ruleQuote: clause.quote,
      ruleClause: clause.clause,
    };

    // 1) Not applicable to this product.
    if (!applicable) {
      checks.push({
        ...base,
        verdict: "NOT_APPLICABLE",
        observed: "This requirement does not apply to this product.",
        photoIndex: null,
        location: null,
        confidence: null,
      });
      continue;
    }

    // 2) Honest about limits — physical properties are never guessed.
    if (!def.verifiable) {
      checks.push({
        ...base,
        verdict: "NOT_VERIFIABLE",
        observed:
          "Physical property that cannot be judged from a photograph — verify by hand or spec sheet.",
        photoIndex: null,
        location: null,
        confidence: null,
      });
      continue;
    }

    // 3) FNSKU text match — derived from the label the AI transcribed.
    if (def.id === "fnsku_text_match") {
      if (!vision.available) {
        checks.push(uncertain(base, null, null, null, "AI observation unavailable — re-run the inspection."));
        continue;
      }
      const lr = vision.labelRead;
      if (!lr || !lr.legible || !lr.value) {
        checks.push(
          uncertain(
            base,
            lr?.photoIndex ?? null,
            "FNSKU label",
            lr?.confidence ?? null,
            `The label text could not be read clearly (expected ${product.expectedFnsku}). Re-photograph the label in sharp focus.`,
          ),
        );
        continue;
      }
      if (CONFIDENCE_RANK[lr.confidence] < 1) {
        checks.push(
          uncertain(
            base,
            lr.photoIndex,
            "FNSKU label",
            lr.confidence,
            `Read "${lr.value}" but with low confidence; expected ${product.expectedFnsku}. Re-photograph the label.`,
          ),
        );
        continue;
      }
      const read = normalizeFnsku(lr.value);
      const expected = normalizeFnsku(product.expectedFnsku);
      if (read === expected) {
        checks.push({
          ...base,
          verdict: "PASS",
          observed: `Label reads "${lr.value}", matching the expected FNSKU ${product.expectedFnsku}.`,
          photoIndex: lr.photoIndex,
          location: "FNSKU label",
          confidence: lr.confidence,
        });
      } else {
        checks.push({
          ...base,
          verdict: "FAIL",
          observed: `Label reads "${lr.value}" but the expected FNSKU is ${product.expectedFnsku} — mismatch.`,
          photoIndex: lr.photoIndex,
          location: "FNSKU label",
          confidence: lr.confidence,
        });
      }
      continue;
    }

    // 4) Standard observation-driven checks.
    if (!vision.available) {
      checks.push(uncertain(base, null, null, null, "AI observation unavailable — re-run the inspection."));
      continue;
    }
    const obs = obsByCheck.get(def.id);
    if (!obs) {
      checks.push(uncertain(base, null, null, null, "No observation was returned for this check."));
      continue;
    }

    // Unusable photo → UNCERTAIN (retake).
    const usable = obs.photoIndex != null ? usableByIndex.get(obs.photoIndex) : undefined;
    if (obs.photoIndex != null && usable === false) {
      checks.push(
        uncertain(
          base,
          obs.photoIndex,
          obs.location,
          obs.confidence,
          `Photo ${obs.photoIndex} is not usable for this check — ${obs.evidence || "retake needed"}.`,
        ),
      );
      continue;
    }
    // Can't tell → UNCERTAIN.
    if (obs.status === "cant_tell") {
      checks.push(
        uncertain(
          base,
          obs.photoIndex,
          obs.location,
          obs.confidence,
          obs.evidence || "Not determinable from the photos provided.",
        ),
      );
      continue;
    }
    // No visible evidence cited → UNCERTAIN (no invented evidence).
    if (!obs.evidence || obs.evidence.trim() === "") {
      checks.push(
        uncertain(base, obs.photoIndex, obs.location, obs.confidence, "No visible evidence was cited — treated as uncertain."),
      );
      continue;
    }
    // Low confidence → UNCERTAIN.
    if (CONFIDENCE_RANK[obs.confidence] < 1) {
      checks.push(uncertain(base, obs.photoIndex, obs.location, obs.confidence, `Low-confidence observation: ${obs.evidence}`));
      continue;
    }

    const verdict: Verdict = obs.status === "met" ? "PASS" : "FAIL";
    checks.push({
      ...base,
      verdict,
      observed: obs.evidence,
      photoIndex: obs.photoIndex,
      location: obs.location || null,
      confidence: obs.confidence,
    });
  }

  return { checks, overall: computeOverall(checks) };
}

function locSuffix(c: CheckResult): string {
  if (c.photoIndex == null) return "";
  return ` (photo ${c.photoIndex}${c.location ? `, ${c.location}` : ""})`;
}

function computeOverall(checks: CheckResult[]): OverallResult {
  const required = checks.filter((c) => c.applicable && c.verifiable);
  const fails = required.filter((c) => c.verdict === "FAIL");
  const uncertains = required.filter((c) => c.verdict === "UNCERTAIN");

  if (fails.length > 0) {
    const f = fails[0];
    return {
      status: "FAIL",
      reason: `FAIL — ${f.name}: ${f.observed}${locSuffix(f)}`,
      retake: [],
    };
  }
  if (uncertains.length > 0) {
    return {
      status: "UNCERTAIN",
      reason: `UNCERTAIN (needs review) — ${uncertains.length} required check${
        uncertains.length === 1 ? "" : "s"
      } could not be confirmed.`,
      retake: uncertains.map((c) => `${c.name}: ${c.observed}${locSuffix(c)}`),
    };
  }
  return {
    status: "PASS",
    reason: "PASS — every required check passed with cited visual evidence.",
    retake: [],
  };
}
