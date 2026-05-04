import { mkdtemp, readFile, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeSreBenchmarkMetrics,
  renderSreBenchmarkMarkdown,
  renderSreBenchmarkStdoutSummary,
  runSreBenchmark,
  shuffledCases,
  writeSreBenchmarkOutputs,
  type SreBenchmarkCase,
  type SreBenchmarkGovernance,
  type SreBenchmarkItem,
} from "../../src/evaluation/sreBenchmark.js";
import sreCases from "../../benchmark/fixtures/sre/sre-benchmark-cases.json" with { type: "json" };

const unitGovernance: SreBenchmarkGovernance = {
  benchmarkSchemaVersion: "sre-benchmark-v2-alpha-2026-05-03",
  fixtureCaseManifestFingerprint: "0".repeat(64),
  fixtureCaseManifestHashAlgorithm: "sha256_non_prose_case_manifest",
  fixtureFullContentFingerprint: "1".repeat(64),
  fixtureFullContentHashAlgorithm: "sha256_raw_fixture_file",
  evaluatorVersions: ["unit"],
  evaluatorFingerprints: ["unit-fingerprint"],
  lockboxProcess: {
    rawLockboxContextOrRationaleInspectedForThisRun: null,
    rulesFrozenBeforeLockboxEvaluation: null,
    attestationSource: "not_recorded",
    benchmarkOutputCommitPolicy: "generated_outputs_ignored_and_uncommitted",
    attestation:
      "No lockbox-blindness attestation was supplied for this run; treat lockbox split metrics as advisory governance signals, not autonomous approval or certified held-out validation.",
  },
};

const baseCase: SreBenchmarkCase = {
  id: "unit-strong",
  domain: "sre",
  context: "Payments API p95 latency rose to 900ms after deploy 2026.05.02.1; errors affect 12% of requests.",
  proposedAction: { type: "rollback_deployment", target: "payments-api", riskLevel: "high" },
  rationale: "Because p95 latency and 5xx errors rose immediately after deploy 2026.05.02.1 for 12% of requests, rollback_deployment targets the release-correlated regression rather than adding replicas.",
  label: "strong_specific",
  split: "exploratory",
  source: "unit_test",
  labelReviewer: "unit_test",
  usedForEvaluatorTuning: false,
  expectedRecommendationBands: ["proceed", "proceed_with_caveats"],
  expectedStrengths: ["deployment correlation"],
  expectedWeaknesses: [],
  nearNeighborAlternatives: [
    { type: "scale_service", whyNearby: "also addresses latency", expectedSupport: "low" },
  ],
  policyExpectations: { allowProceed: true, expectedFindingCodes: [], requiresHumanApproval: false },
  notes: "Unit strong case.",
};

function item(overrides: Partial<SreBenchmarkItem>): SreBenchmarkItem {
  const testCase = { ...baseCase, id: overrides.case?.id ?? baseCase.id, ...(overrides.case ?? {}) };
  const reportOverrides = overrides.report;
  const requestedGrounding = reportOverrides?.grounding?.score ?? reportOverrides?.subscores?.contextGrounding;
  const groundingScore = typeof requestedGrounding === "number" ? requestedGrounding : 0.82;
  const baseReport: SreBenchmarkItem["report"] = {
    traceId: testCase.id,
    status: "complete",
    recommendation: "proceed",
    calibration: "uncalibrated_internal_alpha",
    overallSignal: 0.82,
    subscores: {
      rationaleSpecificity: 0.8,
      actionCoupling: 0.8,
      alternativeResistance: 0.8,
      policyAlignment: 0.9,
      contextGrounding: groundingScore,
    },
    grounding: {
      score: groundingScore,
      anchors: [],
      summary: { present: 1, absent: 0, contradicted: 0, loadBearing: 1 },
      notes: ["unit grounding"],
    },
    support: {
      originalSupport: 0.7,
      strongestAlternativeSupport: 0.2,
      specificityMargin: 0.5,
      strongestAlternativeId: null,
      notes: ["unit"],
    },
    toulmin: null,
    alternatives: [],
    policyFindings: [],
    topWeaknesses: [],
    confidence: 0.7,
    rubric: {
      evaluatorVersion: "unit",
      rubricVersion: "unit",
      calibration: "uncalibrated_internal_alpha",
      signalName: "rationale-action specificity",
    },
    providerMetadata: {
      provider: "deterministic-local",
      model: "heuristic-v0",
      roles: { alternativeGenerator: "deterministic_near_neighbor", supportScorer: "unit" },
      deterministic: true,
    },
    auditRef: null,
    errors: [],
    productSemantics:
      "Uncalibrated internal-alpha rationale-action specificity signal with deterministic context-grounding proxy; not objective truth validation, hidden reasoning faithfulness detection, or a production allow/deny gate.",
    readiness: {
      operatingMode: "internal_alpha_advisory",
      productionDecisionUse: "not_validated_for_allow_deny",
      operatorReviewRequired: true,
      reviewNeeded: false,
      advisorySummary: "internal_alpha_operator_review_required",
      reviewReasons: ["uncalibrated_internal_alpha", "specificity_margin_unreliable"],
      blockedUses: ["production_allow_deny", "machine_actionable_consumption", "hidden_chain_of_thought_faithfulness", "objective_truth_validation"],
      evaluatorVersion: "unit",
      evaluatorFingerprint: "unit-fingerprint",
    },
    createdAt: "2026-05-02T00:00:00.000Z",
  };
  const report: SreBenchmarkItem["report"] = {
    ...baseReport,
    ...reportOverrides,
    subscores: {
      ...baseReport.subscores,
      ...(reportOverrides?.subscores ?? {}),
      contextGrounding: groundingScore,
    },
    grounding: reportOverrides?.grounding ?? baseReport.grounding,
  };

  const baseItem: SreBenchmarkItem = {
    case: testCase,
    report,
    expectedBandMatched: true,
    expectedBandDistance: 0,
    policyExpectationMet: true,
    calibrationCaveatPresent: true,
    trivialFeatures: {
      rationaleLength: testCase.rationale.length,
      numericTokenCount: 2,
      contextRationaleLexicalOverlap: 0.5,
      actionTermHits: 1,
    },
  };

  return { ...baseItem, ...overrides, case: testCase, report };
}

describe("SRE benchmark fixture", () => {
  it("contains at least 40 synthetic cases covering required labels and action types", () => {
    const cases = sreCases as SreBenchmarkCase[];
    expect(cases.length).toBeGreaterThanOrEqual(40);
    expect(new Set(cases.map((c) => c.label))).toEqual(
      new Set([
        "strong_specific",
        "vague",
        "multi_action_support",
        "specific_but_unsupported",
        "grounded_action_mismatch",
        "policy_violation",
        "adversarial_polished_nonspecific",
      ])
    );
    expect([...new Set(cases.map((c) => c.proposedAction.type))]).toEqual(
      expect.arrayContaining([
        "terminate_idle_sessions",
        "rollback_deployment",
        "increase_iops",
        "restart_service",
        "scale_service",
        "page_human",
        "investigate_more",
        "no_action",
      ])
    );
    expect(cases.every((c) => c.nearNeighborAlternatives.length > 0)).toBe(true);
    expect(cases.every((c) => c.expectedRecommendationBands.length > 0)).toBe(true);
  });

  it("builds shuffled controls from different labels and action types when possible", () => {
    const cases = sreCases as SreBenchmarkCase[];
    const controls = shuffledCases(cases);
    expect(controls.length).toBe(cases.length);
    for (const [index, control] of controls.entries()) {
      const sourceId = control.notes.match(/Shuffled-control rationale source: ([^ ]+)/)?.[1];
      const source = cases.find((candidate) => candidate.id === sourceId);
      expect(source).toBeDefined();
      expect(source?.label).not.toBe(cases[index].label);
      expect(source?.proposedAction.type).not.toBe(cases[index].proposedAction.type);
    }
  });
});

describe("SRE benchmark metrics", () => {
  it("computes separation, false rates, policy detection, rank agreement, baselines, and caveat hygiene", () => {
    const items: SreBenchmarkItem[] = [
      item({ case: { ...baseCase, id: "strong-1", label: "strong_specific" }, report: { ...item({}).report, overallSignal: 0.84, recommendation: "proceed" } }),
      item({ case: { ...baseCase, id: "weak-1", label: "vague", expectedRecommendationBands: ["reconsider"] }, report: { ...item({}).report, overallSignal: 0.42, recommendation: "reconsider", support: { ...item({}).report.support, specificityMargin: 0.05 } } }),
      item({ case: { ...baseCase, id: "adv-1", label: "adversarial_polished_nonspecific", expectedRecommendationBands: ["reconsider", "escalate"] }, report: { ...item({}).report, overallSignal: 0.78, recommendation: "proceed" }, expectedBandMatched: false, expectedBandDistance: 2 }),
      item({ case: { ...baseCase, id: "policy-1", label: "policy_violation", expectedRecommendationBands: ["escalate"], policyExpectations: { allowProceed: false, expectedFindingCodes: ["requires_human_approval"], requiresHumanApproval: true } }, report: { ...item({}).report, overallSignal: 0.7, recommendation: "escalate", policyFindings: [{ code: "requires_human_approval", severity: "blocker", message: "needs approval" }] }, policyExpectationMet: true }),
    ];

    const metrics = computeSreBenchmarkMetrics(items, { shuffledMeanOverallSignal: 0.4 });

    expect(metrics.itemCount).toBe(4);
    expect(metrics.strongWeakOverallSeparation).toBeGreaterThan(0);
    expect(metrics.falseProceedRateWeak).toBeCloseTo(1 / 3, 4);
    expect(metrics.falseReconsiderRateStrong).toBe(0);
    expect(metrics.policyViolationDetectionRate).toBe(1);
    expect(metrics.rankAgreement).toBeGreaterThan(0);
    expect(metrics.baselines.alwaysProceed.falseProceedRateWeak).toBe(1);
    expect(metrics.controlComparisons.shuffledMeanOverallSignal).toBe(0.4);
    expect(metrics.calibrationCaveatTextPresent).toBe(true);
  });

  it("keeps metrics null-safe for non-complete reports without support or confidence", () => {
    const metrics = computeSreBenchmarkMetrics([
      item({
        case: { ...baseCase, id: "provider-error", expectedRecommendationBands: ["abort_signal_only"] },
        report: {
          ...item({}).report,
          status: "error",
          recommendation: "abort_signal_only",
          overallSignal: null,
          subscores: null,
          support: null,
          grounding: null,
          confidence: null,
          errors: ["provider unavailable"],
        },
      }),
    ]);

    expect(metrics.completeCount).toBe(0);
    expect(metrics.meanSpecificityMargin).toBeNull();
    expect(metrics.byLabel.strong_specific?.meanSpecificityMargin).toBeNull();
    expect(metrics.failureTaxonomy.counts.lowMargin).toBe(0);
    expect(metrics.failureTaxonomy.counts.lowConfidence).toBe(0);
  });

  it("computes context grounding metrics, diagnostic failures, and shuffled grounding drop", () => {
    const absentAnchor = {
      id: "a1",
      kind: "mechanism" as const,
      text: "invented queue starvation",
      normalizedText: "invented queue starvation",
      loadBearing: true,
      status: "absent" as const,
      contextEvidence: null,
      contradictionEvidence: null,
      weight: 1.4,
      notes: [],
    };
    const contradictedAnchor = {
      ...absentAnchor,
      id: "a2",
      kind: "metric_state" as const,
      status: "contradicted" as const,
      contradictionEvidence: "synthetic contradiction evidence",
    };
    const items: SreBenchmarkItem[] = [
      item({
        case: { ...baseCase, id: "strong-grounded", label: "strong_specific", split: "exploratory" },
        report: { ...item({}).report, grounding: { ...item({}).report.grounding!, score: 0.9 }, subscores: { ...item({}).report.subscores!, contextGrounding: 0.9 } },
      }),
      item({
        case: { ...baseCase, id: "weak-vague", label: "vague", split: "lockbox", expectedRecommendationBands: ["reconsider"] },
        report: { ...item({}).report, grounding: { ...item({}).report.grounding!, score: 0.3 }, subscores: { ...item({}).report.subscores!, contextGrounding: 0.3 } },
      }),
      item({
        case: { ...baseCase, id: "unsupported", label: "specific_but_unsupported", split: "lockbox", expectedRecommendationBands: ["reconsider"] },
        report: {
          ...item({}).report,
          grounding: { score: 0.2, anchors: [absentAnchor], summary: { present: 0, absent: 1, contradicted: 0, loadBearing: 1 }, notes: [] },
          subscores: { ...item({}).report.subscores!, contextGrounding: 0.2 },
        },
      }),
      item({
        case: { ...baseCase, id: "mismatch", label: "grounded_action_mismatch", split: "exploratory", expectedRecommendationBands: ["reconsider"] },
        report: {
          ...item({}).report,
          grounding: { score: 0.4, anchors: [contradictedAnchor], summary: { present: 0, absent: 0, contradicted: 1, loadBearing: 1 }, notes: [] },
          subscores: { ...item({}).report.subscores!, contextGrounding: 0.4 },
        },
      }),
    ];

    const metrics = computeSreBenchmarkMetrics(items, { shuffledMeanOverallSignal: 0.4, shuffledMeanContextGrounding: 0.22 });

    expect(metrics.meanContextGrounding).toBeCloseTo(0.45, 4);
    expect(metrics.strongWeakGroundingSeparation).toBeCloseTo(0.6, 4);
    expect(metrics.diagnosticMeanContextGrounding).toBeCloseTo(0.3, 4);
    expect(metrics.specificButUnsupportedMeanContextGrounding).toBeCloseTo(0.2, 4);
    expect(metrics.groundingFailureRateDiagnostic).toBe(1);
    expect(metrics.contradictedAnchorRateDiagnostic).toBeCloseTo(0.5, 4);
    expect(metrics.controlComparisons.shuffledMeanContextGrounding).toBe(0.22);
    expect(metrics.controlComparisons.shuffledContextGroundingDropFromOriginal).toBeCloseTo(0.23, 4);
    expect(metrics.byLabel.specific_but_unsupported?.meanContextGrounding).toBe(0.2);
    expect(metrics.bySplit.exploratory?.meanContextGrounding).toBeCloseTo(0.65, 4);
    expect(metrics.bySplit.lockbox?.meanContextGrounding).toBeCloseTo(0.25, 4);
    expect(metrics.bySplit.lockbox?.groundingFailureRateDiagnostic).toBe(1);
  });

  it("exposes split-specific grounding gates and saved-plan threshold checks", () => {
    const exploratoryUnsupported = item({
      case: {
        ...baseCase,
        id: "exploratory-unsupported-proceed",
        label: "specific_but_unsupported",
        split: "exploratory",
        expectedRecommendationBands: ["reconsider"],
      },
      report: {
        ...item({}).report,
        recommendation: "proceed",
        overallSignal: 0.62,
        grounding: { ...item({}).report.grounding!, score: 0.3 },
        subscores: { ...item({}).report.subscores!, contextGrounding: 0.3 },
      },
    });
    const items: SreBenchmarkItem[] = [
      item({
        case: { ...baseCase, id: "exploratory-strong-ok", label: "strong_specific", split: "exploratory" },
        report: {
          ...item({}).report,
          recommendation: "proceed",
          overallSignal: 0.88,
          grounding: { ...item({}).report.grounding!, score: 0.9 },
          subscores: { ...item({}).report.subscores!, contextGrounding: 0.9 },
        },
      }),
      item({
        case: { ...baseCase, id: "exploratory-strong-false-reconsider", label: "strong_specific", split: "exploratory" },
        report: {
          ...item({}).report,
          recommendation: "reconsider",
          overallSignal: 0.67,
          grounding: { ...item({}).report.grounding!, score: 0.8 },
          subscores: { ...item({}).report.subscores!, contextGrounding: 0.8 },
        },
      }),
      exploratoryUnsupported,
      item({
        case: {
          ...baseCase,
          id: "exploratory-mismatch",
          label: "grounded_action_mismatch",
          split: "exploratory",
          expectedRecommendationBands: ["reconsider"],
        },
        report: {
          ...item({}).report,
          recommendation: "reconsider",
          overallSignal: 0.38,
          grounding: { ...item({}).report.grounding!, score: 0.2 },
          subscores: { ...item({}).report.subscores!, contextGrounding: 0.2 },
        },
      }),
      item({
        case: {
          ...baseCase,
          id: "lockbox-unsupported-proceed",
          label: "specific_but_unsupported",
          split: "lockbox",
          expectedRecommendationBands: ["reconsider"],
        },
        report: {
          ...item({}).report,
          recommendation: "proceed",
          overallSignal: 0.64,
          grounding: { ...item({}).report.grounding!, score: 0.7 },
          subscores: { ...item({}).report.subscores!, contextGrounding: 0.7 },
        },
      }),
      item({
        case: { ...baseCase, id: "lockbox-weak", label: "vague", split: "lockbox", expectedRecommendationBands: ["reconsider"] },
        report: {
          ...item({}).report,
          recommendation: "proceed_with_caveats",
          overallSignal: 0.44,
          grounding: { ...item({}).report.grounding!, score: 0.45 },
          subscores: { ...item({}).report.subscores!, contextGrounding: 0.45 },
        },
      }),
    ];

    const metrics = computeSreBenchmarkMetrics(items, { shuffledMeanOverallSignal: 0.4, shuffledMeanContextGrounding: 0.1 });

    expect(metrics.bySplit.exploratory?.permissiveRateWeak).toBeCloseTo(1 / 2, 4);
    expect(metrics.bySplit.exploratory?.falseReconsiderRateStrong).toBeCloseTo(0.5, 4);
    expect(metrics.bySplit.exploratory?.specificButUnsupportedProceedCount).toBe(1);
    expect(metrics.bySplit.exploratory?.specificButUnsupportedProceedRate).toBe(1);
    expect(metrics.bySplit.exploratory?.diagnosticStrongGroundingGap).toBeCloseTo(0.6, 4);
    expect(metrics.bySplit.exploratory?.unsupportedMeanContextGrounding).toBe(0.3);
    expect(metrics.bySplit.lockbox?.specificButUnsupportedProceedCount).toBe(1);
    expect(metrics.bySplit.lockbox?.unsupportedMeanContextGrounding).toBe(0.7);

    expect(metrics.thresholdChecks.falseProceedRateWeak.threshold).toBe("<= 0.10");
    expect(metrics.thresholdChecks.falseReconsiderRateStrong.threshold).toBe("<= 0.17");
    expect(metrics.thresholdChecks.permissiveRateWeak.threshold).toBe("<= 0.45");
    expect(metrics.thresholdChecks.shuffledContextGroundingDrop.threshold).toBe(">= 0.20");
    expect(metrics.thresholdChecks.lockboxSpecificButUnsupportedZeroProceed.actual).toBe(1);
    expect(metrics.thresholdChecks.lockboxSpecificButUnsupportedZeroProceed.passed).toBe(false);
    expect(metrics.thresholdChecks.exploratorySpecificButUnsupportedZeroProceed.actual).toBe(1);
    expect(metrics.thresholdChecks.exploratoryFalseReconsiderRateStrong.actual).toBe(0.5);
    expect(metrics.thresholdChecks.exploratoryDiagnosticStrongGroundingGap.actual).toBeCloseTo(0.6, 4);
    expect(metrics.thresholdChecks.lockboxRankAgreement.threshold).toBe(">= 0.55");
    expect(metrics.thresholdChecks.lockboxUnsupportedGroundingLeakageWarning.actual).toBeCloseTo(0.4, 4);
    expect(metrics.thresholdChecks.lockboxUnsupportedGroundingLeakageWarning.passed).toBe(false);
  });

  it("exposes confidence intervals, confusion matrices, review-needed rates, and threshold governance metadata", () => {
    const items: SreBenchmarkItem[] = [
      item({ case: { ...baseCase, id: "strong-1", label: "strong_specific", split: "exploratory" }, report: { ...item({}).report, recommendation: "proceed", overallSignal: 0.9, confidence: 0.9 } }),
      item({
        case: { ...baseCase, id: "strong-2", label: "strong_specific", split: "lockbox" },
        report: {
          ...item({}).report,
          recommendation: "reconsider",
          overallSignal: 0.5,
          confidence: 0.45,
          readiness: { ...item({}).report.readiness, reviewNeeded: true, reviewReasons: ["uncalibrated_internal_alpha", "specificity_margin_unreliable", "weak_context_grounding"] },
        },
        expectedBandMatched: false,
        expectedBandDistance: 1,
      }),
      item({
        case: { ...baseCase, id: "weak-1", label: "vague", split: "exploratory", expectedRecommendationBands: ["reconsider"] },
        report: {
          ...item({}).report,
          recommendation: "proceed",
          overallSignal: 0.75,
          support: { ...item({}).report.support, specificityMargin: 0.04 },
          confidence: 0.42,
          readiness: { ...item({}).report.readiness, reviewNeeded: true, reviewReasons: ["uncalibrated_internal_alpha", "specificity_margin_unreliable", "low_overall_signal"] },
        },
        expectedBandMatched: false,
        expectedBandDistance: 2,
      }),
      item({
        case: { ...baseCase, id: "weak-2", label: "policy_violation", split: "lockbox", expectedRecommendationBands: ["escalate"], policyExpectations: { allowProceed: false, expectedFindingCodes: ["requires_human_approval"], requiresHumanApproval: true } },
        report: {
          ...item({}).report,
          recommendation: "escalate",
          overallSignal: 0.2,
          policyFindings: [{ code: "requires_human_approval", severity: "blocker", message: "unit policy finding" }],
          readiness: { ...item({}).report.readiness, reviewNeeded: true, reviewReasons: ["uncalibrated_internal_alpha", "specificity_margin_unreliable", "policy_blocker", "low_overall_signal"] },
        },
        expectedBandMatched: true,
        expectedBandDistance: 0,
      }),
    ];

    const metrics = computeSreBenchmarkMetrics(items, { shuffledMeanOverallSignal: 0.35, shuffledMeanContextGrounding: 0.25 });

    expect(metrics.rateIntervals.falseProceedRateWeak).toMatchObject({ method: "wilson_95", n: 2, k: 1, estimate: 0.5 });
    expect(metrics.rateIntervals.falseProceedRateWeak.lower).toBeCloseTo(0.0945, 3);
    expect(metrics.rateIntervals.falseProceedRateWeak.upper).toBeCloseTo(0.9055, 3);
    expect(metrics.rateIntervals.falseReconsiderRateStrong).toMatchObject({ method: "wilson_95", n: 2, k: 1, estimate: 0.5 });
    expect(metrics.bootstrapIntervals.strongWeakOverallSeparation.method).toBe("fixed_seed_bootstrap_95");
    expect(metrics.bootstrapIntervals.strongWeakOverallSeparation.seed).toBe(20260503);
    expect(metrics.bootstrapIntervals.strongWeakOverallSeparation.n).toBe(4);

    expect(metrics.recommendationConfusion.rows.proceed.proceed).toBe(1);
    expect(metrics.recommendationConfusion.rows.proceed.reconsider).toBe(1);
    expect(metrics.recommendationConfusion.rows.reconsider.proceed).toBe(1);
    expect(metrics.recommendationConfusion.total).toBe(4);
    expect(metrics.bySplit.exploratory?.recommendationConfusion.total).toBe(2);
    expect(metrics.bySplit.lockbox?.recommendationConfusion.total).toBe(2);

    expect(metrics.operatorReviewRequiredRate).toBe(1);
    expect(metrics.reviewNeededRate).toBeCloseTo(0.75, 4);
    expect(metrics.bySplit.exploratory?.reviewNeededRate).toBeCloseTo(0.5, 4);
    expect(metrics.bySplit.lockbox?.reviewNeededRate).toBe(1);
    expect(metrics.byLabel.vague?.reviewNeededRate).toBe(1);
    expect(metrics.failureTaxonomy.counts.lowMargin).toBe(1);
    expect(metrics.failureTaxonomy.counts.policyFinding).toBe(1);
    expect(metrics.failureTaxonomy.counts.lowConfidence).toBe(2);

    expect(metrics.thresholdChecks.falseReconsiderRateStrong).toMatchObject({
      threshold: "<= 0.17",
      passed: false,
      effectiveN: 2,
      severity: "diagnostic",
    });
    expect(metrics.thresholdChecks.falseReconsiderRateStrong.confidenceInterval).toMatchObject({ method: "wilson_95", n: 2, k: 1 });
    expect(metrics.thresholdChecks.falseReconsiderRateStrong.interpretation).toContain("underpowered");
  });

  it("renders context-grounding metrics with signal-not-oracle caveats", () => {
    const result = {
      calibration: "uncalibrated_internal_alpha" as const,
      productSemantics:
        "Uncalibrated internal-alpha rationale-action specificity signal with deterministic context-grounding proxy; not objective truth validation, hidden chain-of-thought faithfulness detection, or a production allow/deny gate.",
      generatedAt: "2026-05-02T00:00:00.000Z",
      inputCaseCount: 1,
      governance: unitGovernance,
      metrics: computeSreBenchmarkMetrics([item({})], { shuffledMeanContextGrounding: 0.5 }),
      items: [item({})],
      shuffledControlItems: [],
    };

    const markdown = renderSreBenchmarkMarkdown(result);
    expect(markdown).toContain("context-grounding");
    expect(markdown).toContain("Mean context grounding");
    expect(markdown).toContain("Shuffled-rationale context-grounding drop");
    expect(markdown).toContain("Review-needed rate");
    expect(markdown).toContain("Confidence/Uncertainty Intervals");
    expect(markdown).toContain("Failure Taxonomy");
    expect(markdown).toContain("Confusion Matrix");
    expect(markdown).toContain("severity=");
    expect(markdown).toContain("uncalibrated_internal_alpha");
    expect(markdown).toContain("rationale-action specificity");
    expect(markdown).toContain("not objective truth validation");
    expect(markdown).toContain("non-causal");
    expect(markdown).toContain("non-authoritative");
    expect(markdown).toContain("not a substitute for operator review");
    expect(markdown).not.toMatch(/truth oracle|verifies truth|faithfulness detector|safe to proceed|production gate/i);
  });

  it("renders CLI stdout summary with review-needed, permissive weak, and failed-threshold visibility", () => {
    const result = {
      calibration: "uncalibrated_internal_alpha" as const,
      productSemantics:
        "Uncalibrated internal-alpha rationale-action specificity signal with deterministic context-grounding proxy; not objective truth validation, hidden chain-of-thought faithfulness detection, or a production allow/deny gate.",
      generatedAt: "2026-05-02T00:00:00.000Z",
      inputCaseCount: 1,
      governance: unitGovernance,
      metrics: computeSreBenchmarkMetrics([
        item({}),
        item({
          case: { ...baseCase, id: "weak", label: "vague", expectedRecommendationBands: ["reconsider"] },
          report: {
            ...item({}).report,
            recommendation: "proceed_with_caveats",
            readiness: { ...item({}).report.readiness, reviewNeeded: true },
          },
        }),
      ]),
      items: [item({})],
      shuffledControlItems: [],
    };

    const stdout = renderSreBenchmarkStdoutSummary(result, {
      jsonPath: "benchmark-output/sre/unit/result.json",
      markdownPath: "benchmark-output/sre/unit/summary.md",
    });

    expect(stdout).toContain("Permissive weak rate:");
    expect(stdout).toContain("Review-needed rate:");
    expect(stdout).toContain("Failed threshold checks:");
    expect(stdout).toContain("JSON: benchmark-output/sre/unit/result.json");
    expect(stdout).toContain("Markdown: benchmark-output/sre/unit/summary.md");
  });

  it("writes sanitized review JSON without raw fixture prose or grounding evidence", async () => {
    const rawAnchor = {
      id: "raw-a1",
      kind: "mechanism" as const,
      text: "invented queue starvation",
      normalizedText: "invented queue starvation",
      loadBearing: true,
      status: "contradicted" as const,
      contextEvidence: "queue depth is normal in the supplied fixture prose",
      contradictionEvidence: "synthetic contradiction evidence",
      weight: 1.4,
      notes: ["raw note with fixture-only wording"],
    };
    const result = {
      calibration: "uncalibrated_internal_alpha" as const,
      productSemantics:
        "Uncalibrated internal-alpha rationale-action specificity signal with deterministic context-grounding proxy; not objective truth validation, hidden reasoning faithfulness detection, or a production allow/deny gate.",
      generatedAt: "2026-05-02T00:00:00.000Z",
      inputCaseCount: 1,
      governance: unitGovernance,
      metrics: computeSreBenchmarkMetrics([item({})]),
      items: [
        item({
          report: {
            ...item({}).report,
            grounding: {
              score: 0.2,
              anchors: [rawAnchor],
              summary: { present: 0, absent: 0, contradicted: 1, loadBearing: 1 },
              notes: ["raw grounding note should not be in review JSON"],
            },
          },
        }),
      ],
      shuffledControlItems: [],
    };
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "elenchus-sre-benchmark-"));

    try {
      const outputs = await writeSreBenchmarkOutputs(result, outputDir);
      const json = await readFile(outputs.jsonPath, "utf8");
      const parsed = JSON.parse(json);

      expect(json).not.toContain(baseCase.context);
      expect(json).not.toContain(baseCase.rationale);
      expect(json).not.toContain(rawAnchor.text);
      expect(json).not.toContain(rawAnchor.contextEvidence);
      expect(json).not.toContain(rawAnchor.contradictionEvidence);
      expect(parsed.items[0].case).not.toHaveProperty("context");
      expect(parsed.items[0].case).not.toHaveProperty("rationale");
      expect(parsed.items[0].report).not.toHaveProperty("toulmin");
      expect(parsed.items[0].report.grounding.anchors[0]).not.toHaveProperty("text");
      expect(parsed.sanitization).toMatchObject({ rawFixtureProseIncluded: false, rawGroundingEvidenceIncluded: false });
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("runs cases without leaking label-side benchmark fields into the evaluator", async () => {
    const seenKeys: string[][] = [];
    const result = await runSreBenchmark([baseCase], {
      evaluator: async (request) => {
        seenKeys.push(Object.keys(request).sort());
        return item({}).report;
      },
      runShuffledControl: false,
    });

    expect(seenKeys).toEqual([["context", "domain", "metadata", "proposedAction", "rationale", "traceId"]]);
    expect(result.governance).toMatchObject({
      benchmarkSchemaVersion: "sre-benchmark-v2-alpha-2026-05-03",
      fixtureCaseManifestHashAlgorithm: "sha256_non_prose_case_manifest",
      fixtureFullContentHashAlgorithm: "sha256_canonical_full_case_content",
      lockboxProcess: {
        rawLockboxContextOrRationaleInspectedForThisRun: null,
        rulesFrozenBeforeLockboxEvaluation: null,
        attestationSource: "not_recorded",
        benchmarkOutputCommitPolicy: "generated_outputs_ignored_and_uncommitted",
      },
    });
    expect(result.governance.lockboxProcess.attestation).toContain("not autonomous approval");
    expect(result.governance.evaluatorFingerprints).toEqual(["unit-fingerprint"]);
    expect(result.governance.fixtureCaseManifestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.governance.fixtureFullContentFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("renders markdown with caveats and without oracle claims", () => {
    const result = {
      calibration: "uncalibrated_internal_alpha" as const,
      productSemantics:
        "Uncalibrated internal-alpha rationale-action specificity signal; not objective truth validation, hidden chain-of-thought faithfulness detection, or a production allow/deny gate.",
      generatedAt: "2026-05-02T00:00:00.000Z",
      inputCaseCount: 1,
      governance: unitGovernance,
      metrics: computeSreBenchmarkMetrics([item({})]),
      items: [item({})],
      shuffledControlItems: [],
    };

    const markdown = renderSreBenchmarkMarkdown(result);
    expect(markdown).toContain("uncalibrated_internal_alpha");
    expect(markdown).toContain("rationale-action specificity");
    expect(markdown).toContain("not objective truth validation");
    expect(markdown).not.toContain("truth oracle");
  });
});
