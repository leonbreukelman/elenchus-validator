import { describe, expect, it } from "vitest";
import { evaluateSrePolicy } from "../../src/domain/sre.js";
import type { EvaluationRequestV2 } from "../../src/evaluation/types.js";

describe("SRE policy overlay", () => {
  it("accepts terminate-idle-sessions when rationale names idle transactions, locks, and age threshold", () => {
    const request: EvaluationRequestV2 = {
      traceId: "sre-policy-pass",
      domain: "sre",
      context: "12 idle in transaction sessions older than 30m are blocking VACUUM.",
      proposedAction: {
        type: "terminate_idle_sessions",
        target: "postgres",
        parameters: { maxIdleAgeMinutes: 30 },
        expectedEffect: "release locks",
        riskLevel: "medium",
      },
      rationale:
        "The sessions are idle in transaction for 30 minutes, holding locks, and blocking VACUUM. Terminating them releases locks.",
    };

    const result = evaluateSrePolicy(request);

    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.findings.every((finding) => finding.severity !== "blocker")).toBe(true);
  });

  it("normalizes plan-style uppercase SRE action names", () => {
    const request: EvaluationRequestV2 = {
      traceId: "sre-policy-uppercase",
      domain: "sre",
      context: "12 idle in transaction sessions older than 30m are blocking VACUUM.",
      proposedAction: {
        type: "TERMINATE_IDLE_SESSIONS",
        target: "postgres",
        parameters: { maxIdleAgeMinutes: 30 },
        riskLevel: "medium",
      },
      rationale:
        "The sessions are idle in transaction for 30 minutes, holding locks, and blocking VACUUM. Terminating them releases locks.",
    };

    const result = evaluateSrePolicy(request);

    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.findings.every((finding) => finding.severity !== "blocker")).toBe(true);
  });

  it("flags risky rollback rationales that omit blast radius and recent deployment evidence", () => {
    const request: EvaluationRequestV2 = {
      traceId: "sre-policy-warn",
      domain: "sre",
      context: "Error rate increased after a dependency timeout.",
      proposedAction: {
        type: "rollback_deployment",
        target: "payments-api",
        parameters: {},
        riskLevel: "high",
      },
      rationale: "Things look bad, rollback should help.",
    };

    const result = evaluateSrePolicy(request);

    expect(result.score).toBeLessThan(0.6);
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["missing_recent_deployment_evidence", "missing_blast_radius"])
    );
  });
});
