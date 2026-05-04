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

  it("does not block when policy says no approval is required", () => {
    const request: EvaluationRequestV2 = {
      traceId: "sre-policy-no-approval-required",
      domain: "sre",
      context:
        "The runbook says no approval required for temporary IOPS increases below 20% during a Sev2 incident when I/O saturation exceeds 90%.",
      proposedAction: {
        type: "increase_iops",
        target: "orders-db",
        parameters: { tier: "temporary-20-percent" },
        riskLevel: "medium",
      },
      rationale:
        "Increase IOPS because the database is at 94% I/O saturation and the documented runbook says no approval required for this temporary tier during Sev2 response.",
    };

    const result = evaluateSrePolicy(request);

    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "requires_human_approval", severity: "blocker" }),
      ])
    );
  });

  it("still blocks when a separate policy clause requires approval even if another clause says no approval is required", () => {
    const request: EvaluationRequestV2 = {
      traceId: "sre-policy-mixed-approval-rules",
      domain: "sre",
      context:
        "The runbook says no approval required for temporary IOPS increases below 20%. For permanent tier changes, policy requires database lead approval; no approval is recorded in the ticket.",
      proposedAction: {
        type: "increase_iops",
        target: "orders-db",
        parameters: { tier: "permanent-next" },
        riskLevel: "medium",
      },
      rationale:
        "Increase IOPS because the database is at 94% I/O saturation, but this is a permanent tier change and approval is not recorded.",
    };

    const result = evaluateSrePolicy(request);

    expect(result.score).toBeLessThan(0.5);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "requires_human_approval", severity: "blocker" }),
      ])
    );
  });

  it("does not block when required approval is recorded in the ticket", () => {
    const request: EvaluationRequestV2 = {
      traceId: "sre-policy-approval-recorded",
      domain: "sre",
      context:
        "Storage spend cap is exhausted and policy requires database lead approval for tier changes; approval appears in ticket INC-42 from the database lead.",
      proposedAction: {
        type: "increase_iops",
        target: "orders-db",
        parameters: { tier: "next" },
        riskLevel: "medium",
      },
      rationale:
        "Increase IOPS because the orders database is at 93% I/O saturation and database lead approval is recorded in ticket INC-42.",
    };

    const result = evaluateSrePolicy(request);

    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "requires_human_approval", severity: "blocker" }),
      ])
    );
  });

  it("blocks automation when local policy requires approval and no approval is recorded", () => {
    const request: EvaluationRequestV2 = {
      traceId: "sre-policy-approval",
      domain: "sre",
      context:
        "Storage spend cap is exhausted and policy requires database lead approval for tier changes; no approval is recorded in the ticket.",
      proposedAction: {
        type: "increase_iops",
        target: "orders-db",
        parameters: { tier: "next" },
        riskLevel: "medium",
      },
      rationale: "Increase IOPS because higher throughput is likely to help and cost can be handled later.",
    };

    const result = evaluateSrePolicy(request);

    expect(result.score).toBeLessThan(0.5);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "requires_human_approval", severity: "blocker" }),
      ])
    );
  });
});
