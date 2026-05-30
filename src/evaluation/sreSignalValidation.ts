import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { evaluateRequestV2 } from "./evaluator.js";
import type {
  EvaluationReportV2,
  EvaluationRequestV2,
  EvaluationStatus,
  EvaluationRecommendation,
  EvaluationSubscores,
  GroundingAnchor,
  SpecificityFeatures,
  TypedAction,
} from "./types.js";

export const SRE_SIGNAL_VALIDATION_SCHEMA_VERSION = "sre-core-signal-validation-v0";

export interface SreSignalValidationCase {
  id: string;
  context: string;
  proposedAction: TypedAction;
  rationale: string;
  humanLabel?: string;
  humanScore?: number;
  humanNotes?: string[];
  source?: string;
  split?: string;
  metadata?: Record<string, unknown>;
}

export interface SreSignalValidationSubscores {
  rationale_specificity: number;
  action_coupling: number;
  alternative_resistance: number;
  policy_alignment: number;
  context_grounding: number;
}

export interface SreSignalValidationSpecificityFeatures {
  numeric_thresholds: number;
  causal_connectors: number;
  domain_terms: number;
  action_terms: number;
  evidence_markers: number;
  hedge_terms: number;
}

export interface SreSignalValidationLoadBearingAnchor {
  id: string;
  kind: GroundingAnchor["kind"];
  status: GroundingAnchor["status"];
  load_bearing: true;
  text: string;
  normalized_text: string;
  context_evidence: string | null;
  contradiction_evidence: string | null;
  weight: number;
  notes: string[];
}

export interface SreSignalValidationItem {
  id: string;
  human_label: string | null;
  human_score: number | null;
  human_notes: string[];
  source: string | null;
  split: string | null;
  action_type: string;
  action_target: string | null;
  status: EvaluationStatus;
  recommendation: EvaluationRecommendation;
  calibration: EvaluationReportV2["calibration"];
  overall_signal: number | null;
  specificity_margin: number | null;
  rationale_specificity: number | null;
  subscores: SreSignalValidationSubscores | null;
  rationale_specificity_features: SreSignalValidationSpecificityFeatures | null;
  load_bearing_anchors: SreSignalValidationLoadBearingAnchor[];
  grounding_summary: {
    present: number;
    absent: number;
    contradicted: number;
    load_bearing: number;
  } | null;
  critique_notes: string[];
  provider: {
    provider: string;
    model: string;
    deterministic: boolean;
  };
  evaluator: {
    version: string;
    rubric_version: string;
    fingerprint: string | null;
  };
  blocked_uses: string[];
  product_semantics: string;
}

export interface SreSignalValidationLabelSummary {
  case_count: number;
  mean_overall_signal: number | null;
  mean_specificity_margin: number | null;
  mean_rationale_specificity: number | null;
  mean_context_grounding: number | null;
}

export interface SreSignalValidationSummary {
  case_count: number;
  complete_count: number;
  human_labeled_count: number;
  mean_overall_signal: number | null;
  mean_specificity_margin: number | null;
  mean_rationale_specificity: number | null;
  mean_context_grounding: number | null;
  by_human_label: Record<string, SreSignalValidationLabelSummary>;
}

export interface SreSignalValidationResult {
  schema_version: typeof SRE_SIGNAL_VALIDATION_SCHEMA_VERSION;
  signal_name: "rationale-action specificity";
  generated_at: string;
  calibration: "uncalibrated_internal_alpha";
  purpose: string;
  summary: SreSignalValidationSummary;
  items: SreSignalValidationItem[];
}

export interface SreSignalValidationRunOptions {
  evaluator?: (request: EvaluationRequestV2) => Promise<EvaluationReportV2>;
  generatedAt?: string;
}

export interface SreSignalValidationOutputPaths {
  jsonPath: string;
  csvPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string when supplied`);
  return value;
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be a finite number when supplied`);
  return value;
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${field} must be an array of strings when supplied`);
  }
  return value;
}

function optionalRecord(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new Error(`${field} must be an object when supplied`);
  return value;
}

function rawCasesFromInput(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.cases)) return value.cases;
  throw new Error("expected a JSON array or object with a cases array");
}

const VALID_RISK_LEVELS = new Set<string>(["low", "medium", "high", "critical"]);

function parseTypedAction(rawAction: Record<string, unknown>, prefix: string): TypedAction {
  if (!nonEmptyString(rawAction.type)) throw new Error(`${prefix}.type must be a non-empty string`);
  const type = rawAction.type.trim();
  const target = optionalString(rawAction.target, `${prefix}.target`);
  const expectedEffect = optionalString(rawAction.expectedEffect, `${prefix}.expectedEffect`);
  const parameters = optionalRecord(rawAction.parameters, `${prefix}.parameters`);
  const riskLevel = rawAction.riskLevel;
  if (riskLevel !== undefined && riskLevel !== null) {
    if (typeof riskLevel !== "string" || !VALID_RISK_LEVELS.has(riskLevel as TypedAction["riskLevel"])) {
      throw new Error(`${prefix}.riskLevel must be low, medium, high, or critical when supplied`);
    }
  }
  return {
    type,
    target,
    parameters,
    expectedEffect,
    riskLevel: riskLevel === undefined || riskLevel === null ? undefined : (riskLevel as TypedAction["riskLevel"]),
  };
}

function parseCase(raw: unknown, index: number): SreSignalValidationCase {
  const prefix = `case[${index}]`;
  if (!isRecord(raw)) throw new Error(`${prefix} must be an object`);

  if (!nonEmptyString(raw.id)) throw new Error(`${prefix}.id must be a non-empty string`);
  if (!nonEmptyString(raw.context)) throw new Error(`${prefix}.context must be a non-empty string`);
  if (!nonEmptyString(raw.rationale)) throw new Error(`${prefix}.rationale must be a non-empty string`);

  const rawAction = raw.proposedAction ?? raw.proposed_action;
  if (!isRecord(rawAction)) throw new Error(`${prefix}.proposedAction must be an object`);
  if (!nonEmptyString(rawAction.type)) throw new Error(`${prefix}.proposedAction.type must be a non-empty string`);

  const domain = raw.domain;
  if (domain !== undefined && domain !== "sre") throw new Error(`${prefix}.domain must be "sre" when supplied`);

  return {
    id: raw.id,
    context: raw.context,
    proposedAction: parseTypedAction(rawAction, `${prefix}.proposedAction`),
    rationale: raw.rationale,
    humanLabel: optionalString(raw.humanLabel ?? raw.human_label ?? raw.label, `${prefix}.humanLabel`),
    humanScore: optionalNumber(raw.humanScore ?? raw.human_score, `${prefix}.humanScore`),
    humanNotes: optionalStringArray(raw.humanNotes ?? raw.human_notes, `${prefix}.humanNotes`) ?? [],
    source: optionalString(raw.source, `${prefix}.source`),
    split: optionalString(raw.split, `${prefix}.split`),
    metadata: optionalRecord(raw.metadata, `${prefix}.metadata`),
  };
}

export function parseSreSignalValidationInput(value: unknown): SreSignalValidationCase[] {
  return rawCasesFromInput(value).map(parseCase);
}

export async function loadSreSignalValidationCases(filePath: string): Promise<SreSignalValidationCase[]> {
  const raw = await readFile(filePath, "utf8");
  return parseSreSignalValidationInput(JSON.parse(raw));
}

function requestFromCase(testCase: SreSignalValidationCase): EvaluationRequestV2 {
  return {
    traceId: testCase.id,
    domain: "sre",
    context: testCase.context,
    proposedAction: testCase.proposedAction,
    rationale: testCase.rationale,
    metadata: {
      ...(testCase.metadata ?? {}),
      validationExperiment: "sre-core-signal-validation",
      source: testCase.source ?? null,
      split: testCase.split ?? null,
    },
  };
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function mean(values: Array<number | null | undefined>): number | null {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (present.length === 0) return null;
  return round4(present.reduce((sum, value) => sum + value, 0) / present.length);
}

function uniqueNotes(...noteGroups: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const notes: string[] = [];
  for (const group of noteGroups) {
    for (const note of group ?? []) {
      const trimmed = note.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      notes.push(trimmed);
    }
  }
  return notes.slice(0, 10);
}

function snakeSubscores(subscores: EvaluationSubscores | null): SreSignalValidationSubscores | null {
  if (!subscores) return null;
  return {
    rationale_specificity: subscores.rationaleSpecificity,
    action_coupling: subscores.actionCoupling,
    alternative_resistance: subscores.alternativeResistance,
    policy_alignment: subscores.policyAlignment,
    context_grounding: subscores.contextGrounding,
  };
}

function snakeSpecificityFeatures(features: SpecificityFeatures | undefined): SreSignalValidationSpecificityFeatures | null {
  if (!features) return null;
  return {
    numeric_thresholds: features.numericThresholds,
    causal_connectors: features.causalConnectors,
    domain_terms: features.domainTerms,
    action_terms: features.actionTerms,
    evidence_markers: features.evidenceMarkers,
    hedge_terms: features.hedgeTerms,
  };
}

function loadBearingAnchors(report: EvaluationReportV2): SreSignalValidationLoadBearingAnchor[] {
  return (report.grounding?.anchors ?? [])
    .filter((anchor) => anchor.loadBearing)
    .map((anchor) => ({
      id: anchor.id,
      kind: anchor.kind,
      status: anchor.status,
      load_bearing: true,
      text: anchor.text,
      normalized_text: anchor.normalizedText,
      context_evidence: anchor.contextEvidence,
      contradiction_evidence: anchor.contradictionEvidence,
      weight: anchor.weight,
      notes: anchor.notes,
    }));
}

function itemFromReport(testCase: SreSignalValidationCase, report: EvaluationReportV2): SreSignalValidationItem {
  const subscores = snakeSubscores(report.subscores);
  const rationaleSpecificity = subscores?.rationale_specificity ?? report.toulmin?.specificity.value ?? null;
  return {
    id: testCase.id,
    human_label: testCase.humanLabel ?? null,
    human_score: testCase.humanScore ?? null,
    human_notes: testCase.humanNotes ?? [],
    source: testCase.source ?? null,
    split: testCase.split ?? null,
    action_type: testCase.proposedAction.type,
    action_target: testCase.proposedAction.target ?? null,
    status: report.status,
    recommendation: report.recommendation,
    calibration: report.calibration,
    overall_signal: report.overallSignal,
    specificity_margin: report.support?.specificityMargin ?? null,
    rationale_specificity: rationaleSpecificity,
    subscores,
    rationale_specificity_features: snakeSpecificityFeatures(report.toulmin?.specificity.features),
    load_bearing_anchors: loadBearingAnchors(report),
    grounding_summary: report.grounding
      ? {
          present: report.grounding.summary.present,
          absent: report.grounding.summary.absent,
          contradicted: report.grounding.summary.contradicted,
          load_bearing: report.grounding.summary.loadBearing,
        }
      : null,
    critique_notes: uniqueNotes(
      report.topWeaknesses,
      report.toulmin?.specificity.notes,
      report.support?.notes,
      report.grounding?.notes,
      report.errors.map((error) => `Evaluation error: ${error}`)
    ),
    provider: {
      provider: report.providerMetadata.provider,
      model: report.providerMetadata.model,
      deterministic: report.providerMetadata.deterministic,
    },
    evaluator: {
      version: report.rubric.evaluatorVersion,
      rubric_version: report.rubric.rubricVersion,
      fingerprint: report.rubric.evaluatorFingerprint ?? null,
    },
    blocked_uses: report.readiness.blockedUses,
    product_semantics: report.productSemantics,
  };
}

function labelSummary(items: SreSignalValidationItem[]): Record<string, SreSignalValidationLabelSummary> {
  const labels = new Map<string, SreSignalValidationItem[]>();
  for (const item of items) {
    if (!item.human_label) continue;
    const group = labels.get(item.human_label) ?? [];
    group.push(item);
    labels.set(item.human_label, group);
  }
  return Object.fromEntries(
    [...labels.entries()].map(([label, group]) => [
      label,
      {
        case_count: group.length,
        mean_overall_signal: mean(group.map((item) => item.overall_signal)),
        mean_specificity_margin: mean(group.map((item) => item.specificity_margin)),
        mean_rationale_specificity: mean(group.map((item) => item.rationale_specificity)),
        mean_context_grounding: mean(group.map((item) => item.subscores?.context_grounding)),
      },
    ])
  );
}

function summarize(items: SreSignalValidationItem[]): SreSignalValidationSummary {
  return {
    case_count: items.length,
    complete_count: items.filter((item) => item.status === "complete").length,
    human_labeled_count: items.filter((item) => item.human_label !== null || item.human_score !== null).length,
    mean_overall_signal: mean(items.map((item) => item.overall_signal)),
    mean_specificity_margin: mean(items.map((item) => item.specificity_margin)),
    mean_rationale_specificity: mean(items.map((item) => item.rationale_specificity)),
    mean_context_grounding: mean(items.map((item) => item.subscores?.context_grounding)),
    by_human_label: labelSummary(items),
  };
}

export async function runSreSignalValidation(
  cases: SreSignalValidationCase[],
  options: SreSignalValidationRunOptions = {}
): Promise<SreSignalValidationResult> {
  const evaluator = options.evaluator ?? ((request: EvaluationRequestV2) => evaluateRequestV2(request));
  const items: SreSignalValidationItem[] = [];
  for (const testCase of cases) {
    const report = await evaluator(requestFromCase(testCase));
    items.push(itemFromReport(testCase, report));
  }

  return {
    schema_version: SRE_SIGNAL_VALIDATION_SCHEMA_VERSION,
    signal_name: "rationale-action specificity",
    generated_at: options.generatedAt ?? new Date().toISOString(),
    calibration: "uncalibrated_internal_alpha",
    purpose:
      "Focused validation output for comparing Elenchus explanation-quality signals against human labels. It is not correctness, safety, faithfulness, or production allow/deny evidence.",
    summary: summarize(items),
    items,
  };
}

function hardenCsvCell(text: string): string {
  return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const rawText = Array.isArray(value) ? value.join(" | ") : String(value);
  const text = hardenCsvCell(rawText);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function anchorCount(item: SreSignalValidationItem, status: GroundingAnchor["status"]): number {
  return item.load_bearing_anchors.filter((anchor) => anchor.status === status).length;
}

export function renderSreSignalValidationCsv(result: SreSignalValidationResult): string {
  const header = [
    "id",
    "human_label",
    "human_score",
    "human_notes",
    "source",
    "split",
    "action_type",
    "recommendation",
    "overall_signal",
    "specificity_margin",
    "rationale_specificity",
    "context_grounding",
    "load_bearing_present",
    "load_bearing_absent",
    "load_bearing_contradicted",
    "critique_notes",
  ];
  const rows = result.items.map((item) =>
    [
      item.id,
      item.human_label,
      item.human_score,
      item.human_notes,
      item.source,
      item.split,
      item.action_type,
      item.recommendation,
      item.overall_signal,
      item.specificity_margin,
      item.rationale_specificity,
      item.subscores?.context_grounding,
      anchorCount(item, "present"),
      anchorCount(item, "absent"),
      anchorCount(item, "contradicted"),
      item.critique_notes,
    ]
      .map(csvValue)
      .join(",")
  );
  return [header.join(","), ...rows].join("\n") + "\n";
}

export async function writeSreSignalValidationOutputs(
  result: SreSignalValidationResult,
  outputDir: string
): Promise<SreSignalValidationOutputPaths> {
  await mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "result.json");
  const csvPath = path.join(outputDir, "comparison.csv");
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(csvPath, renderSreSignalValidationCsv(result));
  return { jsonPath, csvPath };
}

export function renderSreSignalValidationStdoutSummary(
  result: SreSignalValidationResult,
  outputs?: SreSignalValidationOutputPaths
): string {
  const lines = [
    "Elenchus SRE core signal validation",
    `schema_version: ${result.schema_version}`,
    `calibration: ${result.calibration}`,
    `cases: ${result.summary.case_count} (${result.summary.human_labeled_count} with human labels)`,
    `mean_specificity_margin: ${result.summary.mean_specificity_margin ?? "n/a"}`,
    `mean_rationale_specificity: ${result.summary.mean_rationale_specificity ?? "n/a"}`,
  ];
  if (outputs) {
    lines.push(`json: ${outputs.jsonPath}`);
    lines.push(`csv: ${outputs.csvPath}`);
  }
  lines.push("", "id\thuman_label\trecommendation\tspecificity_margin\trationale_specificity\tcontext_grounding\tload_bearing_absent_or_contradicted");
  for (const item of result.items) {
    const failedAnchors = anchorCount(item, "absent") + anchorCount(item, "contradicted");
    lines.push(
      [
        item.id,
        item.human_label ?? "",
        item.recommendation,
        item.specificity_margin ?? "",
        item.rationale_specificity ?? "",
        item.subscores?.context_grounding ?? "",
        failedAnchors,
      ].join("\t")
    );
  }
  return `${lines.join("\n")}\n`;
}
