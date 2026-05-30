import { normalizeActionType } from "./actions.js";
import type { AlternativeAction, EvaluationRequestV2, TypedAction } from "./types.js";

const SRE_NEIGHBORS: Record<string, TypedAction[]> = {
  terminate_idle_sessions: [
    { type: "increase_iops", target: "database", parameters: { tier: "next" }, expectedEffect: "absorb I/O pressure", riskLevel: "medium" },
    { type: "restart_service", target: "database", parameters: { mode: "rolling" }, expectedEffect: "clear stuck connections", riskLevel: "high" },
    { type: "page_human", target: "database-oncall", parameters: { urgency: "high" }, expectedEffect: "manual lock review", riskLevel: "low" },
  ],
  rollback_deployment: [
    { type: "restart_service", target: "service", parameters: { mode: "rolling" }, expectedEffect: "clear transient failure", riskLevel: "medium" },
    { type: "scale_service", target: "service", parameters: { replicas: "increase" }, expectedEffect: "reduce load per instance", riskLevel: "medium" },
    { type: "page_human", target: "incident-commander", parameters: { urgency: "high" }, riskLevel: "low" },
  ],
  increase_iops: [
    { type: "terminate_idle_sessions", target: "database", parameters: {}, expectedEffect: "release lock contention", riskLevel: "medium" },
    { type: "page_human", target: "database-oncall", parameters: {}, riskLevel: "low" },
  ],
};

const SRE_DEFAULT_NEIGHBORS: TypedAction[] = [
  { type: "page_human", target: "oncall", parameters: { urgency: "normal" }, riskLevel: "low" },
  { type: "restart_service", target: "affected-service", parameters: { mode: "rolling" }, riskLevel: "medium" },
];

const GENERIC_NEIGHBORS: Record<string, TypedAction[]> = {
  share_file: [
    { type: "share_view_only", target: "same-resource", parameters: { permission: "view" }, expectedEffect: "limit access while allowing review", riskLevel: "low" },
    { type: "ask_permission_confirmation", target: "operator", parameters: { question: "confirm access scope" }, expectedEffect: "confirm collaboration scope", riskLevel: "low" },
    { type: "do_not_share", target: "same-resource", parameters: {}, expectedEffect: "avoid exposing the resource", riskLevel: "low" },
  ],
  grant_file_access: [
    { type: "share_view_only", target: "same-resource", parameters: { permission: "view" }, expectedEffect: "limit access while allowing review", riskLevel: "low" },
    { type: "ask_permission_confirmation", target: "operator", parameters: { question: "confirm access scope" }, expectedEffect: "confirm collaboration scope", riskLevel: "low" },
    { type: "do_not_share", target: "same-resource", parameters: {}, expectedEffect: "avoid exposing the resource", riskLevel: "low" },
  ],
  share_drive_file: [
    { type: "share_view_only", target: "same-resource", parameters: { permission: "view" }, expectedEffect: "limit access while allowing review", riskLevel: "low" },
    { type: "ask_permission_confirmation", target: "operator", parameters: { question: "confirm access scope" }, expectedEffect: "confirm collaboration scope", riskLevel: "low" },
    { type: "do_not_share", target: "same-resource", parameters: {}, expectedEffect: "avoid exposing the resource", riskLevel: "low" },
  ],
  send_email: [
    { type: "draft_only", target: "message-draft", parameters: {}, expectedEffect: "prepare content without sending", riskLevel: "low" },
    { type: "ask_recipient_confirmation", target: "operator", parameters: {}, expectedEffect: "confirm recipients before sending", riskLevel: "low" },
    { type: "do_not_send", target: "message", parameters: {}, expectedEffect: "avoid sending until context is clearer", riskLevel: "low" },
  ],
  reply_email: [
    { type: "draft_only", target: "message-draft", parameters: {}, expectedEffect: "prepare content without sending", riskLevel: "low" },
    { type: "ask_recipient_confirmation", target: "operator", parameters: {}, expectedEffect: "confirm recipients before sending", riskLevel: "low" },
    { type: "do_not_send", target: "message", parameters: {}, expectedEffect: "avoid sending until context is clearer", riskLevel: "low" },
  ],
  code_edit: [
    { type: "add_test_first", target: "repo", parameters: {}, expectedEffect: "capture expected behavior before editing", riskLevel: "low" },
    { type: "read_more_context", target: "repo", parameters: {}, expectedEffect: "inspect surrounding code before editing", riskLevel: "low" },
    { type: "run_verification", target: "repo", parameters: {}, expectedEffect: "verify current failure or success state", riskLevel: "low" },
  ],
  modify_file: [
    { type: "add_test_first", target: "repo", parameters: {}, expectedEffect: "capture expected behavior before editing", riskLevel: "low" },
    { type: "read_more_context", target: "repo", parameters: {}, expectedEffect: "inspect surrounding code before editing", riskLevel: "low" },
    { type: "run_verification", target: "repo", parameters: {}, expectedEffect: "verify current failure or success state", riskLevel: "low" },
  ],
  add_memory: [
    { type: "save_as_hypothesis", target: "memory-candidate", parameters: {}, expectedEffect: "preserve uncertainty instead of durable fact", riskLevel: "low" },
    { type: "do_not_add_memory", target: "memory-store", parameters: {}, expectedEffect: "avoid polluting durable memory", riskLevel: "low" },
    { type: "ask_memory_confirmation", target: "operator", parameters: {}, expectedEffect: "confirm durable usefulness", riskLevel: "low" },
  ],
  mark_task_complete: [
    { type: "run_verification", target: "task", parameters: {}, expectedEffect: "confirm acceptance criteria", riskLevel: "low" },
    { type: "keep_task_open", target: "task", parameters: {}, expectedEffect: "avoid premature closure", riskLevel: "low" },
    { type: "request_human_review", target: "operator", parameters: {}, expectedEffect: "obtain review before closure", riskLevel: "low" },
  ],
};

const GENERIC_DEFAULT_NEIGHBORS: TypedAction[] = [
  { type: "request_human_review", target: "operator", parameters: {}, expectedEffect: "obtain human review before acting", riskLevel: "low" },
  { type: "narrow_scope", target: "proposed-action", parameters: {}, expectedEffect: "reduce action scope until better grounded", riskLevel: "low" },
  { type: "do_nothing", target: "proposed-action", parameters: {}, expectedEffect: "avoid acting on insufficient support", riskLevel: "low" },
];

export function generateNearNeighborAlternatives(request: EvaluationRequestV2): AlternativeAction[] {
  const originalType = normalizeActionType(request.proposedAction.type);
  const actions = request.domain === "sre"
    ? SRE_NEIGHBORS[originalType] ?? SRE_DEFAULT_NEIGHBORS
    : GENERIC_NEIGHBORS[originalType] ?? GENERIC_DEFAULT_NEIGHBORS;

  return actions.map((action, index) => ({
    id: `alt-${index + 1}-${action.type}`,
    action,
    rationale: `Near-neighbor ${request.domain === "sre" ? "SRE" : "generic agent"} alternative to test whether the same rationale for ${originalType} also supports ${action.type}.`,
    contrastWithOriginal: `${action.type} addresses a nearby response instead of ${originalType}.`,
    generationMethod: "deterministic_near_neighbor",
  }));
}
