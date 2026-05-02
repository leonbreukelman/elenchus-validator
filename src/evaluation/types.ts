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

export interface SupportAssessment {
  originalSupport: number;
  strongestAlternativeSupport: number;
  specificityMargin: number;
  strongestAlternativeId: string | null;
  notes: string[];
}

export interface EvaluationSubscores {
  rationaleSpecificity: number;
  actionCoupling: number;
  alternativeResistance: number;
  policyAlignment: number;
}

export interface RubricMetadata {
  evaluatorVersion: string;
  rubricVersion: string;
  calibration: CalibrationState;
  signalName: "rationale-action specificity";
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

export interface EvaluationReportV2 {
  traceId: string;
  status: EvaluationStatus;
  recommendation: EvaluationRecommendation;
  calibration: CalibrationState;
  overallSignal: number | null;
  subscores: EvaluationSubscores | null;
  support: SupportAssessment;
  toulmin: ToulminArgument | null;
  alternatives: AlternativeAction[];
  policyFindings: PolicyFinding[];
  topWeaknesses: string[];
  confidence: number;
  rubric: RubricMetadata;
  providerMetadata: ProviderMetadata;
  auditRef: string | null;
  errors: string[];
  productSemantics: string;
  createdAt: string;
}
