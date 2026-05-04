import { evaluateSrePolicy } from "../domain/sre.js";
import { FileAuditLogger } from "./audit.js";
import { actionTerms } from "./actions.js";
import { sha256Hex } from "../util/hash.js";
import { buildErrorReport, buildReport } from "./report.js";
import { assessContextGrounding } from "./grounding.js";
import { generateNearNeighborAlternatives } from "./saboteur.js";
import { extractToulminArgument } from "./toulmin.js";
import type { ContextGroundingAssessment, EvaluationReportV2, EvaluationRequestV2, EvaluationSubscores, PolicyFinding, SupportAssessment } from "./types.js";
import { DeterministicEvaluationProvider, type EvaluationProvider } from "./providers.js";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function actionCoupling(request: EvaluationRequestV2): number {
  const text = request.rationale.toLowerCase();
  const parts = actionTerms(request.proposedAction.type);
  const hits = parts.filter((part) => text.includes(part)).length;
  return clamp01(0.35 + hits * 0.18);
}

function auditSafeGrounding(grounding: ContextGroundingAssessment) {
  return {
    score: grounding.score,
    summary: grounding.summary,
    anchors: grounding.anchors.map((anchor) => ({
      id: anchor.id,
      kind: anchor.kind,
      status: anchor.status,
      loadBearing: anchor.loadBearing,
      weight: anchor.weight,
      textHash: sha256Hex(anchor.text),
    })),
  };
}

function auditSafeSupport(support: SupportAssessment) {
  return {
    originalSupport: support.originalSupport,
    strongestAlternativeSupport: support.strongestAlternativeSupport,
    specificityMargin: support.specificityMargin,
    strongestAlternativeId: support.strongestAlternativeId,
    marginReliability: support.marginReliability ?? null,
  };
}

function auditSafePolicyFindings(policyFindings: PolicyFinding[]) {
  return policyFindings.map((finding) => ({
    code: finding.code,
    severity: finding.severity,
  }));
}

function auditSafePayload(request: EvaluationRequestV2, report: EvaluationReportV2) {
  return {
    requestDigest: sha256Hex(JSON.stringify(request)),
    requestSummary: {
      traceId: request.traceId,
      domain: request.domain,
      actionType: request.proposedAction.type,
      actionTarget: request.proposedAction.target ?? null,
      actionRiskLevel: request.proposedAction.riskLevel ?? null,
      contextHash: sha256Hex(request.context),
      rationaleHash: sha256Hex(request.rationale),
      metadataKeys: request.metadata ? Object.keys(request.metadata).sort() : [],
    },
    recommendation: report.recommendation,
    calibration: report.calibration,
    overallSignal: report.overallSignal,
    subscores: report.subscores,
    support: report.support ? auditSafeSupport(report.support) : null,
    grounding: report.grounding ? auditSafeGrounding(report.grounding) : null,
    policyFindings: auditSafePolicyFindings(report.policyFindings),
    readiness: report.readiness,
    rubric: report.rubric,
    providerMetadata: report.providerMetadata,
  };
}

export async function evaluateRequestV2(
  request: EvaluationRequestV2,
  options: { provider?: EvaluationProvider; auditLogger?: FileAuditLogger; signal?: AbortSignal } = {}
): Promise<EvaluationReportV2> {
  if (options.signal?.aborted) {
    return buildErrorReport(request, "caller aborted before evaluation started", "aborted");
  }

  try {
    const provider = options.provider ?? new DeterministicEvaluationProvider();
    const toulmin = extractToulminArgument(request.rationale);
    const alternatives = generateNearNeighborAlternatives(request);
    const support = await provider.assessSupport(request, alternatives, options.signal);
    const policy = request.domain === "sre" ? evaluateSrePolicy(request) : { score: 0.7, findings: [] };
    const grounding = assessContextGrounding(request);
    const subscores: EvaluationSubscores = {
      rationaleSpecificity: toulmin.specificity.value,
      actionCoupling: actionCoupling(request),
      alternativeResistance: clamp01(0.5 + support.specificityMargin / 2),
      policyAlignment: policy.score,
      contextGrounding: grounding.score,
    };

    const report = buildReport({
      request,
      toulmin,
      alternatives,
      support,
      subscores,
      grounding,
      policyFindings: policy.findings,
      providerMetadata: provider.metadata,
    });

    const audit = options.auditLogger
      ? await options.auditLogger.write({
          traceId: request.traceId,
          stage: "complete",
          replay: {
            evaluatorVersion: report.rubric.evaluatorVersion,
            provider: provider.metadata.provider,
            model: provider.metadata.model,
          },
          payload: auditSafePayload(request, report),
        })
      : null;

    return audit ? { ...report, auditRef: audit.path } : report;
  } catch (error) {
    return buildErrorReport(request, error instanceof Error ? error.message : String(error), options.signal?.aborted ? "aborted" : "error");
  }
}

export function evaluateWithDeterministicProvider(request: EvaluationRequestV2): Promise<EvaluationReportV2> {
  return evaluateRequestV2(request, { provider: new DeterministicEvaluationProvider() });
}
