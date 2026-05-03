import { describe, expect, it } from "vitest";
import {
  buildErrorReport,
  buildReport,
  DEFAULT_FALLBACK_GROUNDING_SCORE,
  EVALUATOR_FINGERPRINT,
  EVALUATOR_FINGERPRINT_INPUTS,
  EVALUATOR_VERSION,
  isTerminalEvaluationStatus,
  OVERALL_WEIGHTS,
} from "../../src/evaluation/report.js";
import { ANCHOR_WEIGHTS, GROUNDING_RULESET_FINGERPRINT, GROUNDING_SCORE_CAPS, RECOMMENDATION_GROUNDING_FLOORS } from "../../src/evaluation/grounding.js";
import {
  extractToulminArgument,
  scoreLinguisticSpecificity,
} from "../../src/evaluation/toulmin.js";
import { generateNearNeighborAlternatives } from "../../src/evaluation/saboteur.js";
import { evaluateWithDeterministicProvider } from "../../src/evaluation/evaluator.js";
import { validateSupportAssessment } from "../../src/evaluation/providers.js";
import type { ContextGroundingAssessment, EvaluationRequestV2 } from "../../src/evaluation/types.js";

const request: EvaluationRequestV2 = {
  traceId: "trace-v2-types-001",
  domain: "sre",
  context:
    "Postgres primary has 95% I/O wait. pg_stat_activity shows 12 idle in transaction sessions older than 30 minutes holding locks on audit_logs. VACUUM is blocked.",
  proposedAction: {
    type: "terminate_idle_sessions",
    target: "postgres-primary",
    parameters: { maxIdleAgeMinutes: 30, relation: "audit_logs" },
    expectedEffect: "release locks so VACUUM can reduce table bloat",
    riskLevel: "medium",
  },
  rationale:
    "Because 12 idle in transaction sessions older than 30 minutes are holding locks on audit_logs and blocking VACUUM, table bloat is driving the I/O spike. Terminating sessions older than 30 minutes releases the locks and addresses the specific cause rather than only adding capacity.",
};

const groundedAssessment: ContextGroundingAssessment = {
  score: 0.86,
  anchors: [
    {
      id: "anchor-1",
      kind: "numeric",
      text: "12 idle in transaction sessions older than 30 minutes",
      normalizedText: "12 idle in transaction sessions older than 30 minutes",
      loadBearing: true,
      status: "present",
      contextEvidence: "12 idle in transaction sessions older than 30 minutes",
      contradictionEvidence: null,
      weight: 1,
      notes: [],
    },
  ],
  summary: {
    present: 1,
    absent: 0,
    contradicted: 0,
    loadBearing: 1,
  },
  notes: ["Deterministic context-grounding proxy over supplied context only; not objective truth validation."],
};

describe("v2 report semantics", () => {
  it("builds complete reports with explicit uncalibrated internal-alpha semantics", () => {
    const report = buildReport({
      request,
      toulmin: extractToulminArgument(request.rationale),
      alternatives: [],
      support: {
        originalSupport: 0.84,
        strongestAlternativeSupport: 0.2,
        specificityMargin: 0.64,
        strongestAlternativeId: null,
        notes: ["specific thresholds and mechanism found"],
      },
      subscores: {
        rationaleSpecificity: 0.88,
        actionCoupling: 0.82,
        alternativeResistance: 0.74,
        policyAlignment: 0.9,
        contextGrounding: groundedAssessment.score,
      },
      grounding: groundedAssessment,
      policyFindings: [],
      auditRef: "audit/trace-v2-types-001.jsonl",
    });

    expect(report.status).toBe("complete");
    expect(report.overallSignal).toBeGreaterThan(0);
    expect(report.calibration).toBe("uncalibrated_internal_alpha");
    expect(report.recommendation).toBe("proceed");
    expect(report.productSemantics).toContain("rationale-action specificity");
    expect(report.productSemantics).toContain("machine-actionable consumption");
    expect(report.productSemantics).not.toContain("truth oracle");
    expect(report.readiness).toMatchObject({
      operatingMode: "internal_alpha_advisory",
      productionDecisionUse: "not_validated_for_allow_deny",
      operatorReviewRequired: true,
      reviewNeeded: false,
      advisorySummary: "internal_alpha_operator_review_required",
      evaluatorVersion: EVALUATOR_VERSION,
    });
    expect(report.readiness.blockedUses).toEqual(
      expect.arrayContaining(["production_allow_deny", "machine_actionable_consumption", "hidden_chain_of_thought_faithfulness"])
    );
    expect(report.readiness.reviewReasons).toContain("uncalibrated_internal_alpha");
    expect(report.readiness.reviewReasons).toContain("specificity_margin_unreliable");
    expect(report.support.marginReliability).toMatchObject({ state: "unreliable_internal_alpha" });
  });

  it("builds complete reports with the context grounding contract", () => {
    const report = buildReport({
      request,
      toulmin: extractToulminArgument(request.rationale),
      alternatives: [],
      support: {
        originalSupport: 0.84,
        strongestAlternativeSupport: 0.2,
        specificityMargin: 0.64,
        strongestAlternativeId: null,
        notes: ["specific thresholds and mechanism found"],
      },
      subscores: {
        rationaleSpecificity: 0.88,
        actionCoupling: 0.82,
        alternativeResistance: 0.74,
        policyAlignment: 0.9,
        contextGrounding: groundedAssessment.score,
      },
      grounding: groundedAssessment,
      policyFindings: [],
    });

    expect(report.subscores?.contextGrounding).toBe(groundedAssessment.score);
    expect(report.grounding?.score).toBe(groundedAssessment.score);
    expect(report.grounding?.summary).toMatchObject({ present: 1, absent: 0, contradicted: 0, loadBearing: 1 });
    expect(report.grounding?.notes.join(" ")).toContain("not objective truth validation");
    expect(report.productSemantics).toContain("context-grounding");
    expect(report.productSemantics).toContain("does not validate objective truth");
  });

  it("does not fabricate proceed from high fallback grounding without explicit evidence", () => {
    const report = buildReport({
      request,
      toulmin: extractToulminArgument(request.rationale),
      alternatives: [],
      support: {
        originalSupport: 0.95,
        strongestAlternativeSupport: 0.05,
        specificityMargin: 0.9,
        strongestAlternativeId: null,
        notes: ["synthetic high support without explicit grounding"],
      },
      subscores: {
        rationaleSpecificity: 0.99,
        actionCoupling: 0.99,
        alternativeResistance: 0.99,
        policyAlignment: 0.99,
        contextGrounding: 0.99,
      },
      policyFindings: [],
    });

    expect(report.grounding?.summary).toEqual({ present: 0, absent: 0, contradicted: 0, loadBearing: 0 });
    expect(report.grounding?.score).toBeLessThan(RECOMMENDATION_GROUNDING_FLOORS.lowGroundingThreshold);
    expect(report.recommendation).toBe("reconsider");
    expect(report.readiness.reviewNeeded).toBe(true);
    expect(report.readiness.reviewReasons).toContain("fallback_grounding");
  });

  it("freezes overall signal weights", () => {
    expect(OVERALL_WEIGHTS).toEqual({
      rationaleSpecificity: 0.23,
      actionCoupling: 0.22,
      alternativeResistance: 0.2,
      policyAlignment: 0.15,
      contextGrounding: 0.2,
    });
  });

  it("binds evaluator version metadata to the scoring and grounding fingerprint", () => {
    const report = buildReport({
      request,
      toulmin: extractToulminArgument(request.rationale),
      alternatives: [],
      support: {
        originalSupport: 0.84,
        strongestAlternativeSupport: 0.2,
        specificityMargin: 0.64,
        strongestAlternativeId: null,
        notes: ["specific thresholds and mechanism found"],
      },
      subscores: {
        rationaleSpecificity: 0.88,
        actionCoupling: 0.82,
        alternativeResistance: 0.74,
        policyAlignment: 0.9,
        contextGrounding: groundedAssessment.score,
      },
      grounding: groundedAssessment,
      policyFindings: [],
    });

    expect(report.rubric.evaluatorVersion).toBe(EVALUATOR_VERSION);
    expect(report.rubric.evaluatorFingerprint).toBe(EVALUATOR_FINGERPRINT);
    expect(report.readiness.evaluatorFingerprint).toBe(EVALUATOR_FINGERPRINT);
    expect(EVALUATOR_FINGERPRINT_INPUTS).toMatchObject({
      overallWeights: OVERALL_WEIGHTS,
      groundingRulesetFingerprint: GROUNDING_RULESET_FINGERPRINT,
      recommendationGroundingFloors: RECOMMENDATION_GROUNDING_FLOORS,
      groundingAnchorWeights: ANCHOR_WEIGHTS,
      groundingScoreCaps: GROUNDING_SCORE_CAPS,
      defaultFallbackGroundingScore: DEFAULT_FALLBACK_GROUNDING_SCORE,
    });
    expect(DEFAULT_FALLBACK_GROUNDING_SCORE).toBeLessThan(RECOMMENDATION_GROUNDING_FLOORS.lowGroundingThreshold);
  });

  it("builds error reports without pretending score zero is a judgment", () => {
    const report = buildErrorReport(request, "provider returned malformed JSON");

    expect(report.status).toBe("error");
    expect(report.overallSignal).toBeNull();
    expect(report.subscores).toBeNull();
    expect(report.support).toBeNull();
    expect(report.grounding).toBeNull();
    expect(report.confidence).toBeNull();
    expect(report.recommendation).toBe("abort_signal_only");
    expect(report.readiness).toMatchObject({
      operatingMode: "internal_alpha_advisory",
      productionDecisionUse: "not_validated_for_allow_deny",
      operatorReviewRequired: true,
      reviewNeeded: true,
      advisorySummary: "error_no_numeric_signal",
    });
    expect(report.readiness.reviewReasons).toEqual(expect.arrayContaining(["incomplete_evaluation", "uncalibrated_internal_alpha"]));
    expect(report.errors).toContain("provider returned malformed JSON");
  });

  it("classifies terminal statuses separately from numeric scores", () => {
    expect(isTerminalEvaluationStatus("complete")).toBe(true);
    expect(isTerminalEvaluationStatus("timeout")).toBe(true);
    expect(isTerminalEvaluationStatus("skipped")).toBe(false);
  });
});

describe("deterministic Toulmin and specificity extraction", () => {
  it("extracts claim, grounds, warrants, qualifiers, backing, and specificity score", () => {
    const argument = extractToulminArgument(request.rationale);

    expect(argument.claim).toContain("Terminating sessions");
    expect(argument.grounds.length).toBeGreaterThanOrEqual(2);
    expect(argument.warrants.join(" ")).toContain("releases");
    expect(argument.qualifiers).toContain("30 minutes");
    expect(argument.backing.join(" ")).toContain("VACUUM");

    const score = scoreLinguisticSpecificity(request.rationale);
    expect(score.value).toBeGreaterThan(0.7);
    expect(score.features.numericThresholds).toBeGreaterThanOrEqual(2);
  });
});

describe("provider support validation", () => {
  it("rejects out-of-range provider support values", () => {
    expect(() =>
      validateSupportAssessment(
        {
          originalSupport: 2,
          strongestAlternativeSupport: 0.2,
          specificityMargin: 0.8,
          strongestAlternativeId: null,
          notes: [],
        },
        []
      )
    ).toThrow(/originalSupport/);
  });
});

describe("near-neighbor alternatives and deterministic evaluator", () => {
  it("generates typed SRE alternatives for swap-test support", () => {
    const alternatives = generateNearNeighborAlternatives(request);

    expect(alternatives.map((alt) => alt.action.type)).toEqual(
      expect.arrayContaining(["increase_iops", "restart_service", "page_human"])
    );
    expect(alternatives.every((alt) => alt.contrastWithOriginal.length > 0)).toBe(true);
  });

  it("generates typed SRE alternatives for uppercase plan action names", () => {
    const alternatives = generateNearNeighborAlternatives({
      ...request,
      proposedAction: { ...request.proposedAction, type: "TERMINATE_IDLE_SESSIONS" },
    });

    expect(alternatives.map((alt) => alt.action.type)).toEqual(
      expect.arrayContaining(["increase_iops", "restart_service", "page_human"])
    );
  });

  it("returns a complete status-safe report using the deterministic provider", async () => {
    const report = await evaluateWithDeterministicProvider(request);

    expect(report.status).toBe("complete");
    expect(report.overallSignal).toBeGreaterThan(0.6);
    expect(report.support.specificityMargin).toBeGreaterThan(0);
    expect(report.subscores?.contextGrounding).toBeGreaterThanOrEqual(0.75);
    expect(report.grounding?.score).toBe(report.subscores?.contextGrounding);
    expect(report.alternatives.length).toBeGreaterThan(0);
    expect(report.providerMetadata.provider).toBe("deterministic-local");
    expect(report.readiness.operatorReviewRequired).toBe(true);
    expect(report.readiness.productionDecisionUse).toBe("not_validated_for_allow_deny");
  });

  it("caps recommendations and records weaknesses for contradicted grounding", async () => {
    const report = await evaluateWithDeterministicProvider({
      traceId: "trace-v2-grounding-contradicted",
      domain: "sre",
      context:
        "Cache workers are healthy. CPU usage is normal at 28%, memory pressure is absent, and there is no resource saturation; queue delay comes from upstream rate limiting.",
      proposedAction: { type: "restart_service", target: "cache-workers" },
      rationale:
        "Restart the cache workers because CPU saturation and memory pressure are causing local resource contention.",
    });

    expect(report.status).toBe("complete");
    expect(report.subscores?.contextGrounding).toBeLessThan(0.4);
    expect(report.grounding?.summary.contradicted).toBeGreaterThan(0);
    expect(report.recommendation).not.toBe("proceed");
    expect(report.topWeaknesses.join(" ").toLowerCase()).toContain("context grounding");
    expect(report.readiness.reviewReasons).toEqual(expect.arrayContaining(["weak_context_grounding", "contradicted_grounding"]));
  });

  it("does not over-penalize a strongly grounded specific rationale", async () => {
    const report = await evaluateWithDeterministicProvider({
      traceId: "trace-v2-grounding-strong",
      domain: "sre",
      context:
        "Checkout API incident: p95 latency is 920ms, 5xx error rate is 18%, and CPU saturation is 94% on checkout-api pods after deploy release-2026-05-02. The new release doubled DB connection pool usage.",
      proposedAction: { type: "rollback_deployment", target: "checkout-api" },
      rationale:
        "Because checkout-api p95 latency is 920ms, 5xx error rate is 18%, and CPU saturation is 94% after deploy release-2026-05-02, rolling back the deployment targets the release-correlated regression rather than scaling around it.",
    });

    expect(report.status).toBe("complete");
    expect(report.subscores?.contextGrounding).toBeGreaterThanOrEqual(0.75);
    expect(["proceed", "proceed_with_caveats"]).toContain(report.recommendation);
    expect(report.readiness.reviewReasons).not.toContain("weak_context_grounding");
    expect(report.readiness.reviewReasons).not.toContain("contradicted_grounding");
  });

  it("low contradicted grounding lowers confidence relative to a strong grounded case", async () => {
    const contradicted = await evaluateWithDeterministicProvider({
      traceId: "trace-v2-grounding-confidence-low",
      domain: "sre",
      context:
        "Search API p95 latency is 180ms, 5xx error rate is 0.2%, and traffic is steady with no resource saturation.",
      proposedAction: { type: "scale_service", target: "search-api" },
      rationale:
        "Scale search-api because p95 latency is 900ms and 5xx error rate is 12%, showing capacity saturation.",
    });
    const grounded = await evaluateWithDeterministicProvider(request);

    expect(contradicted.subscores?.contextGrounding).toBeLessThan(0.5);
    expect(grounded.subscores?.contextGrounding).toBeGreaterThanOrEqual(0.75);
    expect(contradicted.confidence).toBeLessThan(grounded.confidence);
  });
});
