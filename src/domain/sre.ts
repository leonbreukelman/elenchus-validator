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

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function negatesApprovalRequirement(text: string, start: number, length: number): boolean {
  const left = text.slice(Math.max(0, start - 40), start);
  const window = text.slice(Math.max(0, start - 40), start + length + 40);
  return (
    /\b(?:no|not)\s+(?:human\s+|database lead\s+|capacity-team\s+|incident commander\s+)?$/.test(left) ||
    /\bapproval\s+(?:is\s+)?not\s+required\b/.test(window) ||
    /\bdoes\s+not\s+require\s+(?:human\s+|database lead\s+|capacity-team\s+|incident commander\s+)?approval\b/.test(window)
  );
}

function hasNonNegatedMatch(text: string, patterns: readonly RegExp[]): boolean {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (!negatesApprovalRequirement(text, match.index, match[0].length)) return true;
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  }
  return false;
}

function requiresHumanApproval(text: string): boolean {
  return hasNonNegatedMatch(text, [
    /\brequires(?: [a-z0-9-]+){0,5} approval\b/g,
    /\bneeds(?: [a-z0-9-]+){0,5} approval\b/g,
    /\bapproval required\b/g,
    /\bmust be approved\b/g,
  ]);
}

function approvalMissingOrUnknown(text: string): boolean {
  return matchesAny(text, [
    /\bno approval (?:is )?(?:recorded|present|found|available|appears)\b/,
    /\bwithout approval\b/,
    /\bapproval (?:is |appears )?(?:missing|unknown|absent|not recorded)\b/,
    /\bapproval has not been (?:recorded|granted|obtained)\b/,
    /\bunapproved\b/,
  ]);
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

  const approvalRequired = requiresHumanApproval(text);
  const approvalMissing = approvalMissingOrUnknown(text);
  if (approvalRequired && approvalMissing) {
    score -= 0.42;
    findings.push({
      code: "requires_human_approval",
      severity: "blocker",
      message: "Local policy requires human approval before this automated operational action, but approval is missing or unknown.",
    });
  }

  if (actionType === "restart_service" && includesAny(text, ["requires drain", "drain confirmation"]) && includesAny(text, ["drain status is unknown", "without drain", "no drain"])) {
    score -= 0.32;
    findings.push({
      code: "missing_drain_confirmation",
      severity: "blocker",
      message: "Restart policy requires drain confirmation before restarting this service.",
    });
  }

  return { score: Math.max(0, Math.min(1, score)), findings };
}
