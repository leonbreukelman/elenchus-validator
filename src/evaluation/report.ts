import { evaluateSrePolicy } from "../domain/sre.js";
import type {
  EvaluationRecommendation,
  EvaluationReportV2,
  EvaluationRequestV2,
  EvaluationStatus,
  EvaluationSubscores,
  AlternativeAction,
  PolicyFinding,
  ProviderMetadata,
  RubricMetadata,
  SupportAssessment,
  ToulminArgument,
} from "./types.js";

export const PRODUCT_SEMANTICS =
  "Uncalibrated internal-alpha rationale-action specificity signal. It estimates whether the stated rationale specifically supports the proposed action over typed near-neighbor alternatives; it does not validate objective truth, hidden reasoning, or chain-of-thought faithfulness.";

const RUBRIC: RubricMetadata = {
  evaluatorVersion: "v2-alpha-2026-05-01",
  rubricVersion: "sre-specificity-v0",
  calibration: "uncalibrated_internal_alpha",
  signalName: "rationale-action specificity",
};

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

export function recommend(overallSignal: number | null, policyFindings: PolicyFinding[]): EvaluationRecommendation {
  if (overallSignal === null) return "abort_signal_only";
  if (policyFindings.some((finding) => finding.severity === "blocker")) return "escalate";
  if (overallSignal >= 0.75) return "proceed";
  if (overallSignal >= 0.55) return "proceed_with_caveats";
  if (overallSignal >= 0.35) return "reconsider";
  return "escalate";
}

function weaknesses(subscores: EvaluationSubscores, support: SupportAssessment, findings: PolicyFinding[]): string[] {
  const items: string[] = [];
  if (subscores.rationaleSpecificity < 0.55) items.push("Rationale lacks concrete thresholds, causal links, or evidence markers.");
  if (subscores.actionCoupling < 0.55) items.push("Rationale does not strongly couple to the proposed action type.");
  if (support.specificityMargin < 0.2) items.push("Strongest near-neighbor alternative remains similarly supported.");
  for (const finding of findings.filter((item) => item.severity !== "info")) items.push(finding.message);
  return items.slice(0, 5);
}

export function buildReport(input: {
  request: EvaluationRequestV2;
  toulmin: ToulminArgument;
  alternatives: AlternativeAction[];
  support: SupportAssessment;
  subscores: EvaluationSubscores;
  policyFindings?: PolicyFinding[];
  auditRef?: string | null;
  providerMetadata?: ProviderMetadata;
}): EvaluationReportV2 {
  const policyFindings = input.policyFindings ?? (input.request.domain === "sre" ? evaluateSrePolicy(input.request).findings : []);
  const overallSignal = clamp01(
    input.subscores.rationaleSpecificity * 0.3 +
      input.subscores.actionCoupling * 0.25 +
      input.subscores.alternativeResistance * 0.25 +
      input.subscores.policyAlignment * 0.2
  );

  return {
    traceId: input.request.traceId,
    status: "complete",
    recommendation: recommend(overallSignal, policyFindings),
    calibration: "uncalibrated_internal_alpha",
    overallSignal,
    subscores: input.subscores,
    support: input.support,
    toulmin: input.toulmin,
    alternatives: input.alternatives,
    policyFindings,
    topWeaknesses: weaknesses(input.subscores, input.support, policyFindings),
    confidence: clamp01(0.35 + Math.abs(input.support.specificityMargin) * 0.45 + input.subscores.policyAlignment * 0.2),
    rubric: RUBRIC,
    providerMetadata: input.providerMetadata ?? DETERMINISTIC_PROVIDER_METADATA,
    auditRef: input.auditRef ?? null,
    errors: [],
    productSemantics: PRODUCT_SEMANTICS,
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
    support: {
      originalSupport: 0,
      strongestAlternativeSupport: 0,
      specificityMargin: 0,
      strongestAlternativeId: null,
      notes: ["No numeric signal was produced."],
    },
    toulmin: null,
    alternatives: [],
    policyFindings: [],
    topWeaknesses: [],
    confidence: 0,
    rubric: RUBRIC,
    providerMetadata: DETERMINISTIC_PROVIDER_METADATA,
    auditRef: null,
    errors: [error],
    productSemantics: PRODUCT_SEMANTICS,
    createdAt: new Date().toISOString(),
  };
}
