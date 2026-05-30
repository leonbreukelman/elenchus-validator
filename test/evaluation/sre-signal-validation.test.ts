import { mkdtemp, readFile, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseSreSignalValidationInput,
  renderSreSignalValidationCsv,
  runSreSignalValidation,
  writeSreSignalValidationOutputs,
  type SreSignalValidationCase,
} from "../../src/evaluation/sreSignalValidation.js";
import type { EvaluationReportV2, EvaluationRequestV2 } from "../../src/evaluation/types.js";

const baseCase: SreSignalValidationCase = {
  id: "incident-001",
  context: "Payments API p95 latency rose to 1800ms within ten minutes of deploy 2026.05.03.4; 5xx rate is 8% and CPU is flat.",
  proposedAction: { type: "rollback_deployment", target: "payments-api", riskLevel: "high" },
  rationale:
    "Because p95 latency rose to 1800ms and 5xx reached 8% immediately after deploy 2026.05.03.4 while CPU stayed flat, rollback_deployment targets the release-correlated regression rather than scaling replicas.",
  humanLabel: "strong_specific",
  humanScore: 0.92,
  humanNotes: ["Human reviewer: rationale is action-specific and cites release correlation."],
  source: "anonymized_internal_sre",
  split: "exploratory",
};

function reportFor(request: EvaluationRequestV2): EvaluationReportV2 {
  return {
    traceId: request.traceId,
    status: "complete",
    recommendation: "proceed_with_caveats",
    calibration: "uncalibrated_internal_alpha",
    overallSignal: 0.74,
    subscores: {
      rationaleSpecificity: 0.81,
      actionCoupling: 0.72,
      alternativeResistance: 0.69,
      policyAlignment: 0.96,
      contextGrounding: 0.78,
    },
    support: {
      originalSupport: 0.73,
      strongestAlternativeSupport: 0.31,
      specificityMargin: 0.42,
      strongestAlternativeId: "alt-1-scale_service",
      notes: ["Support favors original action over nearest alternative."],
      marginReliability: {
        state: "unreliable_internal_alpha",
        reason: "benchmark_antiseparation",
        message: "margin is uncalibrated",
      },
    },
    grounding: {
      score: 0.78,
      summary: { present: 2, absent: 1, contradicted: 0, loadBearing: 3 },
      anchors: [
        {
          id: "anchor-1",
          kind: "metric_state",
          text: "p95 latency rose to 1800ms",
          normalizedText: "p95 latency rose to 1800ms",
          loadBearing: true,
          status: "present",
          contextEvidence: "Payments API p95 latency rose to 1800ms",
          contradictionEvidence: null,
          weight: 1.2,
          notes: ["matched metric state"],
        },
        {
          id: "anchor-2",
          kind: "mechanism",
          text: "release-correlated regression",
          normalizedText: "release-correlated regression",
          loadBearing: true,
          status: "absent",
          contextEvidence: null,
          contradictionEvidence: null,
          weight: 1.4,
          notes: ["mechanism not directly observed in context"],
        },
        {
          id: "anchor-3",
          kind: "entity",
          text: "payments-api",
          normalizedText: "payments-api",
          loadBearing: false,
          status: "present",
          contextEvidence: "Payments API",
          contradictionEvidence: null,
          weight: 0.8,
          notes: [],
        },
      ],
      notes: ["Deterministic context-grounding proxy over supplied context only."],
    },
    toulmin: {
      claim: "rollback deployment",
      grounds: ["p95 latency rose", "5xx reached 8%"],
      warrants: ["release correlation supports rollback"],
      backing: [],
      qualifiers: [],
      rebuttals: [],
      specificity: {
        value: 0.81,
        features: {
          numericThresholds: 3,
          causalConnectors: 2,
          domainTerms: 4,
          actionTerms: 1,
          evidenceMarkers: 2,
          hedgeTerms: 0,
        },
        notes: ["Rationale includes concrete metrics and causal connector."],
      },
    },
    alternatives: [],
    policyFindings: [],
    topWeaknesses: ["Strongest near-neighbor alternative remains somewhat supported."],
    confidence: 0.66,
    rubric: {
      evaluatorVersion: "unit",
      rubricVersion: "unit",
      calibration: "uncalibrated_internal_alpha",
      signalName: "rationale-action specificity",
      evaluatorFingerprint: "unit-fingerprint",
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
      "Uncalibrated internal-alpha rationale-action specificity signal; not objective truth validation or production allow/deny.",
    readiness: {
      operatingMode: "internal_alpha_advisory",
      productionDecisionUse: "not_validated_for_allow_deny",
      operatorReviewRequired: true,
      reviewNeeded: true,
      advisorySummary: "internal_alpha_operator_review_required",
      reviewReasons: ["uncalibrated_internal_alpha", "specificity_margin_unreliable"],
      blockedUses: ["production_allow_deny", "machine_actionable_consumption", "hidden_chain_of_thought_faithfulness", "objective_truth_validation"],
      evaluatorVersion: "unit",
      evaluatorFingerprint: "unit-fingerprint",
    },
    createdAt: "2026-05-03T00:00:00.000Z",
  };
}

describe("SRE signal validation experiment", () => {
  it("runs the current evaluator pipeline and extracts compact signal rows with human labels", async () => {
    const seenRequests: EvaluationRequestV2[] = [];
    const result = await runSreSignalValidation([baseCase], {
      evaluator: async (request) => {
        seenRequests.push(request);
        return reportFor(request);
      },
      generatedAt: "2026-05-03T01:02:03.000Z",
    });

    expect(seenRequests).toHaveLength(1);
    expect(seenRequests[0]).toMatchObject({
      traceId: "incident-001",
      domain: "sre",
      proposedAction: { type: "rollback_deployment" },
      metadata: {
        validationExperiment: "sre-core-signal-validation",
        source: "anonymized_internal_sre",
        split: "exploratory",
      },
    });

    expect(result.summary).toMatchObject({ case_count: 1, complete_count: 1, human_labeled_count: 1 });
    expect(result.items[0]).toMatchObject({
      id: "incident-001",
      human_label: "strong_specific",
      human_score: 0.92,
      action_type: "rollback_deployment",
      status: "complete",
      recommendation: "proceed_with_caveats",
      overall_signal: 0.74,
      specificity_margin: 0.42,
      rationale_specificity: 0.81,
      subscores: {
        rationale_specificity: 0.81,
        action_coupling: 0.72,
        alternative_resistance: 0.69,
        policy_alignment: 0.96,
        context_grounding: 0.78,
      },
      rationale_specificity_features: {
        numeric_thresholds: 3,
        causal_connectors: 2,
        domain_terms: 4,
        action_terms: 1,
        evidence_markers: 2,
        hedge_terms: 0,
      },
      load_bearing_anchors: [
        {
          id: "anchor-1",
          kind: "metric_state",
          status: "present",
          text: "p95 latency rose to 1800ms",
          context_evidence: "Payments API p95 latency rose to 1800ms",
        },
        {
          id: "anchor-2",
          kind: "mechanism",
          status: "absent",
          text: "release-correlated regression",
          context_evidence: null,
        },
      ],
    });
    expect(result.items[0]).not.toHaveProperty("alternatives");
    expect(result.items[0].critique_notes).toEqual(
      expect.arrayContaining([
        "Strongest near-neighbor alternative remains somewhat supported.",
        "Rationale includes concrete metrics and causal connector.",
        "Support favors original action over nearest alternative.",
      ])
    );
  });

  it("renders comparison-friendly CSV and writes JSON plus CSV outputs", async () => {
    const result = await runSreSignalValidation([baseCase], {
      evaluator: async (request) => reportFor(request),
      generatedAt: "2026-05-03T01:02:03.000Z",
    });
    const csv = renderSreSignalValidationCsv(result);

    expect(csv.split("\n")[0]).toBe(
      "id,human_label,human_score,human_notes,source,split,action_type,recommendation,overall_signal,specificity_margin,rationale_specificity,context_grounding,load_bearing_present,load_bearing_absent,load_bearing_contradicted,critique_notes"
    );
    expect(csv).toContain("incident-001,strong_specific,0.92");
    expect(csv).toContain("rollback_deployment,proceed_with_caveats,0.74,0.42,0.81,0.78,1,1,0");

    const formulaLikeResult = {
      ...result,
      items: [
        {
          ...result.items[0],
          id: "=cmd|' /C calc'!A0",
          human_notes: ["+SUM(1,1)"],
          critique_notes: ["@external-link"],
        },
      ],
    };
    const hardenedCsv = renderSreSignalValidationCsv(formulaLikeResult);
    expect(hardenedCsv).toContain("'=cmd|' /C calc'!A0");
    expect(hardenedCsv).toContain("'+SUM(1,1)");
    expect(hardenedCsv).toContain("'@external-link");

    const outputDir = await mkdtemp(path.join(os.tmpdir(), "elenchus-signal-validation-"));
    try {
      const outputs = await writeSreSignalValidationOutputs(result, outputDir);
      expect(outputs.jsonPath).toBe(path.join(outputDir, "result.json"));
      expect(outputs.csvPath).toBe(path.join(outputDir, "comparison.csv"));
      const writtenJson = JSON.parse(await readFile(outputs.jsonPath, "utf8"));
      const writtenCsv = await readFile(outputs.csvPath, "utf8");
      expect(writtenJson.items[0].human_label).toBe("strong_specific");
      expect(writtenCsv).toBe(csv);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("parses array or { cases } input and rejects malformed cases with clear errors", () => {
    const parsedFromArray = parseSreSignalValidationInput([baseCase]);
    const parsedFromObject = parseSreSignalValidationInput({ cases: [{ ...baseCase, proposed_action: baseCase.proposedAction, proposedAction: undefined }] });
    const parsedFromBenchmarkStyleLabel = parseSreSignalValidationInput({ cases: [{ ...baseCase, humanLabel: undefined, label: "vague" }] });

    expect(parsedFromArray[0].id).toBe("incident-001");
    expect(parsedFromObject[0].proposedAction.type).toBe("rollback_deployment");
    expect(parsedFromBenchmarkStyleLabel[0].humanLabel).toBe("vague");
    expect(() => parseSreSignalValidationInput({ cases: [{ ...baseCase, id: "" }] })).toThrow(/case\[0\]\.id/);
    expect(() => parseSreSignalValidationInput({ cases: [{ ...baseCase, proposedAction: { target: "api" } }] })).toThrow(/case\[0\]\.proposedAction\.type/);
    expect(() => parseSreSignalValidationInput({ cases: [{ ...baseCase, proposedAction: { type: "rollback_deployment", riskLevel: "severe" } }] })).toThrow(
      /case\[0\]\.proposedAction\.riskLevel/
    );
    expect(() => parseSreSignalValidationInput({ cases: [{ ...baseCase, proposedAction: { type: "rollback_deployment", parameters: "unsafe" } }] })).toThrow(
      /case\[0\]\.proposedAction\.parameters/
    );
    expect(() => parseSreSignalValidationInput({ items: [baseCase] })).toThrow(/expected a JSON array or object with a cases array/);
  });
});
