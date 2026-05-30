import type {
  CalibrationState,
  DomainName,
  EvaluationRecommendation,
  EvaluationStatus,
  GroundingAnchorKind,
  GroundingAnchorStatus,
  ProductionDecisionUse,
  ReadinessMetadata,
  SupportMarginReliabilityState,
  TypedAction,
} from "../evaluation/types.js";

export const SIDECAR_SCHEMA_VERSION = "hermes-action-review-v0-alpha-2026-05-03";

export interface ContextSection {
  label: string;
  text: string;
}

export interface HermesActionReviewInput {
  traceId?: string;
  domainHint?: DomainName;
  context: string | ContextSection[];
  proposedAction: TypedAction;
  rationale: string;
  metadata?: Record<string, unknown>;
}

export interface ParsedHermesActionReview {
  traceId: string;
  traceIdHash: string;
  domain: DomainName;
  context: string;
  contextSectionCount: number;
  proposedAction: TypedAction;
  rationale: string;
  metadata: Record<string, unknown>;
}

export type SidecarFindingSeverity = "info" | "warning" | "blocker";

export interface SidecarFinding {
  code: string;
  severity: SidecarFindingSeverity;
  message: string;
}

export type SidecarAdvisoryDecision =
  | "ready_for_operator_review"
  | "revise_or_gather_context"
  | "escalate_to_operator"
  | "evaluation_error";

export interface SanitizedRequestSummary {
  domain: DomainName;
  contextHash: string;
  rationaleHash: string;
  contextSectionCount: number;
  metadataKeys: string[];
  rawContentPersisted: false;
}

export interface SanitizedActionSummary {
  type: string;
  targetHash: string | null;
  riskLevel: TypedAction["riskLevel"] | null;
  parameterKeys: string[];
  expectedEffectHash: string | null;
}

export interface SanitizedEvaluationSummary {
  status: EvaluationStatus;
  recommendation: EvaluationRecommendation;
  effectiveRecommendation: EvaluationRecommendation;
  overallSignal: number | null;
  confidence: number | null;
  calibration: CalibrationState;
  genericDomainSignalUnreliable: boolean;
}

export interface SanitizedSupportSummary {
  originalSupport: number | null;
  strongestAlternativeSupport: number | null;
  specificityMargin: number | null;
  strongestAlternativeId: string | null;
  marginReliability: SupportMarginReliabilityState | null;
}

export interface SanitizedGroundingAnchorSummary {
  id: string;
  kind: GroundingAnchorKind;
  status: GroundingAnchorStatus;
  loadBearing: boolean;
  weight: number;
  textHash: string;
}

export interface SanitizedGroundingSummary {
  score: number | null;
  summary: {
    present: number;
    absent: number;
    contradicted: number;
    loadBearing: number;
  } | null;
  anchors: SanitizedGroundingAnchorSummary[];
}

export interface SidecarAdvisorySummary {
  decision: SidecarAdvisoryDecision;
  humanReviewRequired: true;
  canAutonomouslyExecute: false;
  findings: SidecarFinding[];
  reasons: string[];
  nextSteps: string[];
}

export interface SanitizedReadinessSummary {
  operatorReviewRequired: true;
  productionDecisionUse: ProductionDecisionUse;
  reviewNeeded: boolean;
  reviewReasons: ReadinessMetadata["reviewReasons"];
  blockedUses: ReadinessMetadata["blockedUses"];
}

export interface HermesActionReviewResult {
  schemaVersion: typeof SIDECAR_SCHEMA_VERSION;
  traceId: string;
  traceIdHash: string;
  createdAt: string;
  request: SanitizedRequestSummary;
  action: SanitizedActionSummary;
  evaluation: SanitizedEvaluationSummary;
  support: SanitizedSupportSummary;
  grounding: SanitizedGroundingSummary;
  advisory: SidecarAdvisorySummary;
  readiness: SanitizedReadinessSummary;
}
