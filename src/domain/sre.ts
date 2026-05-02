import { normalizeActionType } from "../evaluation/actions.js";
import type { EvaluationRequestV2, PolicyFinding } from "../evaluation/types.js";

export interface SrePolicyResult {
  score: number;
  findings: PolicyFinding[];
}

function includesAny(text: string, terms: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

export function evaluateSrePolicy(request: EvaluationRequestV2): SrePolicyResult {
  const text = `${request.context} ${request.rationale}`.toLowerCase();
  const findings: PolicyFinding[] = [];
  let score = 0.72;

  const actionType = normalizeActionType(request.proposedAction.type);

  if (actionType === "terminate_idle_sessions") {
    const requirements = [
      ["mentions_idle_transactions", ["idle in transaction", "idle sessions", "idle"]],
      ["mentions_lock_mechanism", ["lock", "locks", "blocking"]],
      ["mentions_age_threshold", ["minute", "older than", "30m", "30 minutes"]],
    ] as const;
    for (const [code, terms] of requirements) {
      if (includesAny(text, terms)) {
        score += 0.08;
      } else {
        score -= 0.18;
        findings.push({ code, severity: "warning", message: `Rationale should include ${code.replaceAll("_", " ")}.` });
      }
    }
  }

  if (actionType === "rollback_deployment") {
    if (!includesAny(text, ["deploy", "release", "version", "after rollout", "recent deployment"])) {
      score -= 0.24;
      findings.push({
        code: "missing_recent_deployment_evidence",
        severity: "warning",
        message: "Rollback rationale should identify a recent deployment or release-correlated regression.",
      });
    }
    if (!includesAny(text, ["blast radius", "affected users", "percentage", "%", "scope", "single region"])) {
      score -= 0.22;
      findings.push({
        code: "missing_blast_radius",
        severity: "warning",
        message: "Rollback rationale should describe blast radius and expected impact.",
      });
    }
  }

  if (["restart_service", "scale_service", "increase_iops"].includes(actionType)) {
    if (!includesAny(text, ["metric", "threshold", "%", "saturation", "latency", "error rate", "i/o", "io wait"])) {
      score -= 0.18;
      findings.push({
        code: "missing_metric_evidence",
        severity: "warning",
        message: "Operational action rationale should name concrete metric evidence.",
      });
    }
  }

  return { score: Math.max(0, Math.min(1, score)), findings };
}
