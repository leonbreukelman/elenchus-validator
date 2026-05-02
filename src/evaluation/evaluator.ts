import { evaluateSrePolicy } from "../domain/sre.js";
import { FileAuditLogger } from "./audit.js";
import { actionTerms } from "./actions.js";
import { sha256Hex } from "../util/hash.js";
import { buildErrorReport, buildReport } from "./report.js";
import { generateNearNeighborAlternatives } from "./saboteur.js";
import { extractToulminArgument } from "./toulmin.js";
import type { EvaluationReportV2, EvaluationRequestV2, EvaluationSubscores } from "./types.js";
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

function auditSafePayload(request: EvaluationRequestV2, support: unknown, subscores: EvaluationSubscores, policyFindings: unknown) {
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
    support,
    subscores,
    policyFindings,
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
    const subscores: EvaluationSubscores = {
      rationaleSpecificity: toulmin.specificity.value,
      actionCoupling: actionCoupling(request),
      alternativeResistance: clamp01(0.5 + support.specificityMargin / 2),
      policyAlignment: policy.score,
    };

    const audit = options.auditLogger
      ? await options.auditLogger.write({
          traceId: request.traceId,
          stage: "complete",
          replay: {
            evaluatorVersion: "v2-alpha-2026-05-01",
            provider: provider.metadata.provider,
          },
          payload: auditSafePayload(request, support, subscores, policy.findings),
        })
      : null;

    return buildReport({
      request,
      toulmin,
      alternatives,
      support,
      subscores,
      policyFindings: policy.findings,
      auditRef: audit?.path ?? null,
      providerMetadata: provider.metadata,
    });
  } catch (error) {
    return buildErrorReport(request, error instanceof Error ? error.message : String(error), options.signal?.aborted ? "aborted" : "error");
  }
}

export function evaluateWithDeterministicProvider(request: EvaluationRequestV2): Promise<EvaluationReportV2> {
  return evaluateRequestV2(request, { provider: new DeterministicEvaluationProvider() });
}
