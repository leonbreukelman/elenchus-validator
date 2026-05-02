import { describe, expect, it } from "vitest";
import {
  buildErrorReport,
  buildReport,
  isTerminalEvaluationStatus,
} from "../../src/evaluation/report.js";
import {
  extractToulminArgument,
  scoreLinguisticSpecificity,
} from "../../src/evaluation/toulmin.js";
import { generateNearNeighborAlternatives } from "../../src/evaluation/saboteur.js";
import { evaluateWithDeterministicProvider } from "../../src/evaluation/evaluator.js";
import { validateSupportAssessment } from "../../src/evaluation/providers.js";
import type { EvaluationRequestV2 } from "../../src/evaluation/types.js";

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
      },
      policyFindings: [],
      auditRef: "audit/trace-v2-types-001.jsonl",
    });

    expect(report.status).toBe("complete");
    expect(report.overallSignal).toBeGreaterThan(0);
    expect(report.calibration).toBe("uncalibrated_internal_alpha");
    expect(report.recommendation).toBe("proceed");
    expect(report.productSemantics).toContain("rationale-action specificity");
    expect(report.productSemantics).not.toContain("truth oracle");
  });

  it("builds error reports without pretending score zero is a judgment", () => {
    const report = buildErrorReport(request, "provider returned malformed JSON");

    expect(report.status).toBe("error");
    expect(report.overallSignal).toBeNull();
    expect(report.recommendation).toBe("abort_signal_only");
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
    expect(report.alternatives.length).toBeGreaterThan(0);
    expect(report.providerMetadata.provider).toBe("deterministic-local");
  });
});
