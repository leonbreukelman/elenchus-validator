import { randomUUID } from "node:crypto";
import { safeAuditTraceId } from "../evaluation/audit.js";
import { normalizeActionType } from "../evaluation/actions.js";
import { evaluateRequestV2 } from "../evaluation/evaluator.js";
import { DeterministicEvaluationProvider, type EvaluationProvider } from "../evaluation/providers.js";
import type { EvaluationReportV2, EvaluationRequestV2, EvaluationRecommendation, TypedAction } from "../evaluation/types.js";
import { sha256Hex } from "../util/hash.js";
import {
  SIDECAR_SCHEMA_VERSION,
  type HermesActionReviewInput,
  type HermesActionReviewResult,
  type ParsedHermesActionReview,
  type SidecarAdvisoryDecision,
  type SidecarFinding,
} from "./types.js";

const MAX_CONTEXT_CHARS = 16_000;
const MAX_RATIONALE_CHARS = 8_000;

const FINDING_MESSAGES = {
  generic_domain_signal_unreliable:
    "Generic-domain sidecar signals are uncalibrated and must be treated as operator-review input only.",
  sensitive_action_requires_operator_review:
    "High-risk or critical actions require explicit operator review before any external side effect.",
  missing_recipients:
    "Email actions require explicit recipient context before the draft can be reviewed.",
  share_permission_not_grounded:
    "Requested write-level sharing is not grounded by the supplied context and rationale.",
  irreversible_destructive_action_requires_explicit_confirmation:
    "Irreversible destructive actions require explicit operator confirmation and evidence.",
  permission_change_high_blast_radius:
    "Permission ownership or collaborator changes have high blast radius and require operator review.",
  repo_history_irreversible_change:
    "Repository history-changing operations require independent review before execution.",
  external_recipient_requires_review:
    "External-recipient email actions require operator review before sending.",
  memory_overwrite_loses_history:
    "Memory overwrite or deletion can lose durable context and requires review.",
  weak_or_fallback_grounding:
    "The supplied context does not provide enough grounded support for this action review.",
  low_overall_signal:
    "The evaluator returned a low advisory signal for the proposed action.",
  evaluation_not_complete:
    "The evaluator did not complete, so no action-support signal is available.",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function stableKeys(value: Record<string, unknown> | undefined): string[] {
  return Object.keys(value ?? {}).sort();
}

function sanitizeMetadataKeys(value: Record<string, unknown> | undefined): string[] {
  return Array.from(new Set(stableKeys(value).map(sanitizeParameterKey))).sort();
}

function sanitizeParameterKey(key: string): string {
  if (key.length > 48 || /[@/\\:\s]/.test(key)) return "[redacted_key]";
  return key;
}

function parameterKeys(action: TypedAction): string[] {
  return Array.from(new Set(Object.keys(action.parameters ?? {}).map(sanitizeParameterKey))).sort();
}

function maybeHash(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? sha256Hex(value) : null;
}

function normalizeContext(context: unknown): { context: string; contextSectionCount: number } {
  if (typeof context === "string") {
    const trimmed = context.trim();
    if (!trimmed) throw new Error("context is required");
    return { context: truncate(trimmed, MAX_CONTEXT_CHARS), contextSectionCount: 1 };
  }

  if (!Array.isArray(context) || context.length === 0) {
    throw new Error("context is required");
  }

  const sections = context.map((section, index) => {
    if (!isRecord(section) || !nonEmptyString(section.label) || !nonEmptyString(section.text)) {
      throw new Error(`context section ${index + 1} must include label and text`);
    }
    return `[${section.label.trim()}]\n${section.text.trim()}`;
  });
  const combined = sections.join("\n\n").trim();
  if (!combined) throw new Error("context is required");
  return { context: truncate(combined, MAX_CONTEXT_CHARS), contextSectionCount: sections.length };
}

function parseAction(value: unknown): TypedAction {
  if (!isRecord(value)) throw new Error("proposedAction is required");
  if (!nonEmptyString(value.type)) throw new Error("proposedAction.type is required");
  const riskLevel = ["low", "medium", "high", "critical"].includes(String(value.riskLevel))
    ? (value.riskLevel as TypedAction["riskLevel"])
    : undefined;
  const parameters = isRecord(value.parameters) ? value.parameters : undefined;
  return {
    type: value.type.trim(),
    target: typeof value.target === "string" ? value.target : undefined,
    parameters,
    expectedEffect: typeof value.expectedEffect === "string" ? value.expectedEffect : undefined,
    riskLevel,
  };
}

export function parseHermesActionReviewInput(value: unknown): ParsedHermesActionReview {
  if (!isRecord(value)) throw new Error("input must be an object");
  const { context, contextSectionCount } = normalizeContext(value.context);
  const proposedAction = parseAction(value.proposedAction);
  if (!nonEmptyString(value.rationale)) throw new Error("rationale is required");
  const rawTraceId = nonEmptyString(value.traceId) ? value.traceId.trim() : `action-review-${randomUUID()}`;
  const domain = value.domainHint === "sre" ? "sre" : "generic";

  return {
    traceId: safeAuditTraceId(rawTraceId),
    traceIdHash: sha256Hex(rawTraceId),
    domain,
    context,
    contextSectionCount,
    proposedAction,
    rationale: truncate(value.rationale.trim(), MAX_RATIONALE_CHARS),
    metadata: isRecord(value.metadata) ? value.metadata : {},
  };
}

function finding(code: keyof typeof FINDING_MESSAGES, severity: SidecarFinding["severity"]): SidecarFinding {
  return { code, severity, message: FINDING_MESSAGES[code] };
}

function hasRecipients(action: TypedAction): boolean {
  const params = action.parameters ?? {};
  const recipients = params.recipients ?? params.to;
  if (typeof recipients === "string") return recipients.trim().length > 0;
  if (Array.isArray(recipients)) return recipients.some((item) => typeof item === "string" && item.trim().length > 0);
  return false;
}

function rawStringParameter(action: TypedAction, keys: string[]): string {
  const params = action.parameters ?? {};
  return keys
    .map((key) => params[key])
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function wantsWriteLevelShare(action: TypedAction): boolean {
  const permissionText = rawStringParameter(action, ["permission", "role", "access", "accessLevel"]);
  return /\b(edit|write|writer|owner|ownership|manage|collaborator)\b/i.test(permissionText);
}

function writeLevelShareGrounded(parsed: ParsedHermesActionReview): boolean {
  const text = `${parsed.context}\n${parsed.rationale}`.toLowerCase();
  return /\b(edit|write|writer|owner|ownership|modify|manage)\b/i.test(text);
}

function recipientDomains(action: TypedAction): string[] {
  const params = action.parameters ?? {};
  const recipients = params.recipients ?? params.to;
  const raw = Array.isArray(recipients) ? recipients : typeof recipients === "string" ? [recipients] : [];
  return raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.match(/@([^>\s]+)$/)?.[1]?.toLowerCase())
    .filter((value): value is string => Boolean(value));
}

function configuredSelfDomains(metadata: Record<string, unknown>): string[] {
  const raw = metadata.selfDomains;
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase()) : [];
}

function sidecarFindings(parsed: ParsedHermesActionReview, report: EvaluationReportV2): SidecarFinding[] {
  const findings: SidecarFinding[] = [];
  const actionType = normalizeActionType(parsed.proposedAction.type);

  if (parsed.domain === "generic") findings.push(finding("generic_domain_signal_unreliable", "info"));
  if (parsed.proposedAction.riskLevel === "high" || parsed.proposedAction.riskLevel === "critical") {
    findings.push(finding("sensitive_action_requires_operator_review", "warning"));
  }
  if (/\b(send_email|reply_email|send_external_email)\b/.test(actionType) && !hasRecipients(parsed.proposedAction)) {
    findings.push(finding("missing_recipients", "blocker"));
  }
  if (["share_file", "grant_file_access", "share_drive_file"].includes(actionType) && wantsWriteLevelShare(parsed.proposedAction) && !writeLevelShareGrounded(parsed)) {
    findings.push(finding("share_permission_not_grounded", "warning"));
  }
  if (
    ["delete_file", "delete_drive_file", "trash_file"].includes(actionType) ||
    actionType.startsWith("permanent_delete")
  ) {
    findings.push(finding("irreversible_destructive_action_requires_explicit_confirmation", "blocker"));
  }
  if (["revoke_access", "remove_collaborator", "change_owner"].includes(actionType)) {
    findings.push(finding("permission_change_high_blast_radius", "warning"));
  }
  if (["force_push", "git_reset_hard", "delete_branch"].includes(actionType)) {
    findings.push(finding("repo_history_irreversible_change", "warning"));
  }
  if (["delete_memory", "overwrite_memory"].includes(actionType)) {
    findings.push(finding("memory_overwrite_loses_history", "warning"));
  }

  const selfDomains = configuredSelfDomains(parsed.metadata);
  const domains = recipientDomains(parsed.proposedAction);
  if (selfDomains.length > 0 && domains.some((domain) => !selfDomains.includes(domain))) {
    findings.push(finding("external_recipient_requires_review", "warning"));
  }

  if (report.status !== "complete") findings.push(finding("evaluation_not_complete", "blocker"));
  if (report.status === "complete" && report.grounding && (report.grounding.summary.loadBearing === 0 || report.grounding.score < 0.6)) {
    findings.push(finding("weak_or_fallback_grounding", "warning"));
  }
  if (report.overallSignal !== null && report.overallSignal < 0.55) {
    findings.push(finding("low_overall_signal", "warning"));
  }

  return dedupeFindings(findings);
}

function dedupeFindings(findings: SidecarFinding[]): SidecarFinding[] {
  const byCode = new Map<string, SidecarFinding>();
  const severityRank = { info: 0, warning: 1, blocker: 2 } satisfies Record<SidecarFinding["severity"], number>;
  for (const item of findings) {
    const previous = byCode.get(item.code);
    if (!previous || severityRank[item.severity] > severityRank[previous.severity]) byCode.set(item.code, item);
  }
  return Array.from(byCode.values());
}

function effectiveRecommendation(domain: ParsedHermesActionReview["domain"], recommendation: EvaluationRecommendation): EvaluationRecommendation {
  if (domain === "generic" && recommendation === "proceed") return "proceed_with_caveats";
  return recommendation;
}

function hasPositiveEvidence(report: EvaluationReportV2): boolean {
  if (report.status !== "complete" || !report.grounding || !report.support) return false;
  const presentAnchorEvidence = report.grounding.summary.present > 0 && report.grounding.summary.loadBearing > 0;
  const strongGrounding = report.grounding.summary.loadBearing > 0 && report.grounding.score >= 0.6;
  return (presentAnchorEvidence || strongGrounding) && report.support.specificityMargin > 0.2;
}

function advisoryDecision(report: EvaluationReportV2, findings: SidecarFinding[]): SidecarAdvisoryDecision {
  if (report.status !== "complete") return "evaluation_error";
  if (findings.some((item) => item.severity === "blocker")) return "escalate_to_operator";
  if (!hasPositiveEvidence(report)) return "revise_or_gather_context";
  if (report.grounding && (report.grounding.summary.contradicted > 0 || report.grounding.score < 0.6)) return "revise_or_gather_context";
  if (report.overallSignal !== null && report.overallSignal < 0.55) return "revise_or_gather_context";
  return "ready_for_operator_review";
}

function advisoryReasons(report: EvaluationReportV2, findings: SidecarFinding[], decision: SidecarAdvisoryDecision): string[] {
  const reasons = new Set<string>();
  reasons.add(decision);
  for (const finding of findings) reasons.add(finding.code);
  for (const reason of report.readiness.reviewReasons) reasons.add(reason);
  if (!hasPositiveEvidence(report)) reasons.add("positive_grounding_or_margin_missing");
  return Array.from(reasons);
}

function nextSteps(decision: SidecarAdvisoryDecision): string[] {
  switch (decision) {
    case "ready_for_operator_review":
      return ["operator_review_required", "inspect_sanitized_report", "decide_manually_outside_sidecar"];
    case "revise_or_gather_context":
      return ["gather_more_context", "revise_rationale_or_action", "rerun_sidecar_review"];
    case "escalate_to_operator":
      return ["route_to_operator", "do_not_execute_action", "resolve_blocker_findings"];
    case "evaluation_error":
      return ["inspect_input_shape", "retry_review", "do_not_use_numeric_signal"];
  }
}

export function sanitizeEvaluationReport(parsed: ParsedHermesActionReview, report: EvaluationReportV2, findings: SidecarFinding[]): HermesActionReviewResult {
  const decision = advisoryDecision(report, findings);
  const normalizedType = normalizeActionType(parsed.proposedAction.type);
  const genericUnreliable = parsed.domain === "generic";

  return {
    schemaVersion: SIDECAR_SCHEMA_VERSION,
    traceId: parsed.traceId,
    traceIdHash: parsed.traceIdHash,
    createdAt: new Date().toISOString(),
    request: {
      domain: parsed.domain,
      contextHash: sha256Hex(parsed.context),
      rationaleHash: sha256Hex(parsed.rationale),
      contextSectionCount: parsed.contextSectionCount,
      metadataKeys: sanitizeMetadataKeys(parsed.metadata),
      rawContentPersisted: false,
    },
    action: {
      type: normalizedType,
      targetHash: maybeHash(parsed.proposedAction.target),
      riskLevel: parsed.proposedAction.riskLevel ?? null,
      parameterKeys: parameterKeys(parsed.proposedAction),
      expectedEffectHash: maybeHash(parsed.proposedAction.expectedEffect),
    },
    evaluation: {
      status: report.status,
      recommendation: report.recommendation,
      effectiveRecommendation: effectiveRecommendation(parsed.domain, report.recommendation),
      overallSignal: report.overallSignal,
      confidence: report.confidence,
      calibration: report.calibration,
      genericDomainSignalUnreliable: genericUnreliable,
    },
    support: report.support
      ? {
          originalSupport: report.support.originalSupport,
          strongestAlternativeSupport: report.support.strongestAlternativeSupport,
          specificityMargin: report.support.specificityMargin,
          strongestAlternativeId: report.support.strongestAlternativeId,
          marginReliability: report.support.marginReliability?.state ?? null,
        }
      : {
          originalSupport: null,
          strongestAlternativeSupport: null,
          specificityMargin: null,
          strongestAlternativeId: null,
          marginReliability: null,
        },
    grounding: report.grounding
      ? {
          score: report.grounding.score,
          summary: report.grounding.summary,
          anchors: report.grounding.anchors.map((anchor) => ({
            id: anchor.id,
            kind: anchor.kind,
            status: anchor.status,
            loadBearing: anchor.loadBearing,
            weight: anchor.weight,
            textHash: sha256Hex(anchor.text),
          })),
        }
      : {
          score: null,
          summary: null,
          anchors: [],
        },
    advisory: {
      decision,
      humanReviewRequired: true,
      canAutonomouslyExecute: false,
      findings,
      reasons: advisoryReasons(report, findings, decision),
      nextSteps: nextSteps(decision),
    },
    readiness: {
      operatorReviewRequired: true,
      productionDecisionUse: report.readiness.productionDecisionUse,
      reviewNeeded: report.readiness.reviewNeeded,
      reviewReasons: report.readiness.reviewReasons,
      blockedUses: report.readiness.blockedUses,
    },
  };
}

export async function reviewHermesAction(
  input: HermesActionReviewInput,
  options: { provider?: EvaluationProvider; signal?: AbortSignal } = {}
): Promise<HermesActionReviewResult> {
  const parsed = parseHermesActionReviewInput(input);
  const request: EvaluationRequestV2 = {
    traceId: parsed.traceId,
    domain: parsed.domain,
    context: parsed.context,
    proposedAction: parsed.proposedAction,
    rationale: parsed.rationale,
    metadata: {
      ...parsed.metadata,
      source: "hermes-action-review-sidecar",
      sidecarSchemaVersion: SIDECAR_SCHEMA_VERSION,
    },
  };
  const report = await evaluateRequestV2(request, {
    provider: options.provider ?? new DeterministicEvaluationProvider(),
    signal: options.signal,
  });
  const findings = sidecarFindings(parsed, report);
  return sanitizeEvaluationReport(parsed, report, findings);
}
