import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { safeAuditTraceId } from "../evaluation/audit.js";
import type { HermesActionReviewResult, SidecarAdvisoryDecision } from "./types.js";

export interface ActionReviewArtifactRefs {
  outputDir: string;
  reportPath: string;
  cardPath: string;
}

export function advisoryExitCode(decision: SidecarAdvisoryDecision): number {
  switch (decision) {
    case "ready_for_operator_review":
      return 0;
    case "revise_or_gather_context":
      return 2;
    case "escalate_to_operator":
      return 3;
    case "evaluation_error":
      return 4;
  }
}

export function defaultActionReviewOutputDir(
  result: Pick<HermesActionReviewResult, "traceId">,
  baseDir = path.join("sidecar-output", "action-review"),
  timestamp = new Date().toISOString().replace(/[:.]/g, "-")
): string {
  return path.join(baseDir, `${safeAuditTraceId(result.traceId)}-${timestamp}`);
}

function formatNumber(value: number | null): string {
  return typeof value === "number" ? value.toFixed(4) : "null";
}

function bulletList(items: string[], fallback: string): string {
  if (items.length === 0) return `  - ${fallback}`;
  return items.map((item) => `  - ${item}`).join("\n");
}

export function renderActionReviewCard(
  result: HermesActionReviewResult,
  options: { reportPath?: string; cardPath?: string } = {}
): string {
  const findingLines = result.advisory.findings.map((finding) => `${finding.severity}: ${finding.code} — ${finding.message}`);
  const lines = [
    "Hermes / Elenchus Action Review",
    "ADVISORY ONLY — HUMAN REVIEW REQUIRED — DO NOT AUTO-EXECUTE",
    "",
    `traceId: ${result.traceId}`,
    `schema: ${result.schemaVersion}`,
    `action: ${result.action.type}`,
    `riskLevel: ${result.action.riskLevel ?? "not_recorded"}`,
    `targetHash: ${result.action.targetHash ?? "not_recorded"}`,
    `parameterKeys: ${result.action.parameterKeys.length > 0 ? result.action.parameterKeys.join(", ") : "none"}`,
    "",
    `evaluationStatus: ${result.evaluation.status}`,
    `elenchusRecommendation: ${result.evaluation.recommendation}`,
    `sidecarEffectiveRecommendation: ${result.evaluation.effectiveRecommendation}`,
    `overallSignal: ${formatNumber(result.evaluation.overallSignal)} (${result.evaluation.calibration})`,
    `confidence: ${formatNumber(result.evaluation.confidence)}`,
    `genericDomainSignalUnreliable: ${result.evaluation.genericDomainSignalUnreliable}`,
    "",
    `advisoryDecision: ${result.advisory.decision}`,
    `humanReviewRequired: ${result.advisory.humanReviewRequired}`,
    `canAutonomouslyExecute: ${result.advisory.canAutonomouslyExecute}`,
    "",
    "findings:",
    bulletList(findingLines, "none"),
    "",
    "reasons:",
    bulletList(result.advisory.reasons, "none"),
    "",
    "nextSteps:",
    bulletList(result.advisory.nextSteps, "operator_review_required"),
    "",
    `readiness.operatorReviewRequired: ${result.readiness.operatorReviewRequired}`,
    `readiness.blockedUses: ${result.readiness.blockedUses.join(", ")}`,
  ];
  if (options.reportPath) lines.push(`reportPath: ${options.reportPath}`);
  if (options.cardPath) lines.push(`cardPath: ${options.cardPath}`);
  lines.push("", "This sidecar emits review signals only. It does not perform the action.");
  return `${lines.join("\n")}\n`;
}

export async function writeActionReviewArtifacts(result: HermesActionReviewResult, outputDir: string): Promise<ActionReviewArtifactRefs> {
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const reportPath = path.join(outputDir, "report.json");
  const cardPath = path.join(outputDir, "card.txt");
  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  const card = renderActionReviewCard(result, { reportPath, cardPath });
  await writeFile(cardPath, card, { encoding: "utf8", mode: 0o600 });
  return { outputDir, reportPath, cardPath };
}
