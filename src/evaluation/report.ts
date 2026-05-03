import { evaluateSrePolicy } from "../domain/sre.js";
import { sha256Hex } from "../util/hash.js";
import { ANCHOR_WEIGHTS, GROUNDING_RULESET_FINGERPRINT, GROUNDING_SCORE_CAPS, RECOMMENDATION_GROUNDING_FLOORS } from "./grounding.js";
import type {
  EvaluationRecommendation,
  EvaluationReportV2,
  EvaluationRequestV2,
  EvaluationReviewReason,
  EvaluationStatus,
  EvaluationSubscores,
  AlternativeAction,
  BlockedEvaluationUse,
  ContextGroundingAssessment,
  PolicyFinding,
  ProviderMetadata,
  ReadinessMetadata,
  RubricMetadata,
  SupportAssessment,
  ToulminArgument,
} from "./types.js";

export const EVALUATOR_VERSION = "v2-alpha-2026-05-03";

export const PRODUCT_SEMANTICS =
  "Uncalibrated internal-alpha rationale-action specificity signal with a deterministic context-grounding proxy. It estimates whether the stated rationale specifically supports the proposed action over typed near-neighbor alternatives and whether load-bearing rationale anchors are present, absent, or contradicted in the supplied context; it does not validate objective truth, hidden reasoning, chain-of-thought faithfulness, production readiness, or machine-actionable consumption.";

export const DETERMINISTIC_PROVIDER_METADATA: ProviderMetadata = {
  provider: "deterministic-local",
  model: "heuristic-v0",
  roles: {
    alternativeGenerator: "deterministic_near_neighbor",
    supportScorer: "deterministic_linguistic_policy_overlay",
  },
  deterministic: true,
};

export function isTerminalEvaluationStatus(status: EvaluationStatus): boolean {
  return status === "complete" || status === "aborted" || status === "timeout" || status === "error";
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

export const DEFAULT_FALLBACK_GROUNDING_SCORE = 0.35;

function defaultGrounding(_subscores: EvaluationSubscores): ContextGroundingAssessment {
  return {
    score: DEFAULT_FALLBACK_GROUNDING_SCORE,
    anchors: [],
    summary: { present: 0, absent: 0, contradicted: 0, loadBearing: 0 },
    notes: [
      "No explicit context-grounding assessment was supplied; fallback grounding is below the low-grounding threshold and cannot justify proceed or proceed-with-caveats recommendations.",
      "Deterministic context-grounding proxy over supplied context only; not objective truth validation.",
    ],
  };
}

export const OVERALL_WEIGHTS = {
  rationaleSpecificity: 0.23,
  actionCoupling: 0.22,
  alternativeResistance: 0.2,
  policyAlignment: 0.15,
  contextGrounding: 0.2,
} satisfies Record<keyof EvaluationSubscores, number>;

export const EVALUATOR_FINGERPRINT_INPUTS = {
  evaluatorVersion: EVALUATOR_VERSION,
  rubricVersion: "sre-specificity-v0",
  overallWeights: OVERALL_WEIGHTS,
  groundingRulesetFingerprint: GROUNDING_RULESET_FINGERPRINT,
  recommendationGroundingFloors: RECOMMENDATION_GROUNDING_FLOORS,
  groundingAnchorWeights: ANCHOR_WEIGHTS,
  groundingScoreCaps: GROUNDING_SCORE_CAPS,
  defaultFallbackGroundingScore: DEFAULT_FALLBACK_GROUNDING_SCORE,
} as const;

export const EVALUATOR_FINGERPRINT = sha256Hex(JSON.stringify(EVALUATOR_FINGERPRINT_INPUTS)).slice(0, 16);

const RUBRIC: RubricMetadata = {
  evaluatorVersion: EVALUATOR_VERSION,
  rubricVersion: EVALUATOR_FINGERPRINT_INPUTS.rubricVersion,
  calibration: "uncalibrated_internal_alpha",
  signalName: "rationale-action specificity",
  evaluatorFingerprint: EVALUATOR_FINGERPRINT,
};

function baseRecommendation(overallSignal: number | null, policyFindings: PolicyFinding[]): EvaluationRecommendation {
  if (overallSignal === null) return "abort_signal_only";
  if (policyFindings.some((finding) => finding.severity === "blocker")) return "escalate";
  if (overallSignal >= 0.75) return "proceed";
  if (overallSignal >= 0.55) return "proceed_with_caveats";
  if (overallSignal >= 0.35) return "reconsider";
  return "escalate";
}

function capRecommendation(recommendation: EvaluationRecommendation, cap: EvaluationRecommendation): EvaluationRecommendation {
  const order: EvaluationRecommendation[] = ["proceed", "proceed_with_caveats", "reconsider", "escalate"];
  const recommendationIndex = order.indexOf(recommendation);
  const capIndex = order.indexOf(cap);
  if (recommendationIndex < 0 || capIndex < 0) return recommendation;
  return recommendationIndex < capIndex ? cap : recommendation;
}

export function recommend(
  overallSignal: number | null,
  policyFindings: PolicyFinding[],
  grounding?: ContextGroundingAssessment | null
): EvaluationRecommendation {
  const base = baseRecommendation(overallSignal, policyFindings);
  if (base === "abort_signal_only" || base === "escalate" || policyFindings.some((finding) => finding.severity === "blocker")) return base;
  if (!grounding) return base;
  if (grounding.summary.contradicted > 0) return capRecommendation(base, RECOMMENDATION_GROUNDING_FLOORS.contradictionCap);
  if (grounding.score < RECOMMENDATION_GROUNDING_FLOORS.lowGroundingThreshold) {
    return capRecommendation(base, RECOMMENDATION_GROUNDING_FLOORS.lowGroundingCap);
  }
  if (grounding.score < RECOMMENDATION_GROUNDING_FLOORS.mediumGroundingThreshold) {
    return capRecommendation(base, RECOMMENDATION_GROUNDING_FLOORS.mediumGroundingCap);
  }
  return base;
}

function weaknesses(subscores: EvaluationSubscores, support: SupportAssessment, findings: PolicyFinding[], grounding?: ContextGroundingAssessment): string[] {
  const items: string[] = [];
  if (subscores.rationaleSpecificity < 0.55) items.push("Rationale lacks concrete thresholds, causal links, or evidence markers.");
  if (subscores.actionCoupling < 0.55) items.push("Rationale does not strongly couple to the proposed action type.");
  if (subscores.contextGrounding < 0.6) items.push("Context grounding is weak: load-bearing rationale anchors are absent or contradicted in the supplied context.");
  if (grounding && grounding.summary.contradicted > 0) items.push("Context grounding found contradicted load-bearing rationale anchors.");
  if (support.specificityMargin < 0.2) items.push("Strongest near-neighbor alternative remains similarly supported.");
  for (const finding of findings.filter((item) => item.severity !== "info")) items.push(finding.message);
  return items.slice(0, 5);
}

function confidence(subscores: EvaluationSubscores, support: SupportAssessment, grounding: ContextGroundingAssessment): number {
  const coverage = grounding.summary.loadBearing > 0 ? grounding.summary.present / grounding.summary.loadBearing : 0.45;
  const contradictionPenalty = grounding.summary.contradicted > 0 ? 0.15 : 0;
  return clamp01(
    0.2 +
      Math.abs(support.specificityMargin) * 0.3 +
      subscores.policyAlignment * 0.15 +
      subscores.contextGrounding * 0.25 +
      coverage * 0.1 -
      contradictionPenalty
  );
}

function supportWithMarginReliability(support: SupportAssessment): SupportAssessment {
  return {
    ...support,
    marginReliability: {
      state: "unreliable_internal_alpha",
      reason: support.specificityMargin <= 0 ? "non_positive_margin" : "benchmark_antiseparation",
      message:
        "specificityMargin is an uncalibrated internal-alpha diagnostic and is currently not reliable as production evidence.",
    },
  };
}

function reviewReasons(input: {
  status: EvaluationStatus;
  overallSignal: number | null;
  grounding: ContextGroundingAssessment | null;
  policyFindings: PolicyFinding[];
}): EvaluationReviewReason[] {
  const reasons = new Set<EvaluationReviewReason>(["uncalibrated_internal_alpha", "specificity_margin_unreliable"]);
  if (input.status !== "complete" || input.overallSignal === null) reasons.add("incomplete_evaluation");
  if (input.overallSignal !== null && input.overallSignal < 0.55) reasons.add("low_overall_signal");
  if (input.policyFindings.some((finding) => finding.severity === "blocker")) reasons.add("policy_blocker");
  if (input.grounding) {
    if (input.grounding.summary.loadBearing === 0) reasons.add("fallback_grounding");
    if (input.grounding.score < RECOMMENDATION_GROUNDING_FLOORS.mediumGroundingThreshold) reasons.add("weak_context_grounding");
    if (input.grounding.summary.contradicted > 0) reasons.add("contradicted_grounding");
  }
  return Array.from(reasons);
}

function readiness(input: {
  status: EvaluationStatus;
  overallSignal: number | null;
  grounding: ContextGroundingAssessment | null;
  policyFindings: PolicyFinding[];
  advisorySummary?: "internal_alpha_operator_review_required" | "error_no_numeric_signal";
}): ReadinessMetadata {
  const reasons = reviewReasons(input);
  const highPriorityReasons = reasons.filter(
    (reason) => reason !== "uncalibrated_internal_alpha" && reason !== "specificity_margin_unreliable"
  );
  return {
    operatingMode: "internal_alpha_advisory" as const,
    productionDecisionUse: "not_validated_for_allow_deny" as const,
    operatorReviewRequired: true as const,
    reviewNeeded: highPriorityReasons.length > 0,
    advisorySummary: input.advisorySummary ?? "internal_alpha_operator_review_required",
    reviewReasons: reasons,
    blockedUses: [
      "production_allow_deny",
      "machine_actionable_consumption",
      "hidden_chain_of_thought_faithfulness",
      "objective_truth_validation",
    ] satisfies BlockedEvaluationUse[],
    evaluatorVersion: EVALUATOR_VERSION,
    evaluatorFingerprint: EVALUATOR_FINGERPRINT,
  };
}

export function buildReport(input: {
  request: EvaluationRequestV2;
  toulmin: ToulminArgument;
  alternatives: AlternativeAction[];
  support: SupportAssessment;
  subscores: EvaluationSubscores;
  grounding?: ContextGroundingAssessment;
  policyFindings?: PolicyFinding[];
  auditRef?: string | null;
  providerMetadata?: ProviderMetadata;
}): EvaluationReportV2 {
  const policyFindings = input.policyFindings ?? (input.request.domain === "sre" ? evaluateSrePolicy(input.request).findings : []);
  const grounding = input.grounding ?? defaultGrounding(input.subscores);
  const subscores = input.grounding ? input.subscores : { ...input.subscores, contextGrounding: grounding.score };
  const support = supportWithMarginReliability(input.support);
  const overallSignal = clamp01(
    subscores.rationaleSpecificity * OVERALL_WEIGHTS.rationaleSpecificity +
      subscores.actionCoupling * OVERALL_WEIGHTS.actionCoupling +
      subscores.alternativeResistance * OVERALL_WEIGHTS.alternativeResistance +
      subscores.policyAlignment * OVERALL_WEIGHTS.policyAlignment +
      subscores.contextGrounding * OVERALL_WEIGHTS.contextGrounding
  );

  return {
    traceId: input.request.traceId,
    status: "complete",
    recommendation: recommend(overallSignal, policyFindings, grounding),
    calibration: "uncalibrated_internal_alpha",
    overallSignal,
    subscores,
    support,
    grounding,
    toulmin: input.toulmin,
    alternatives: input.alternatives,
    policyFindings,
    topWeaknesses: weaknesses(subscores, support, policyFindings, grounding),
    confidence: confidence(subscores, support, grounding),
    rubric: RUBRIC,
    providerMetadata: input.providerMetadata ?? DETERMINISTIC_PROVIDER_METADATA,
    auditRef: input.auditRef ?? null,
    errors: [],
    productSemantics: PRODUCT_SEMANTICS,
    readiness: readiness({ status: "complete", overallSignal, grounding, policyFindings }),
    createdAt: new Date().toISOString(),
  };
}

export function buildErrorReport(request: EvaluationRequestV2, error: string, status: EvaluationStatus = "error"): EvaluationReportV2 {
  return {
    traceId: request.traceId,
    status,
    recommendation: "abort_signal_only",
    calibration: "uncalibrated_internal_alpha",
    overallSignal: null,
    subscores: null,
    support: null,
    grounding: null,
    toulmin: null,
    alternatives: [],
    policyFindings: [],
    topWeaknesses: [],
    confidence: null,
    rubric: RUBRIC,
    providerMetadata: DETERMINISTIC_PROVIDER_METADATA,
    auditRef: null,
    errors: [error],
    productSemantics: PRODUCT_SEMANTICS,
    readiness: readiness({
      status,
      overallSignal: null,
      grounding: null,
      policyFindings: [],
      advisorySummary: "error_no_numeric_signal",
    }),
    createdAt: new Date().toISOString(),
  };
}
