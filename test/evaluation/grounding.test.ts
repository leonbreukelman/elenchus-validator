import { describe, expect, it } from "vitest";
import {
  ANCHOR_WEIGHTS,
  GROUNDING_SCORE_CAPS,
  RECOMMENDATION_GROUNDING_FLOORS,
  assessContextGrounding,
} from "../../src/evaluation/grounding.js";
import type { EvaluationRequestV2, TypedAction } from "../../src/evaluation/types.js";

function request(context: string, rationale: string, proposedAction: TypedAction = { type: "rollback_deployment", target: "unit-service" }): EvaluationRequestV2 {
  return {
    traceId: "grounding-unit",
    domain: "sre",
    context,
    proposedAction,
    rationale,
  };
}

describe("deterministic context grounding", () => {
  it("scores present load-bearing anchors high for a fresh strong case", () => {
    const assessment = assessContextGrounding(
      request(
        "Checkout API incident: p95 latency is 920ms, 5xx error rate is 18%, and CPU saturation is 94% on checkout-api pods after deploy release-2026-05-02. The new release doubled DB connection pool usage.",
        "Because checkout-api p95 latency is 920ms, 5xx error rate is 18%, and CPU saturation is 94% after deploy release-2026-05-02, rolling back the deployment targets the release-correlated regression rather than scaling around it."
      )
    );

    expect(assessment.score).toBeGreaterThanOrEqual(0.8);
    expect(assessment.anchors.some((anchor) => anchor.kind === "numeric" && anchor.status === "present")).toBe(true);
    expect(assessment.anchors.some((anchor) => anchor.kind === "mechanism" && anchor.status === "present")).toBe(true);
    expect(assessment.summary.absent).toBe(0);
    expect(assessment.summary.contradicted).toBe(0);
  });

  it("marks explicitly negated claim families contradicted", () => {
    const assessment = assessContextGrounding(
      request(
        "Cache workers are healthy. CPU usage is normal at 28%, memory pressure is absent, and there is no resource saturation; queue delay comes from upstream rate limiting.",
        "Restart the cache workers because CPU saturation and memory pressure are causing local resource contention.",
        { type: "restart_service", target: "cache-workers" }
      )
    );

    expect(assessment.anchors.some((anchor) => anchor.status === "contradicted")).toBe(true);
    expect(assessment.score).toBeLessThan(0.4);
  });

  it.each([
    {
      label: "no lock waits",
      context: "Database lock dashboard is healthy: there are no lock waits and vacuum is not blocked.",
      rationale: "Take no action because there are no lock waits and vacuum is not blocked.",
      expected: ["locks:normal"],
    },
    {
      label: "no memory pressure",
      context: "Cache workers are healthy with no memory pressure and steady heap usage.",
      rationale: "Do not restart cache workers because there is no memory pressure.",
      expected: ["memory:normal"],
    },
    {
      label: "memory pressure is absent",
      context: "Allocator telemetry says memory pressure is absent and heap usage is steady.",
      rationale: "Keep observing because memory pressure is absent.",
      expected: ["memory:normal"],
    },
    {
      label: "not blocked",
      context: "Vacuum is not blocked and locks are clear on the primary database.",
      rationale: "No database intervention is needed because vacuum is not blocked.",
      expected: ["locks:normal"],
    },
    {
      label: "CPU usage is normal",
      context: "Compute dashboard reports CPU usage is normal at 31% and workers are healthy.",
      rationale: "Do not scale the workers because CPU usage is normal at 31%.",
      expected: ["cpu:normal"],
    },
  ])("treats normal or negated metric-state spans as normal evidence: $label", ({ context, rationale, expected }) => {
    const assessment = assessContextGrounding(request(context, rationale, { type: "no_action", target: "sre-runbook" }));

    for (const normalizedText of expected) {
      expect(assessment.anchors).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: "metric_state", normalizedText, status: "present" })])
      );
    }
    expect(assessment.anchors.filter((anchor) => anchor.kind === "metric_state" && anchor.status === "contradicted")).toEqual([]);
  });

  it("preserves true metric-state contradiction detection outside negated or normal spans", () => {
    const normalClaimAgainstIssueContext = assessContextGrounding(
      request(
        "Database locks show active waits and vacuum is blocked by idle transactions.",
        "Take no action because there are no lock waits and vacuum is not blocked.",
        { type: "no_action", target: "sre-runbook" }
      )
    );
    const issueClaimAgainstNormalContext = assessContextGrounding(
      request(
        "Compute dashboard reports CPU usage is normal and workers are healthy.",
        "Scale the workers because CPU saturation is causing the incident.",
        { type: "scale_service", target: "workers" }
      )
    );

    expect(normalClaimAgainstIssueContext.anchors.some((anchor) => anchor.kind === "metric_state" && anchor.status === "contradicted")).toBe(true);
    expect(issueClaimAgainstNormalContext.anchors.some((anchor) => anchor.kind === "metric_state" && anchor.status === "contradicted")).toBe(true);
  });

  it("marks release-correlation claims contradicted when context negates the event", () => {
    const assessment = assessContextGrounding(
      request(
        "Payments-api error rate began at 14:05. There was no deploy, rollout, release, or version change in the previous 24 hours; the change calendar is empty.",
        "Rollback the payments-api deployment because 5xx errors started after the latest release and the deploy caused the regression.",
        { type: "rollback_deployment", target: "payments-api" }
      )
    );

    expect(assessment.anchors.some((anchor) => anchor.status === "contradicted" && anchor.kind !== "entity")).toBe(true);
    expect(assessment.score).toBeLessThan(0.45);
  });

  it("marks metric state contradicted when the same metric has an incompatible value", () => {
    const assessment = assessContextGrounding(
      request(
        "Search API p95 latency is 180ms, 5xx error rate is 0.2%, and traffic is steady.",
        "Scale search-api because p95 latency is 900ms and 5xx error rate is 12%, showing capacity saturation.",
        { type: "scale_service", target: "search-api" }
      )
    );

    expect(assessment.anchors.some((anchor) => anchor.status === "contradicted" && ["metric_state", "numeric"].includes(anchor.kind))).toBe(true);
    expect(assessment.score).toBeLessThan(0.5);
  });

  it("binds after-number I/O numerics to I/O instead of an unrelated preceding locks family", () => {
    const assessment = assessContextGrounding(
      request(
        "Database locks are normal with no lock waits. Storage telemetry reports 87% I/O wait and low available IOPS.",
        "Locks stay normal and 87% I/O wait shows storage saturation, so increasing IOPS targets the disk bottleneck.",
        { type: "increase_iops", target: "database-storage" }
      )
    );

    expect(assessment.anchors.some((anchor) => anchor.kind === "numeric" && anchor.normalizedText === "io:87" && anchor.status === "present")).toBe(true);
    expect(assessment.anchors.some((anchor) => anchor.kind === "numeric" && anchor.normalizedText === "locks:87")).toBe(false);
  });

  it("keeps same-clause CPU, memory, queue, and error numerics attached to their own families", () => {
    const assessment = assessContextGrounding(
      request(
        "Compute telemetry shows CPU at 91%, memory at 7GB, queue depth at 240, and error rate at 6%.",
        "Scale the worker pool because CPU is 91% while memory is 7GB, queue depth is 240, and error rate is 6%.",
        { type: "scale_service", target: "worker-pool" }
      )
    );

    expect(assessment.anchors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "numeric", normalizedText: "cpu:91", status: "present" }),
        expect.objectContaining({ kind: "numeric", normalizedText: "memory:7gb", status: "present" }),
        expect.objectContaining({ kind: "numeric", normalizedText: "queue:240", status: "present" }),
        expect.objectContaining({ kind: "numeric", normalizedText: "errors:6", status: "present" }),
      ])
    );
  });

  it("leaves ambiguous multi-family numerics familyless instead of choosing the wrong metric", () => {
    const assessment = assessContextGrounding(
      request(
        "CPU and memory were reviewed together; the incident summary attributes 70% of user-visible impact to combined resource symptoms.",
        "CPU and memory jointly account for 70% of the user-visible impact, so scale the service while operators inspect both resources.",
        { type: "scale_service", target: "checkout-workers" }
      )
    );

    expect(assessment.anchors.some((anchor) => anchor.kind === "numeric" && anchor.normalizedText === "70" && anchor.status === "present")).toBe(true);
    expect(assessment.anchors.some((anchor) => anchor.kind === "numeric" && /^(cpu|memory):70$/.test(anchor.normalizedText))).toBe(false);
  });

  it("does not treat the same numeric value in a different metric family as support", () => {
    const assessment = assessContextGrounding(
      request(
        "CPU usage is 87%, while memory pressure is normal and no memory saturation is present.",
        "Restart the service because memory pressure is 87% and local resource exhaustion is driving failures.",
        { type: "restart_service", target: "api-workers" }
      )
    );

    expect(assessment.anchors.some((anchor) => anchor.kind === "numeric" && anchor.normalizedText === "memory:87" && anchor.status !== "present")).toBe(true);
    expect(assessment.anchors.some((anchor) => anchor.kind === "numeric" && anchor.normalizedText === "cpu:87" && anchor.status === "present")).toBe(false);
    expect(assessment.score).toBeLessThan(0.6);
  });

  it("keeps metric-state polarity family-local in mixed-family clauses", () => {
    const assessment = assessContextGrounding(
      request(
        "Database locks are normal with no lock waits. Storage telemetry reports 87% I/O wait and storage saturation.",
        "Locks are normal while 87% I/O wait shows storage saturation, so increasing IOPS targets the disk bottleneck.",
        { type: "increase_iops", target: "database-storage" }
      )
    );

    expect(assessment.anchors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "metric_state", normalizedText: "locks:normal", status: "present" }),
        expect.objectContaining({ kind: "metric_state", normalizedText: "io:issue", status: "present" }),
      ])
    );
    expect(assessment.anchors.some((anchor) => anchor.kind === "metric_state" && anchor.normalizedText === "io:normal")).toBe(false);
    expect(assessment.summary.contradicted).toBe(0);
  });

  it("does not let a normal CPU span make a queue issue look normal", () => {
    const assessment = assessContextGrounding(
      request(
        "CPU usage is normal at 28%. Queue depth is growing and backlog is high for checkout jobs.",
        "CPU is normal, but queue depth is growing and the backlog is high, so scaling workers targets queue saturation.",
        { type: "scale_service", target: "checkout-workers" }
      )
    );

    expect(assessment.anchors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "metric_state", normalizedText: "cpu:normal", status: "present" }),
        expect.objectContaining({ kind: "metric_state", normalizedText: "queue:issue", status: "present" }),
      ])
    );
    expect(assessment.anchors.some((anchor) => anchor.kind === "metric_state" && anchor.normalizedText === "queue:normal")).toBe(false);
  });

  it("preserves same-family issue evidence when another span is normal", () => {
    const assessment = assessContextGrounding(
      request(
        "CPU was normal during baseline, but current CPU saturation is high and CPU is pegged on worker pods.",
        "Scale the worker pods because current CPU saturation is high and pegged workers are causing the incident.",
        { type: "scale_service", target: "worker-pods" }
      )
    );

    expect(assessment.anchors).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "metric_state", normalizedText: "cpu:issue", status: "present" })])
    );
    expect(assessment.summary.contradicted).toBe(0);
  });

  it("marks unseen specific entities absent without claiming truth validation", () => {
    const assessment = assessContextGrounding(
      request(
        "Inventory service p95 latency is elevated and error budget burn is 3x; no table names, host names, or release IDs are included.",
        "Rollback release-qa-77 because table orders_archive on inventory-db has 80% lock waits from deploy build 8432.",
        { type: "rollback_deployment", target: "inventory" }
      )
    );

    expect(assessment.summary.absent).toBeGreaterThan(0);
    expect(assessment.score).toBeLessThanOrEqual(0.5);
    expect(assessment.notes.join(" ")).toContain("not objective truth validation");
  });

  it("keeps grounding low when context has no matching anchors", () => {
    const assessment = assessContextGrounding(
      request(
        "General incident handoff pending.",
        "Terminate 14 idle sessions older than 45 minutes on billing-db because they hold locks on ledger_entries and block VACUUM.",
        { type: "terminate_idle_sessions", target: "billing-db" }
      )
    );

    expect(assessment.summary.loadBearing).toBeGreaterThan(0);
    expect(assessment.score).toBeLessThanOrEqual(0.25);
  });

  it("does not reward verbatim context copy with a fabricated load-bearing mechanism", () => {
    const assessment = assessContextGrounding(
      request(
        "Orders API p95 latency is 870ms. 5xx error rate is 11%. Queue depth is 240. Deploy calendar is quiet.",
        "Orders API p95 latency is 870ms, 5xx error rate is 11%, and queue depth is 240; restart_service is required because database connection pool exhaustion is the load-bearing mechanism.",
        { type: "restart_service", target: "orders-api" }
      )
    );

    expect(assessment.anchors.some((anchor) => anchor.kind === "mechanism" && anchor.status !== "present")).toBe(true);
    expect(assessment.score).toBeLessThanOrEqual(0.65);
  });

  it("keeps grounded action mismatch facts highly grounded when facts are present", () => {
    const assessment = assessContextGrounding(
      request(
        "Search worker memory leak confirmed: heap grows 2GB per hour, pod restarts clear the leak, and there was no release in the last day.",
        "Because search worker heap grows 2GB per hour and pod restarts clear the memory leak, restarting the service targets local process degradation.",
        { type: "rollback_deployment", target: "search-worker" }
      )
    );

    expect(assessment.score).toBeGreaterThanOrEqual(0.75);
    expect(assessment.summary.contradicted).toBe(0);
  });

  it("freezes grounding weights, score caps, and recommendation floors", () => {
    expect(ANCHOR_WEIGHTS).toEqual({
      numeric: 1,
      entity: 0.7,
      metric_state: 1.2,
      mechanism: 1.2,
    });
    expect(GROUNDING_SCORE_CAPS).toEqual({
      noAnchorFloor: 0.45,
      anchorlessContextCap: 0.25,
      contradictedHighWeightCap: 0.35,
      absentHalfWeightCap: 0.5,
      absentHighWeightMechanismCap: 0.65,
    });
    expect(RECOMMENDATION_GROUNDING_FLOORS).toEqual({
      contradictionCap: "reconsider",
      lowGroundingThreshold: 0.4,
      lowGroundingCap: "reconsider",
      mediumGroundingThreshold: 0.6,
      mediumGroundingCap: "proceed_with_caveats",
    });
  });
});
