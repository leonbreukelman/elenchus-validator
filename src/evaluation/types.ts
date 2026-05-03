export type EvaluationStatus = "complete" | "aborted" | "timeout" | "error" | "skipped";

export type EvaluationRecommendation =
  | "proceed"
  | "proceed_with_caveats"
  | "reconsider"
  | "escalate"
  | "abort_signal_only";

export type CalibrationState = "uncalibrated_internal_alpha" | "calibrated_internal" | "calibrated_production";

export type DomainName = "sre" | "generic";

export interface TypedAction {
  type: string;
  target?: string;
  parameters?: Record<string, unknown>;
  expectedEffect?: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
}

export interface EvaluationRequestV2 {
  traceId: string;
  domain: DomainName;
  context: string;
  proposedAction: TypedAction;
  rationale: string;
  metadata?: Record<string, unknown>;
}

export interface SpecificityFeatures {
  numericThresholds: number;
  causalConnectors: number;
  domainTerms: number;
  actionTerms: number;
  evidenceMarkers: number;
  hedgeTerms: number;
}

export interface LinguisticSpecificityScore {
  value: number;
  features: SpecificityFeatures;
  notes: string[];
}

export interface ToulminArgument {
  claim: string;
  grounds: string[];
  warrants: string[];
  backing: string[];
  qualifiers: string[];
  rebuttals: string[];
  specificity: LinguisticSpecificityScore;
}

export interface AlternativeAction {
  id: string;
  action: TypedAction;
  rationale: string;
  contrastWithOriginal: string;
  generationMethod: "deterministic_near_neighbor" | "provider";
}

export type SupportMarginReliabilityState = "unreliable_internal_alpha" | "calibration_required";

export interface SupportMarginReliability {
  state: SupportMarginReliabilityState;
  reason: "benchmark_antiseparation" | "non_positive_margin" | "uncalibrated_margin";
  message: string;
}

export interface SupportAssessment {
  originalSupport: number;
  strongestAlternativeSupport: number;
  specificityMargin: number;
  strongestAlternativeId: string | null;
  notes: string[];
  marginReliability?: SupportMarginReliability;
}

export type GroundingAnchorKind = "numeric" | "entity" | "metric_state" | "mechanism";
export type GroundingAnchorStatus = "present" | "absent" | "contradicted";

export interface GroundingAnchor {
  id: string;
  kind: GroundingAnchorKind;
  text: string;
  normalizedText: string;
  loadBearing: boolean;
  status: GroundingAnchorStatus;
  contextEvidence: string | null;
  contradictionEvidence: string | null;
  weight: number;
  notes: string[];
}

export interface ContextGroundingSummary {
  present: number;
  absent: number;
  contradicted: number;
  loadBearing: number;
}

export interface ContextGroundingAssessment {
  score: number;
  anchors: GroundingAnchor[];
  summary: ContextGroundingSummary;
  notes: string[];
}

export interface EvaluationSubscores {
  rationaleSpecificity: number;
  actionCoupling: number;
  alternativeResistance: number;
  policyAlignment: number;
  contextGrounding: number;
}

export interface RubricMetadata {
  evaluatorVersion: string;
  rubricVersion: string;
  calibration: CalibrationState;
  signalName: "rationale-action specificity";
  evaluatorFingerprint?: string;
}

export interface ProviderMetadata {
  provider: string;
  model: string;
  roles: {
    alternativeGenerator: string;
    supportScorer: string;
  };
  deterministic: boolean;
}

export interface PolicyFinding {
  code: string;
  severity: "info" | "warning" | "blocker";
  message: string;
}

export type EvaluationOperatingMode = "internal_alpha_advisory";
export type ProductionDecisionUse = "not_validated_for_allow_deny";
export type EvaluationReviewReason =
  | "uncalibrated_internal_alpha"
  | "specificity_margin_unreliable"
  | "weak_context_grounding"
  | "contradicted_grounding"
  | "fallback_grounding"
  | "policy_blocker"
  | "low_overall_signal"
  | "incomplete_evaluation";
export type BlockedEvaluationUse =
  | "production_allow_deny"
  | "machine_actionable_consumption"
  | "hidden_chain_of_thought_faithfulness"
  | "objective_truth_validation";
export type AdvisorySummary = "internal_alpha_operator_review_required" | "error_no_numeric_signal";

export interface ReadinessMetadata {
  operatingMode: EvaluationOperatingMode;
  productionDecisionUse: ProductionDecisionUse;
  operatorReviewRequired: true;
  reviewNeeded: boolean;
  advisorySummary: AdvisorySummary;
  reviewReasons: EvaluationReviewReason[];
  blockedUses: BlockedEvaluationUse[];
  evaluatorVersion: string;
  evaluatorFingerprint: string;
}

export interface EvaluationReportV2 {
  traceId: string;
  status: EvaluationStatus;
  recommendation: EvaluationRecommendation;
  calibration: CalibrationState;
  overallSignal: number | null;
  subscores: EvaluationSubscores | null;
  support: SupportAssessment | null;
  grounding: ContextGroundingAssessment | null;
  toulmin: ToulminArgument | null;
  alternatives: AlternativeAction[];
  policyFindings: PolicyFinding[];
  topWeaknesses: string[];
  confidence: number | null;
  rubric: RubricMetadata;
  providerMetadata: ProviderMetadata;
  auditRef: string | null;
  errors: string[];
  productSemantics: string;
  readiness: ReadinessMetadata;
  createdAt: string;
}
