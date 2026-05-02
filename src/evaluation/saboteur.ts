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

const DEFAULT_NEIGHBORS: TypedAction[] = [
  { type: "page_human", target: "oncall", parameters: { urgency: "normal" }, riskLevel: "low" },
  { type: "restart_service", target: "affected-service", parameters: { mode: "rolling" }, riskLevel: "medium" },
];

export function generateNearNeighborAlternatives(request: EvaluationRequestV2): AlternativeAction[] {
  const originalType = normalizeActionType(request.proposedAction.type);
  const actions = request.domain === "sre" ? SRE_NEIGHBORS[originalType] ?? DEFAULT_NEIGHBORS : DEFAULT_NEIGHBORS;

  return actions.map((action, index) => ({
    id: `alt-${index + 1}-${action.type}`,
    action,
    rationale: `Near-neighbor SRE alternative to test whether the same rationale also supports ${action.type}.`,
    contrastWithOriginal: `${action.type} addresses a nearby operational response instead of ${originalType}.`,
    generationMethod: "deterministic_near_neighbor",
  }));
}
