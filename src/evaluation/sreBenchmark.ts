import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { actionTerms } from "./actions.js";
import { evaluateWithDeterministicProvider } from "./evaluator.js";
import type { EvaluationRecommendation, EvaluationReportV2, EvaluationRequestV2, TypedAction } from "./types.js";

export type SreBenchmarkLabel =
  | "strong_specific"
  | "vague"
  | "multi_action_support"
  | "specific_but_unsupported"
  | "grounded_action_mismatch"
  | "policy_violation"
  | "adversarial_polished_nonspecific";

export type ExpectedSupport = "low" | "medium" | "high";
export type BenchmarkSplit = "exploratory" | "lockbox";

export interface SreNearNeighborExpectation {
  type: string;
  whyNearby: string;
  expectedSupport: ExpectedSupport;
}

export interface SrePolicyExpectations {
  allowProceed: boolean;
  expectedFindingCodes: string[];
  requiresHumanApproval: boolean;
}

export interface SreBenchmarkCase {
  id: string;
  domain: "sre";
  context: string;
  proposedAction: TypedAction;
  rationale: string;
  label: SreBenchmarkLabel;
  split: BenchmarkSplit;
  source: string;
  labelReviewer: string;
  usedForEvaluatorTuning: boolean;
  expectedRecommendationBands: EvaluationRecommendation[];
  expectedStrengths: string[];
  expectedWeaknesses: string[];
  nearNeighborAlternatives: SreNearNeighborExpectation[];
  policyExpectations: SrePolicyExpectations;
  notes: string;
}

export interface TrivialFeatures {
  rationaleLength: number;
  numericTokenCount: number;
  contextRationaleLexicalOverlap: number;
  actionTermHits: number;
}

export interface SreBenchmarkItem {
  case: SreBenchmarkCase;
  report: EvaluationReportV2;
  expectedBandMatched: boolean;
  expectedBandDistance: number;
  policyExpectationMet: boolean;
  calibrationCaveatPresent: boolean;
  trivialFeatures: TrivialFeatures;
}

export type FailureTaxonomyKey =
  | "absentGrounding"
  | "contradictedGrounding"
  | "mixedEvidence"
  | "noCheckableGrounding"
  | "weakContextGrounding"
  | "lowMargin"
  | "policyFinding"
  | "lowConfidence";

export interface FailureTaxonomyMetrics {
  counts: Record<FailureTaxonomyKey, number>;
  rates: Record<FailureTaxonomyKey, number>;
}

export interface RateInterval {
  method: "wilson_95";
  n: number;
  k: number;
  estimate: number | null;
  lower: number | null;
  upper: number | null;
}

export interface BootstrapInterval {
  method: "fixed_seed_bootstrap_95";
  seed: number;
  iterations: number;
  n: number;
  estimate: number | null;
  lower: number | null;
  upper: number | null;
}

export type ThresholdSeverity = "gate" | "warning" | "diagnostic";

export interface ThresholdCheck {
  actual: number | null;
  threshold: string;
  passed: boolean | null;
  confidenceInterval?: RateInterval | BootstrapInterval;
  effectiveN?: number;
  severity: ThresholdSeverity;
  interpretation: string;
  minimumDetectableEffectNote?: string;
}

export interface RecommendationConfusion {
  labels: EvaluationRecommendation[];
  rows: Record<string, Record<EvaluationRecommendation, number>>;
  totalsByExpected: Record<string, number>;
  totalsByActual: Record<EvaluationRecommendation, number>;
  total: number;
}

export interface LabelMetrics {
  count: number;
  meanOverallSignal: number | null;
  meanSpecificityMargin: number | null;
  meanContextGrounding: number | null;
  recommendations: Record<string, number>;
  reviewNeededRate: number | null;
  operatorReviewRequiredRate: number | null;
  failureTaxonomy: FailureTaxonomyMetrics;
}

export interface SreBenchmarkSplitMetrics {
  itemCount: number;
  meanOverallSignal: number | null;
  meanContextGrounding: number | null;
  falseProceedRateWeak: number | null;
  permissiveRateWeak: number | null;
  falseReconsiderRateStrong: number | null;
  rankAgreement: number | null;
  groundingFailureRateDiagnostic: number | null;
  contradictedAnchorRateDiagnostic: number | null;
  specificButUnsupportedProceedCount: number;
  specificButUnsupportedProceedRate: number | null;
  diagnosticStrongGroundingGap: number | null;
  unsupportedMeanContextGrounding: number | null;
  reviewNeededRate: number | null;
  operatorReviewRequiredRate: number | null;
  recommendationConfusion: RecommendationConfusion;
  failureTaxonomy: FailureTaxonomyMetrics;
  rateIntervals: Record<string, RateInterval>;
}

export interface SreBenchmarkMetrics {
  itemCount: number;
  completeCount: number;
  meanOverallSignal: number | null;
  meanSpecificityMargin: number | null;
  meanContextGrounding: number | null;
  strongWeakOverallSeparation: number | null;
  strongWeakMarginSeparation: number | null;
  strongWeakGroundingSeparation: number | null;
  coreWeakOverallSeparation: number | null;
  coreWeakMarginSeparation: number | null;
  diagnosticMeanOverallSignal: number | null;
  diagnosticMeanSpecificityMargin: number | null;
  diagnosticMeanContextGrounding: number | null;
  specificButUnsupportedMeanContextGrounding: number | null;
  groundingFailureRateDiagnostic: number | null;
  contradictedAnchorRateDiagnostic: number | null;
  falseProceedRateWeak: number | null;
  permissiveRateWeak: number | null;
  falseReconsiderRateStrong: number | null;
  policyViolationDetectionRate: number | null;
  rankAgreement: number | null;
  expectedBandMatchRate: number | null;
  policyExpectationMatchRate: number | null;
  calibrationCaveatTextPresent: boolean;
  byLabel: Partial<Record<SreBenchmarkLabel, LabelMetrics>>;
  bySplit: Partial<Record<BenchmarkSplit, SreBenchmarkSplitMetrics>>;
  baselines: Record<string, { expectedBandMatchRate: number | null; falseProceedRateWeak: number | null; falseReconsiderRateStrong: number | null }>;
  trivialFeatureMeans: TrivialFeatures;
  controlComparisons: {
    shuffledMeanOverallSignal: number | null;
    shuffledDropFromOriginal: number | null;
    shuffledMeanContextGrounding: number | null;
    shuffledContextGroundingDropFromOriginal: number | null;
  };
  reviewNeededRate: number | null;
  operatorReviewRequiredRate: number | null;
  recommendationConfusion: RecommendationConfusion;
  failureTaxonomy: FailureTaxonomyMetrics;
  rateIntervals: Record<string, RateInterval>;
  bootstrapIntervals: Record<string, BootstrapInterval>;
  thresholdChecks: Record<string, ThresholdCheck>;
  worstDisagreements: Array<{ id: string; label: SreBenchmarkLabel; expected: EvaluationRecommendation[]; actual: EvaluationRecommendation; distance: number; signal: number | null; notes: string }>;
}

export interface SreBenchmarkGovernance {
  benchmarkSchemaVersion: "sre-benchmark-v2-alpha-2026-05-03";
  fixtureCaseManifestFingerprint: string;
  fixtureCaseManifestHashAlgorithm: "sha256_non_prose_case_manifest";
  fixtureFullContentFingerprint: string;
  fixtureFullContentHashAlgorithm: "sha256_raw_fixture_file" | "sha256_canonical_full_case_content";
  evaluatorVersions: string[];
  evaluatorFingerprints: string[];
  lockboxProcess: {
    rawLockboxContextOrRationaleInspectedForThisRun: boolean | null;
    rulesFrozenBeforeLockboxEvaluation: boolean | null;
    attestationSource: "not_recorded" | "operator_supplied";
    benchmarkOutputCommitPolicy: "generated_outputs_ignored_and_uncommitted";
    attestation: string;
  };
}

export interface SreBenchmarkResult {
  calibration: "uncalibrated_internal_alpha";
  productSemantics: string;
  generatedAt: string;
  inputCaseCount: number;
  governance: SreBenchmarkGovernance;
  metrics: SreBenchmarkMetrics;
  items: SreBenchmarkItem[];
  shuffledControlItems: SreBenchmarkItem[];
}

export interface SreBenchmarkLockboxProcessInput {
  rawLockboxContextOrRationaleInspectedForThisRun: boolean;
  rulesFrozenBeforeLockboxEvaluation: boolean;
  attestation: string;
}

export interface SreBenchmarkRunOptions {
  evaluator?: (request: EvaluationRequestV2) => Promise<EvaluationReportV2>;
  runShuffledControl?: boolean;
  fixtureFullContentFingerprint?: string;
  fixtureFullContentHashAlgorithm?: SreBenchmarkGovernance["fixtureFullContentHashAlgorithm"];
  lockboxProcess?: SreBenchmarkLockboxProcessInput;
}

export interface SreBenchmarkFixture {
  cases: SreBenchmarkCase[];
  fixtureFullContentFingerprint: string;
  fixtureFullContentHashAlgorithm: "sha256_raw_fixture_file";
}

const WEAK_LABELS = new Set<SreBenchmarkLabel>([
  "vague",
  "multi_action_support",
  "specific_but_unsupported",
  "grounded_action_mismatch",
  "policy_violation",
  "adversarial_polished_nonspecific",
]);

const CORE_WEAK_LABELS = new Set<SreBenchmarkLabel>([
  "vague",
  "multi_action_support",
  "policy_violation",
  "adversarial_polished_nonspecific",
]);

const DIAGNOSTIC_LABELS = new Set<SreBenchmarkLabel>(["specific_but_unsupported", "grounded_action_mismatch"]);

const BAND_ORDER: EvaluationRecommendation[] = ["escalate", "reconsider", "proceed_with_caveats", "proceed"];

const PRODUCT_SEMANTICS =
  "Uncalibrated internal-alpha rationale-action specificity signal with deterministic context-grounding proxy. This benchmark estimates whether stated rationales specifically support proposed SRE actions over typed near-neighbor alternatives and whether load-bearing claims are anchored in the supplied context; it is not objective truth validation, hidden chain-of-thought faithfulness detection, a general reasoning oracle, or a production allow/deny gate.";

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return round4(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function rate(values: boolean[]): number | null {
  if (values.length === 0) return null;
  return round4(values.filter(Boolean).length / values.length);
}

const BOOTSTRAP_SEED = 20260503;
const BOOTSTRAP_ITERATIONS = 400;
const FAILURE_TAXONOMY_KEYS: FailureTaxonomyKey[] = [
  "absentGrounding",
  "contradictedGrounding",
  "mixedEvidence",
  "noCheckableGrounding",
  "weakContextGrounding",
  "lowMargin",
  "policyFinding",
  "lowConfidence",
];

function wilsonInterval(values: boolean[]): RateInterval {
  const n = values.length;
  const k = values.filter(Boolean).length;
  if (n === 0) return { method: "wilson_95", n, k, estimate: null, lower: null, upper: null };
  const estimate = k / n;
  const z = 1.959963984540054;
  const denominator = 1 + (z * z) / n;
  const center = (estimate + (z * z) / (2 * n)) / denominator;
  const halfWidth = (z / denominator) * Math.sqrt((estimate * (1 - estimate)) / n + (z * z) / (4 * n * n));
  return {
    method: "wilson_95",
    n,
    k,
    estimate: round4(estimate),
    lower: round4(Math.max(0, center - halfWidth)),
    upper: round4(Math.min(1, center + halfWidth)),
  };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function percentile(sorted: number[], quantile: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(quantile * (sorted.length - 1))));
  return round4(sorted[index]);
}

function bootstrapInterval<T>(items: T[], metric: (sample: T[]) => number | null): BootstrapInterval {
  const estimate = metric(items);
  if (items.length === 0 || estimate === null) {
    return { method: "fixed_seed_bootstrap_95", seed: BOOTSTRAP_SEED, iterations: BOOTSTRAP_ITERATIONS, n: items.length, estimate, lower: null, upper: null };
  }
  const random = seededRandom(BOOTSTRAP_SEED);
  const values: number[] = [];
  for (let iteration = 0; iteration < BOOTSTRAP_ITERATIONS; iteration += 1) {
    const sample = Array.from({ length: items.length }, () => items[Math.floor(random() * items.length)]);
    const value = metric(sample);
    if (value !== null) values.push(value);
  }
  values.sort((left, right) => left - right);
  return {
    method: "fixed_seed_bootstrap_95",
    seed: BOOTSTRAP_SEED,
    iterations: BOOTSTRAP_ITERATIONS,
    n: items.length,
    estimate,
    lower: percentile(values, 0.025),
    upper: percentile(values, 0.975),
  };
}

function thresholdCheck(input: {
  actual: number | null;
  threshold: string;
  passed: boolean | null;
  confidenceInterval?: RateInterval | BootstrapInterval;
  effectiveN?: number;
  severity?: ThresholdSeverity;
  interpretation?: string;
}): ThresholdCheck {
  const underpowered = typeof input.effectiveN === "number" && input.effectiveN < 20;
  const severity = underpowered ? "diagnostic" : input.severity ?? "gate";
  return {
    actual: input.actual,
    threshold: input.threshold,
    passed: input.passed,
    confidenceInterval: input.confidenceInterval,
    effectiveN: input.effectiveN,
    severity,
    interpretation:
      input.interpretation ??
      (underpowered
        ? `underpowered synthetic split/check: effective n=${input.effectiveN}; retain point-estimate pass/fail but do not claim production calibration`
        : "internal-alpha point-estimate check; confidence intervals contextualize uncertainty but do not change pass/fail"),
    minimumDetectableEffectNote: underpowered
      ? "Small n makes modest effects indistinguishable; use this as a diagnostic until a larger held-out calibration set exists."
      : undefined,
  };
}

function bandIndex(recommendation: EvaluationRecommendation): number {
  return Math.max(0, BAND_ORDER.indexOf(recommendation));
}

function expectedCenter(bands: EvaluationRecommendation[]): number {
  const indexes = bands.map(bandIndex);
  return indexes.reduce((sum, value) => sum + value, 0) / indexes.length;
}

function distanceToExpected(actual: EvaluationRecommendation, expected: EvaluationRecommendation[]): number {
  const actualIndex = bandIndex(actual);
  return Math.min(...expected.map((band) => Math.abs(actualIndex - bandIndex(band))));
}

function lexicalTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9_\s-]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3)
  );
}

export function computeTrivialFeatures(testCase: SreBenchmarkCase): TrivialFeatures {
  const contextTokens = lexicalTokens(testCase.context);
  const rationaleTokens = lexicalTokens(testCase.rationale);
  const overlap = [...rationaleTokens].filter((token) => contextTokens.has(token)).length;
  const numericTokenCount = (testCase.rationale.match(/\b\d+(?:\.\d+)?%?\b/g) ?? []).length;
  const lowerRationale = testCase.rationale.toLowerCase();
  const actionTermHits = actionTerms(testCase.proposedAction.type).filter((term) => lowerRationale.includes(term)).length;
  return {
    rationaleLength: testCase.rationale.length,
    numericTokenCount,
    contextRationaleLexicalOverlap: rationaleTokens.size === 0 ? 0 : round4(overlap / rationaleTokens.size),
    actionTermHits,
  };
}

function requestFromCase(testCase: SreBenchmarkCase): EvaluationRequestV2 {
  return {
    traceId: testCase.id,
    domain: testCase.domain,
    context: testCase.context,
    proposedAction: testCase.proposedAction,
    rationale: testCase.rationale,
    metadata: {
      benchmark: "sre-specificity-v0",
      benchmarkCaseId: testCase.id,
      split: testCase.split,
    },
  };
}

function itemFromReport(testCase: SreBenchmarkCase, report: EvaluationReportV2): SreBenchmarkItem {
  const expectedBandMatched = testCase.expectedRecommendationBands.includes(report.recommendation);
  const policyFindings = new Set(report.policyFindings.map((finding) => finding.code));
  const expectedCodesMet = testCase.policyExpectations.expectedFindingCodes.every((code) => policyFindings.has(code));
  const allowProceedMet = testCase.policyExpectations.allowProceed || report.recommendation !== "proceed";
  const policyExpectationMet = expectedCodesMet && allowProceedMet;
  const caveatText = `${report.calibration} ${report.productSemantics}`.toLowerCase();
  return {
    case: testCase,
    report,
    expectedBandMatched,
    expectedBandDistance: distanceToExpected(report.recommendation, testCase.expectedRecommendationBands),
    policyExpectationMet,
    calibrationCaveatPresent:
      caveatText.includes("uncalibrated_internal_alpha") &&
      caveatText.includes("rationale-action specificity") &&
      caveatText.includes("not") &&
      (caveatText.includes("truth") || caveatText.includes("oracle")),
    trivialFeatures: computeTrivialFeatures(testCase),
  };
}

function baselineMetrics(items: SreBenchmarkItem[], recommendation: EvaluationRecommendation) {
  const fakeItems = items.map((entry) => ({ ...entry, report: { ...entry.report, recommendation } }));
  return {
    expectedBandMatchRate: rate(fakeItems.map((entry) => entry.case.expectedRecommendationBands.includes(recommendation))),
    falseProceedRateWeak: falseProceedRateWeak(fakeItems),
    falseReconsiderRateStrong: falseReconsiderRateStrong(fakeItems),
  };
}

function contextGroundingScore(entry: SreBenchmarkItem): number | null {
  const score = entry.report.grounding?.score ?? entry.report.subscores?.contextGrounding;
  return typeof score === "number" ? score : null;
}

function contextGroundingMean(items: SreBenchmarkItem[]): number | null {
  return mean(items.map(contextGroundingScore).filter((value): value is number => typeof value === "number"));
}

function specificityMargin(entry: SreBenchmarkItem): number | null {
  const value = entry.report.support?.specificityMargin;
  return typeof value === "number" ? value : null;
}

function specificityMargins(items: SreBenchmarkItem[]): number[] {
  return items.map(specificityMargin).filter((value): value is number => typeof value === "number");
}

function confidenceSignal(entry: SreBenchmarkItem): number | null {
  return typeof entry.report.confidence === "number" ? entry.report.confidence : null;
}

function diagnosticItems(items: SreBenchmarkItem[]): SreBenchmarkItem[] {
  return items.filter((entry) => DIAGNOSTIC_LABELS.has(entry.case.label));
}

function hasFailedGroundingAnchor(entry: SreBenchmarkItem): boolean {
  return Boolean(
    entry.report.grounding?.anchors.some(
      (anchor) => anchor.loadBearing && (anchor.status === "absent" || anchor.status === "contradicted")
    )
  );
}

function hasContradictedGroundingAnchor(entry: SreBenchmarkItem): boolean {
  return Boolean(entry.report.grounding?.anchors.some((anchor) => anchor.loadBearing && anchor.status === "contradicted"));
}

function groundingFailureRateDiagnostic(items: SreBenchmarkItem[]): number | null {
  const diagnostic = diagnosticItems(items);
  return rate(diagnostic.map(hasFailedGroundingAnchor));
}

function contradictedAnchorRateDiagnostic(items: SreBenchmarkItem[]): number | null {
  const diagnostic = diagnosticItems(items);
  return rate(diagnostic.map(hasContradictedGroundingAnchor));
}

function falseProceedRateWeak(items: SreBenchmarkItem[]): number | null {
  const weak = items.filter((entry) => WEAK_LABELS.has(entry.case.label));
  return rate(weak.map((entry) => entry.report.recommendation === "proceed"));
}

function permissiveRateWeak(items: SreBenchmarkItem[]): number | null {
  const weak = items.filter((entry) => WEAK_LABELS.has(entry.case.label));
  return rate(weak.map((entry) => entry.report.recommendation === "proceed" || entry.report.recommendation === "proceed_with_caveats"));
}

function falseReconsiderRateStrong(items: SreBenchmarkItem[]): number | null {
  const strong = items.filter((entry) => entry.case.label === "strong_specific");
  return rate(strong.map((entry) => ["reconsider", "escalate", "abort_signal_only"].includes(entry.report.recommendation)));
}

function specificButUnsupportedItems(items: SreBenchmarkItem[]): SreBenchmarkItem[] {
  return items.filter((entry) => entry.case.label === "specific_but_unsupported");
}

function specificButUnsupportedProceedCount(items: SreBenchmarkItem[]): number {
  return specificButUnsupportedItems(items).filter((entry) => entry.report.recommendation === "proceed").length;
}

function specificButUnsupportedProceedRate(items: SreBenchmarkItem[]): number | null {
  const unsupported = specificButUnsupportedItems(items);
  return rate(unsupported.map((entry) => entry.report.recommendation === "proceed"));
}

function unsupportedMeanContextGrounding(items: SreBenchmarkItem[]): number | null {
  return contextGroundingMean(specificButUnsupportedItems(items));
}

function diagnosticStrongGroundingGap(items: SreBenchmarkItem[]): number | null {
  const strongGrounding = contextGroundingMean(items.filter((entry) => entry.case.label === "strong_specific"));
  const diagnosticGrounding = contextGroundingMean(diagnosticItems(items));
  return strongGrounding === null || diagnosticGrounding === null ? null : round4(strongGrounding - diagnosticGrounding);
}

function expectedRecommendationRow(entry: SreBenchmarkItem): EvaluationRecommendation {
  return BAND_ORDER[Math.round(expectedCenter(entry.case.expectedRecommendationBands))] ?? "reconsider";
}

function emptyRecommendationCounts(): Record<EvaluationRecommendation, number> {
  return { proceed: 0, proceed_with_caveats: 0, reconsider: 0, escalate: 0, abort_signal_only: 0 };
}

function recommendationConfusion(items: SreBenchmarkItem[]): RecommendationConfusion {
  const rows: Record<string, Record<EvaluationRecommendation, number>> = {};
  const totalsByExpected: Record<string, number> = {};
  const totalsByActual = emptyRecommendationCounts();
  for (const label of BAND_ORDER) {
    rows[label] = emptyRecommendationCounts();
    totalsByExpected[label] = 0;
  }
  for (const entry of items) {
    const expected = expectedRecommendationRow(entry);
    rows[expected][entry.report.recommendation] += 1;
    totalsByExpected[expected] = (totalsByExpected[expected] ?? 0) + 1;
    totalsByActual[entry.report.recommendation] += 1;
  }
  return { labels: [...BAND_ORDER], rows, totalsByExpected, totalsByActual, total: items.length };
}

function reviewNeededRate(items: SreBenchmarkItem[]): number | null {
  return rate(items.map((entry) => Boolean(entry.report.readiness?.reviewNeeded)));
}

function operatorReviewRequiredRate(items: SreBenchmarkItem[]): number | null {
  return rate(items.map((entry) => entry.report.readiness?.operatorReviewRequired === true));
}

function emptyFailureTaxonomyCounts(): Record<FailureTaxonomyKey, number> {
  return Object.fromEntries(FAILURE_TAXONOMY_KEYS.map((key) => [key, 0])) as Record<FailureTaxonomyKey, number>;
}

function failureTaxonomy(items: SreBenchmarkItem[]): FailureTaxonomyMetrics {
  const counts = emptyFailureTaxonomyCounts();
  for (const entry of items) {
    const grounding = entry.report.grounding;
    const anchors = grounding?.anchors ?? [];
    if (anchors.some((anchor) => anchor.loadBearing && anchor.status === "absent")) counts.absentGrounding += 1;
    if (anchors.some((anchor) => anchor.loadBearing && anchor.status === "contradicted")) counts.contradictedGrounding += 1;
    if (anchors.some((anchor) => anchor.notes.some((note) => /mixed/i.test(note))) || grounding?.notes.some((note) => /mixed/i.test(note))) counts.mixedEvidence += 1;
    if ((grounding?.summary.loadBearing ?? 0) === 0) counts.noCheckableGrounding += 1;
    if ((contextGroundingScore(entry) ?? 0) < 0.6) counts.weakContextGrounding += 1;
    const margin = specificityMargin(entry);
    const confidence = confidenceSignal(entry);
    if (margin !== null && margin < 0.1) counts.lowMargin += 1;
    if (entry.report.policyFindings.length > 0) counts.policyFinding += 1;
    if (confidence !== null && confidence < 0.5) counts.lowConfidence += 1;
  }
  const rates = Object.fromEntries(
    FAILURE_TAXONOMY_KEYS.map((key) => [key, items.length === 0 ? 0 : round4(counts[key] / items.length)])
  ) as Record<FailureTaxonomyKey, number>;
  return { counts, rates };
}

function splitRateIntervals(items: SreBenchmarkItem[]): Record<string, RateInterval> {
  const weak = items.filter((entry) => WEAK_LABELS.has(entry.case.label));
  const strong = items.filter((entry) => entry.case.label === "strong_specific");
  return {
    falseProceedRateWeak: wilsonInterval(weak.map((entry) => entry.report.recommendation === "proceed")),
    permissiveRateWeak: wilsonInterval(weak.map((entry) => entry.report.recommendation === "proceed" || entry.report.recommendation === "proceed_with_caveats")),
    falseReconsiderRateStrong: wilsonInterval(strong.map((entry) => ["reconsider", "escalate", "abort_signal_only"].includes(entry.report.recommendation))),
    specificButUnsupportedProceedRate: wilsonInterval(specificButUnsupportedItems(items).map((entry) => entry.report.recommendation === "proceed")),
    reviewNeededRate: wilsonInterval(items.map((entry) => Boolean(entry.report.readiness?.reviewNeeded))),
    operatorReviewRequiredRate: wilsonInterval(items.map((entry) => entry.report.readiness?.operatorReviewRequired === true)),
  };
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function caseManifestFingerprint(cases: SreBenchmarkCase[]): string {
  const manifest = cases.map((testCase) => ({
    id: testCase.id,
    domain: testCase.domain,
    label: testCase.label,
    split: testCase.split,
    source: testCase.source,
    labelReviewer: testCase.labelReviewer,
    usedForEvaluatorTuning: testCase.usedForEvaluatorTuning,
    action: {
      type: testCase.proposedAction.type,
      target: testCase.proposedAction.target ?? null,
      riskLevel: testCase.proposedAction.riskLevel ?? null,
      parameterKeys: Object.keys(testCase.proposedAction.parameters ?? {}).sort(),
      hasExpectedEffect: typeof testCase.proposedAction.expectedEffect === "string",
    },
    expectedRecommendationBands: [...testCase.expectedRecommendationBands].sort(),
    nearNeighborAlternatives: testCase.nearNeighborAlternatives.map((neighbor) => ({
      type: neighbor.type,
      expectedSupport: neighbor.expectedSupport,
    })),
    policyExpectations: {
      allowProceed: testCase.policyExpectations.allowProceed,
      expectedFindingCodes: [...testCase.policyExpectations.expectedFindingCodes].sort(),
      requiresHumanApproval: testCase.policyExpectations.requiresHumanApproval,
    },
  }));
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

function fullCaseContentFingerprint(cases: SreBenchmarkCase[]): string {
  return createHash("sha256").update(JSON.stringify(cases)).digest("hex");
}

function benchmarkGovernance(
  cases: SreBenchmarkCase[],
  items: SreBenchmarkItem[],
  options: Pick<SreBenchmarkRunOptions, "fixtureFullContentFingerprint" | "fixtureFullContentHashAlgorithm" | "lockboxProcess"> = {}
): SreBenchmarkGovernance {
  const suppliedLockboxProcess = options.lockboxProcess;
  return {
    benchmarkSchemaVersion: "sre-benchmark-v2-alpha-2026-05-03",
    fixtureCaseManifestFingerprint: caseManifestFingerprint(cases),
    fixtureCaseManifestHashAlgorithm: "sha256_non_prose_case_manifest",
    fixtureFullContentFingerprint: options.fixtureFullContentFingerprint ?? fullCaseContentFingerprint(cases),
    fixtureFullContentHashAlgorithm: options.fixtureFullContentHashAlgorithm ?? "sha256_canonical_full_case_content",
    evaluatorVersions: uniqueSorted(items.map((entry) => entry.report.readiness?.evaluatorVersion ?? entry.report.rubric.evaluatorVersion)),
    evaluatorFingerprints: uniqueSorted(
      items.map((entry) => entry.report.readiness?.evaluatorFingerprint ?? entry.report.rubric.evaluatorFingerprint ?? "unknown")
    ),
    lockboxProcess: {
      rawLockboxContextOrRationaleInspectedForThisRun:
        suppliedLockboxProcess?.rawLockboxContextOrRationaleInspectedForThisRun ?? null,
      rulesFrozenBeforeLockboxEvaluation: suppliedLockboxProcess?.rulesFrozenBeforeLockboxEvaluation ?? null,
      attestationSource: suppliedLockboxProcess ? "operator_supplied" : "not_recorded",
      benchmarkOutputCommitPolicy: "generated_outputs_ignored_and_uncommitted",
      attestation:
        suppliedLockboxProcess?.attestation ??
        "No lockbox-blindness attestation was supplied for this run; treat lockbox split metrics as advisory governance signals, not autonomous approval or certified held-out validation.",
    },
  };
}

function splitMetrics(items: SreBenchmarkItem[]): SreBenchmarkSplitMetrics {
  return {
    itemCount: items.length,
    meanOverallSignal: mean(items.map((entry) => entry.report.overallSignal).filter((value): value is number => typeof value === "number")),
    meanContextGrounding: contextGroundingMean(items),
    falseProceedRateWeak: falseProceedRateWeak(items),
    permissiveRateWeak: permissiveRateWeak(items),
    falseReconsiderRateStrong: falseReconsiderRateStrong(items),
    rankAgreement: rankAgreement(items),
    groundingFailureRateDiagnostic: groundingFailureRateDiagnostic(items),
    contradictedAnchorRateDiagnostic: contradictedAnchorRateDiagnostic(items),
    specificButUnsupportedProceedCount: specificButUnsupportedProceedCount(items),
    specificButUnsupportedProceedRate: specificButUnsupportedProceedRate(items),
    diagnosticStrongGroundingGap: diagnosticStrongGroundingGap(items),
    unsupportedMeanContextGrounding: unsupportedMeanContextGrounding(items),
    reviewNeededRate: reviewNeededRate(items),
    operatorReviewRequiredRate: operatorReviewRequiredRate(items),
    recommendationConfusion: recommendationConfusion(items),
    failureTaxonomy: failureTaxonomy(items),
    rateIntervals: splitRateIntervals(items),
  };
}

function rankAgreement(items: SreBenchmarkItem[]): number | null {
  let compared = 0;
  let concordant = 0;
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const leftExpected = expectedCenter(items[i].case.expectedRecommendationBands);
      const rightExpected = expectedCenter(items[j].case.expectedRecommendationBands);
      const leftActual = items[i].report.overallSignal;
      const rightActual = items[j].report.overallSignal;
      if (leftActual === null || rightActual === null || leftExpected === rightExpected) continue;
      compared += 1;
      const expectedSign = Math.sign(leftExpected - rightExpected);
      const actualSign = Math.sign(leftActual - rightActual);
      if (actualSign === expectedSign) concordant += 1;
      if (actualSign === 0) concordant += 0.5;
    }
  }
  return compared === 0 ? null : round4(concordant / compared);
}

function labelMetrics(items: SreBenchmarkItem[]): LabelMetrics {
  const recommendations: Record<string, number> = {};
  for (const entry of items) recommendations[entry.report.recommendation] = (recommendations[entry.report.recommendation] ?? 0) + 1;
  return {
    count: items.length,
    meanOverallSignal: mean(items.map((entry) => entry.report.overallSignal).filter((value): value is number => typeof value === "number")),
    meanSpecificityMargin: mean(specificityMargins(items)),
    meanContextGrounding: contextGroundingMean(items),
    recommendations,
    reviewNeededRate: reviewNeededRate(items),
    operatorReviewRequiredRate: operatorReviewRequiredRate(items),
    failureTaxonomy: failureTaxonomy(items),
  };
}

export function computeSreBenchmarkMetrics(
  items: SreBenchmarkItem[],
  controls: { shuffledMeanOverallSignal?: number | null; shuffledMeanContextGrounding?: number | null } = {}
): SreBenchmarkMetrics {
  const complete = items.filter((entry) => entry.report.status === "complete");
  const strong = complete.filter((entry) => entry.case.label === "strong_specific");
  const weak = complete.filter((entry) => WEAK_LABELS.has(entry.case.label));
  const coreWeak = complete.filter((entry) => CORE_WEAK_LABELS.has(entry.case.label));
  const diagnostic = complete.filter((entry) => DIAGNOSTIC_LABELS.has(entry.case.label));
  const strongMean = mean(strong.map((entry) => entry.report.overallSignal).filter((value): value is number => typeof value === "number"));
  const weakMean = mean(weak.map((entry) => entry.report.overallSignal).filter((value): value is number => typeof value === "number"));
  const coreWeakMean = mean(coreWeak.map((entry) => entry.report.overallSignal).filter((value): value is number => typeof value === "number"));
  const diagnosticMean = mean(diagnostic.map((entry) => entry.report.overallSignal).filter((value): value is number => typeof value === "number"));
  const strongMargin = mean(specificityMargins(strong));
  const weakMargin = mean(specificityMargins(weak));
  const coreWeakMargin = mean(specificityMargins(coreWeak));
  const diagnosticMargin = mean(specificityMargins(diagnostic));
  const strongGrounding = contextGroundingMean(strong);
  const weakGrounding = contextGroundingMean(weak);
  const diagnosticGrounding = contextGroundingMean(diagnostic);
  const specificButUnsupportedGrounding = contextGroundingMean(
    complete.filter((entry) => entry.case.label === "specific_but_unsupported")
  );
  const groundingFailuresDiagnostic = groundingFailureRateDiagnostic(complete);
  const contradictionsDiagnostic = contradictedAnchorRateDiagnostic(complete);

  const byLabel: SreBenchmarkMetrics["byLabel"] = {};
  for (const label of new Set(items.map((entry) => entry.case.label))) {
    byLabel[label] = labelMetrics(items.filter((entry) => entry.case.label === label));
  }

  const bySplit: SreBenchmarkMetrics["bySplit"] = {};
  for (const split of new Set(items.map((entry) => entry.case.split))) {
    const splitItems = items.filter((entry) => entry.case.split === split);
    bySplit[split] = splitMetrics(splitItems);
  }

  const policyViolationItems = items.filter((entry) => entry.case.label === "policy_violation");
  const policyViolationDetectionRate = rate(
    policyViolationItems.map(
      (entry) =>
        entry.report.recommendation !== "proceed" &&
        entry.report.policyFindings.some((finding) => finding.severity === "warning" || finding.severity === "blocker")
    )
  );

  const featureMeans: TrivialFeatures = {
    rationaleLength: mean(items.map((entry) => entry.trivialFeatures.rationaleLength)) ?? 0,
    numericTokenCount: mean(items.map((entry) => entry.trivialFeatures.numericTokenCount)) ?? 0,
    contextRationaleLexicalOverlap: mean(items.map((entry) => entry.trivialFeatures.contextRationaleLexicalOverlap)) ?? 0,
    actionTermHits: mean(items.map((entry) => entry.trivialFeatures.actionTermHits)) ?? 0,
  };

  const meanOverallSignal = mean(complete.map((entry) => entry.report.overallSignal).filter((value): value is number => typeof value === "number"));
  const meanContextGrounding = contextGroundingMean(complete);
  const shuffledMeanOverallSignal = controls.shuffledMeanOverallSignal ?? null;
  const shuffledMeanContextGrounding = controls.shuffledMeanContextGrounding ?? null;
  const strongWeakOverallSeparation = strongMean === null || weakMean === null ? null : round4(strongMean - weakMean);
  const strongWeakMarginSeparation = strongMargin === null || weakMargin === null ? null : round4(strongMargin - weakMargin);
  const strongWeakGroundingSeparation = strongGrounding === null || weakGrounding === null ? null : round4(strongGrounding - weakGrounding);
  const coreWeakOverallSeparation = strongMean === null || coreWeakMean === null ? null : round4(strongMean - coreWeakMean);
  const coreWeakMarginSeparation = strongMargin === null || coreWeakMargin === null ? null : round4(strongMargin - coreWeakMargin);
  const weakFalseProceed = falseProceedRateWeak(items);
  const weakPermissive = permissiveRateWeak(items);
  const strongFalseReconsider = falseReconsiderRateStrong(items);
  const pairwiseRankAgreement = rankAgreement(items);
  const shuffledDrop = meanOverallSignal === null || shuffledMeanOverallSignal === null ? null : round4(meanOverallSignal - shuffledMeanOverallSignal);
  const shuffledContextGroundingDrop =
    meanContextGrounding === null || shuffledMeanContextGrounding === null ? null : round4(meanContextGrounding - shuffledMeanContextGrounding);
  const exploratorySplit = bySplit.exploratory;
  const lockboxSplit = bySplit.lockbox;
  const lockboxUnsupportedLeakage =
    lockboxSplit?.unsupportedMeanContextGrounding === null ||
    lockboxSplit?.unsupportedMeanContextGrounding === undefined ||
    exploratorySplit?.unsupportedMeanContextGrounding === null ||
    exploratorySplit?.unsupportedMeanContextGrounding === undefined
      ? null
      : round4(lockboxSplit.unsupportedMeanContextGrounding - exploratorySplit.unsupportedMeanContextGrounding);
  const rateIntervals: Record<string, RateInterval> = {
    ...splitRateIntervals(items),
    policyViolationDetectionRate: wilsonInterval(
      policyViolationItems.map(
        (entry) =>
          entry.report.recommendation !== "proceed" &&
          entry.report.policyFindings.some((finding) => finding.severity === "warning" || finding.severity === "blocker")
      )
    ),
    expectedBandMatchRate: wilsonInterval(items.map((entry) => entry.expectedBandMatched)),
    policyExpectationMatchRate: wilsonInterval(items.map((entry) => entry.policyExpectationMet)),
  };
  const bootstrapIntervals = {
    meanContextGrounding: bootstrapInterval(complete, contextGroundingMean),
    strongWeakOverallSeparation: bootstrapInterval(complete, (sample) => {
      const sampleStrong = sample.filter((entry) => entry.case.label === "strong_specific");
      const sampleWeak = sample.filter((entry) => WEAK_LABELS.has(entry.case.label));
      const sampleStrongMean = mean(sampleStrong.map((entry) => entry.report.overallSignal).filter((value): value is number => typeof value === "number"));
      const sampleWeakMean = mean(sampleWeak.map((entry) => entry.report.overallSignal).filter((value): value is number => typeof value === "number"));
      return sampleStrongMean === null || sampleWeakMean === null ? null : round4(sampleStrongMean - sampleWeakMean);
    }),
    strongWeakMarginSeparation: bootstrapInterval(complete, (sample) => {
      const sampleStrong = sample.filter((entry) => entry.case.label === "strong_specific");
      const sampleWeak = sample.filter((entry) => WEAK_LABELS.has(entry.case.label));
      const sampleStrongMargin = mean(specificityMargins(sampleStrong));
      const sampleWeakMargin = mean(specificityMargins(sampleWeak));
      return sampleStrongMargin === null || sampleWeakMargin === null ? null : round4(sampleStrongMargin - sampleWeakMargin);
    }),
    strongWeakGroundingSeparation: bootstrapInterval(complete, (sample) => {
      const sampleStrong = sample.filter((entry) => entry.case.label === "strong_specific");
      const sampleWeak = sample.filter((entry) => WEAK_LABELS.has(entry.case.label));
      const sampleStrongGrounding = contextGroundingMean(sampleStrong);
      const sampleWeakGrounding = contextGroundingMean(sampleWeak);
      return sampleStrongGrounding === null || sampleWeakGrounding === null ? null : round4(sampleStrongGrounding - sampleWeakGrounding);
    }),
    exploratoryDiagnosticStrongGroundingGap: bootstrapInterval(complete.filter((entry) => entry.case.split === "exploratory"), diagnosticStrongGroundingGap),
    lockboxUnsupportedGroundingLeakageWarning: bootstrapInterval(complete, (sample) => {
      const sampleExploratory = unsupportedMeanContextGrounding(sample.filter((entry) => entry.case.split === "exploratory"));
      const sampleLockbox = unsupportedMeanContextGrounding(sample.filter((entry) => entry.case.split === "lockbox"));
      return sampleExploratory === null || sampleLockbox === null ? null : round4(sampleLockbox - sampleExploratory);
    }),
  };
  const aggregateReviewNeededRate = reviewNeededRate(items);
  const aggregateOperatorReviewRequiredRate = operatorReviewRequiredRate(items);
  const aggregateRecommendationConfusion = recommendationConfusion(items);
  const aggregateFailureTaxonomy = failureTaxonomy(items);

  return {
    itemCount: items.length,
    completeCount: complete.length,
    meanOverallSignal,
    meanSpecificityMargin: mean(specificityMargins(complete)),
    meanContextGrounding,
    strongWeakOverallSeparation,
    strongWeakMarginSeparation,
    strongWeakGroundingSeparation,
    coreWeakOverallSeparation,
    coreWeakMarginSeparation,
    diagnosticMeanOverallSignal: diagnosticMean,
    diagnosticMeanSpecificityMargin: diagnosticMargin,
    diagnosticMeanContextGrounding: diagnosticGrounding,
    specificButUnsupportedMeanContextGrounding: specificButUnsupportedGrounding,
    groundingFailureRateDiagnostic: groundingFailuresDiagnostic,
    contradictedAnchorRateDiagnostic: contradictionsDiagnostic,
    falseProceedRateWeak: weakFalseProceed,
    permissiveRateWeak: weakPermissive,
    falseReconsiderRateStrong: strongFalseReconsider,
    policyViolationDetectionRate,
    rankAgreement: pairwiseRankAgreement,
    expectedBandMatchRate: rate(items.map((entry) => entry.expectedBandMatched)),
    policyExpectationMatchRate: rate(items.map((entry) => entry.policyExpectationMet)),
    calibrationCaveatTextPresent: items.every((entry) => entry.calibrationCaveatPresent),
    byLabel,
    bySplit,
    baselines: {
      alwaysProceed: baselineMetrics(items, "proceed"),
      alwaysProceedWithCaveats: baselineMetrics(items, "proceed_with_caveats"),
      alwaysReconsider: baselineMetrics(items, "reconsider"),
    },
    trivialFeatureMeans: featureMeans,
    controlComparisons: {
      shuffledMeanOverallSignal,
      shuffledDropFromOriginal: shuffledDrop,
      shuffledMeanContextGrounding,
      shuffledContextGroundingDropFromOriginal: shuffledContextGroundingDrop,
    },
    reviewNeededRate: aggregateReviewNeededRate,
    operatorReviewRequiredRate: aggregateOperatorReviewRequiredRate,
    recommendationConfusion: aggregateRecommendationConfusion,
    failureTaxonomy: aggregateFailureTaxonomy,
    rateIntervals,
    bootstrapIntervals,
    thresholdChecks: {
      minimumCaseCount: thresholdCheck({ actual: items.length, threshold: ">= 40", passed: items.length >= 40, effectiveN: items.length }),
      calibrationCaveatPresent: thresholdCheck({
        actual: items.every((entry) => entry.calibrationCaveatPresent) ? 1 : 0,
        threshold: "all items",
        passed: items.every((entry) => entry.calibrationCaveatPresent),
        effectiveN: items.length,
      }),
      strongWeakOverallSeparation: thresholdCheck({
        actual: strongWeakOverallSeparation,
        threshold: ">= 0.10",
        passed: strongWeakOverallSeparation === null ? null : strongWeakOverallSeparation >= 0.1,
        confidenceInterval: bootstrapIntervals.strongWeakOverallSeparation,
        effectiveN: strong.length + weak.length,
      }),
      strongWeakMarginSeparation: thresholdCheck({
        actual: strongWeakMarginSeparation,
        threshold: ">= 0.10",
        passed: strongWeakMarginSeparation === null ? null : strongWeakMarginSeparation >= 0.1,
        confidenceInterval: bootstrapIntervals.strongWeakMarginSeparation,
        effectiveN: strong.length + weak.length,
        severity: "warning",
        interpretation:
          "specificityMargin is retained for backward-compatible diagnostics only; failures warn on margin instability and do not establish production validity",
      }),
      strongWeakGroundingSeparation: thresholdCheck({
        actual: strongWeakGroundingSeparation,
        threshold: ">= 0.10",
        passed: strongWeakGroundingSeparation === null ? null : strongWeakGroundingSeparation >= 0.1,
        confidenceInterval: bootstrapIntervals.strongWeakGroundingSeparation,
        effectiveN: strong.length + weak.length,
      }),
      shuffledContextGroundingDrop: thresholdCheck({
        actual: shuffledContextGroundingDrop,
        threshold: ">= 0.20",
        passed: shuffledContextGroundingDrop === null ? null : shuffledContextGroundingDrop >= 0.2,
        effectiveN: complete.length,
      }),
      diagnosticMeanContextGrounding: thresholdCheck({
        actual: diagnosticGrounding,
        threshold: "<= 0.60",
        passed: diagnosticGrounding === null ? null : diagnosticGrounding <= 0.6,
        effectiveN: diagnostic.length,
      }),
      groundingFailureRateDiagnostic: thresholdCheck({
        actual: groundingFailuresDiagnostic,
        threshold: ">= 0.50",
        passed: groundingFailuresDiagnostic === null ? null : groundingFailuresDiagnostic >= 0.5,
        confidenceInterval: wilsonInterval(
          diagnostic.map((entry) => {
            const grounding = entry.report.grounding;
            if (!grounding) return false;
            return grounding.summary.present === 0 || grounding.summary.contradicted > 0;
          })
        ),
        effectiveN: diagnostic.length,
      }),
      falseProceedRateWeak: thresholdCheck({
        actual: weakFalseProceed,
        threshold: "<= 0.10",
        passed: weakFalseProceed === null ? null : weakFalseProceed <= 0.1,
        confidenceInterval: rateIntervals.falseProceedRateWeak,
        effectiveN: weak.length,
      }),
      permissiveRateWeak: thresholdCheck({
        actual: weakPermissive,
        threshold: "<= 0.45",
        passed: weakPermissive === null ? null : weakPermissive <= 0.45,
        confidenceInterval: rateIntervals.permissiveRateWeak,
        effectiveN: weak.length,
      }),
      falseReconsiderRateStrong: thresholdCheck({
        actual: strongFalseReconsider,
        threshold: "<= 0.17",
        passed: strongFalseReconsider === null ? null : strongFalseReconsider <= 0.17,
        confidenceInterval: rateIntervals.falseReconsiderRateStrong,
        effectiveN: strong.length,
      }),
      exploratoryFalseReconsiderRateStrong: thresholdCheck({
        actual: exploratorySplit?.falseReconsiderRateStrong ?? null,
        threshold: "<= 0.17",
        passed: exploratorySplit?.falseReconsiderRateStrong === undefined || exploratorySplit.falseReconsiderRateStrong === null ? null : exploratorySplit.falseReconsiderRateStrong <= 0.17,
        confidenceInterval: exploratorySplit?.rateIntervals.falseReconsiderRateStrong,
        effectiveN: exploratorySplit?.rateIntervals.falseReconsiderRateStrong.n,
      }),
      lockboxSpecificButUnsupportedZeroProceed: thresholdCheck({
        actual: lockboxSplit?.specificButUnsupportedProceedCount ?? null,
        threshold: "== 0",
        passed: lockboxSplit === undefined ? null : lockboxSplit.specificButUnsupportedProceedCount === 0,
        confidenceInterval: lockboxSplit?.rateIntervals.specificButUnsupportedProceedRate,
        effectiveN: lockboxSplit?.rateIntervals.specificButUnsupportedProceedRate.n,
      }),
      exploratorySpecificButUnsupportedZeroProceed: thresholdCheck({
        actual: exploratorySplit?.specificButUnsupportedProceedCount ?? null,
        threshold: "== 0",
        passed: exploratorySplit === undefined ? null : exploratorySplit.specificButUnsupportedProceedCount === 0,
        confidenceInterval: exploratorySplit?.rateIntervals.specificButUnsupportedProceedRate,
        effectiveN: exploratorySplit?.rateIntervals.specificButUnsupportedProceedRate.n,
      }),
      exploratoryDiagnosticStrongGroundingGap: thresholdCheck({
        actual: exploratorySplit?.diagnosticStrongGroundingGap ?? null,
        threshold: ">= 0.20",
        passed: exploratorySplit?.diagnosticStrongGroundingGap === undefined || exploratorySplit.diagnosticStrongGroundingGap === null ? null : exploratorySplit.diagnosticStrongGroundingGap >= 0.2,
        confidenceInterval: bootstrapIntervals.exploratoryDiagnosticStrongGroundingGap,
        effectiveN: exploratorySplit?.itemCount,
      }),
      lockboxRankAgreement: thresholdCheck({
        actual: lockboxSplit?.rankAgreement ?? null,
        threshold: ">= 0.55",
        passed: lockboxSplit?.rankAgreement === undefined || lockboxSplit.rankAgreement === null ? null : lockboxSplit.rankAgreement >= 0.55,
        effectiveN: lockboxSplit?.itemCount,
      }),
      lockboxUnsupportedGroundingLeakageWarning: thresholdCheck({
        actual: lockboxUnsupportedLeakage,
        threshold: "<= exploratory unsupported + 0.05",
        passed: lockboxUnsupportedLeakage === null ? null : lockboxUnsupportedLeakage <= 0.05,
        confidenceInterval: bootstrapIntervals.lockboxUnsupportedGroundingLeakageWarning,
        effectiveN: lockboxSplit?.itemCount,
        severity: "warning",
        interpretation:
          "split-level leakage warning; do not tune after lockbox observation, investigate with new exploratory fixtures before changing rules",
      }),
      policyViolationDetectionRate: thresholdCheck({
        actual: policyViolationDetectionRate,
        threshold: ">= 0.60",
        passed: policyViolationDetectionRate === null ? null : policyViolationDetectionRate >= 0.6,
        confidenceInterval: rateIntervals.policyViolationDetectionRate,
        effectiveN: policyViolationItems.length,
      }),
      rankAgreement: thresholdCheck({
        actual: pairwiseRankAgreement,
        threshold: ">= 0.60",
        passed: pairwiseRankAgreement === null ? null : pairwiseRankAgreement >= 0.6,
        effectiveN: items.length,
      }),
    },
    worstDisagreements: [...items]
      .sort((a, b) => b.expectedBandDistance - a.expectedBandDistance || (b.report.overallSignal ?? 0) - (a.report.overallSignal ?? 0))
      .slice(0, 5)
      .map((entry) => ({
        id: entry.case.id,
        label: entry.case.label,
        expected: entry.case.expectedRecommendationBands,
        actual: entry.report.recommendation,
        distance: entry.expectedBandDistance,
        signal: entry.report.overallSignal,
        notes: entry.case.notes,
      })),
  };
}

export function shuffledCases(cases: SreBenchmarkCase[]): SreBenchmarkCase[] {
  if (cases.length < 2) return [];
  return cases.map((testCase, index) => {
    let source = cases[(index + 1) % cases.length];
    for (let offset = 1; offset < cases.length; offset += 1) {
      const candidate = cases[(index + offset * 7) % cases.length];
      if (candidate.id !== testCase.id && candidate.label !== testCase.label && candidate.proposedAction.type !== testCase.proposedAction.type) {
        source = candidate;
        break;
      }
    }
    return {
      ...testCase,
      id: `${testCase.id}--shuffled-rationale`,
      rationale: source.rationale,
      notes: `${testCase.notes} Shuffled-control rationale source: ${source.id} (${source.label}, ${source.proposedAction.type}).`,
    };
  });
}

export async function runSreBenchmark(
  cases: SreBenchmarkCase[],
  options: SreBenchmarkRunOptions = {}
): Promise<SreBenchmarkResult> {
  const evaluator = options.evaluator ?? evaluateWithDeterministicProvider;
  const items = await Promise.all(cases.map(async (testCase) => itemFromReport(testCase, await evaluator(requestFromCase(testCase)))));

  let shuffledControlItems: SreBenchmarkItem[] = [];
  if (options.runShuffledControl !== false) {
    shuffledControlItems = await Promise.all(
      shuffledCases(cases).map(async (testCase) => itemFromReport(testCase, await evaluator(requestFromCase(testCase))))
    );
  }

  const shuffledMeanOverallSignal = mean(
    shuffledControlItems.map((entry) => entry.report.overallSignal).filter((value): value is number => typeof value === "number")
  );
  const shuffledMeanContextGrounding = contextGroundingMean(shuffledControlItems);

  return {
    calibration: "uncalibrated_internal_alpha",
    productSemantics: PRODUCT_SEMANTICS,
    generatedAt: new Date().toISOString(),
    inputCaseCount: cases.length,
    governance: benchmarkGovernance(cases, items, options),
    metrics: computeSreBenchmarkMetrics(items, { shuffledMeanOverallSignal, shuffledMeanContextGrounding }),
    items,
    shuffledControlItems,
  };
}

export async function loadSreBenchmarkFixture(fixturePath: string): Promise<SreBenchmarkFixture> {
  const rawFixture = await readFile(fixturePath, "utf8");
  return {
    cases: JSON.parse(rawFixture) as SreBenchmarkCase[],
    fixtureFullContentFingerprint: createHash("sha256").update(rawFixture).digest("hex"),
    fixtureFullContentHashAlgorithm: "sha256_raw_fixture_file",
  };
}

export async function loadSreBenchmarkCases(fixturePath: string): Promise<SreBenchmarkCase[]> {
  return (await loadSreBenchmarkFixture(fixturePath)).cases;
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function sanitizeSreBenchmarkMetrics(metrics: SreBenchmarkMetrics): SreBenchmarkMetrics {
  return {
    ...metrics,
    worstDisagreements: metrics.worstDisagreements.map((disagreement) => ({
      ...disagreement,
      notes: "case notes omitted from sanitized review output",
    })),
  };
}

function sanitizeBenchmarkCase(testCase: SreBenchmarkCase) {
  return {
    id: testCase.id,
    domain: testCase.domain,
    label: testCase.label,
    split: testCase.split,
    source: testCase.source,
    labelReviewer: testCase.labelReviewer,
    usedForEvaluatorTuning: testCase.usedForEvaluatorTuning,
    proposedAction: {
      type: testCase.proposedAction.type,
      target: testCase.proposedAction.target ?? null,
      riskLevel: testCase.proposedAction.riskLevel ?? null,
      parameterKeys: Object.keys(testCase.proposedAction.parameters ?? {}).sort(),
      hasExpectedEffect: typeof testCase.proposedAction.expectedEffect === "string",
    },
    expectedRecommendationBands: testCase.expectedRecommendationBands,
    nearNeighborAlternatives: testCase.nearNeighborAlternatives.map((neighbor) => ({
      type: neighbor.type,
      expectedSupport: neighbor.expectedSupport,
    })),
    policyExpectations: testCase.policyExpectations,
  };
}

function sanitizeSreBenchmarkReport(report: EvaluationReportV2) {
  return {
    traceId: report.traceId,
    status: report.status,
    recommendation: report.recommendation,
    calibration: report.calibration,
    overallSignal: report.overallSignal,
    subscores: report.subscores,
    support: report.support
      ? {
          originalSupport: report.support.originalSupport,
          strongestAlternativeSupport: report.support.strongestAlternativeSupport,
          specificityMargin: report.support.specificityMargin,
          strongestAlternativeId: report.support.strongestAlternativeId,
          marginReliability: report.support.marginReliability ?? null,
        }
      : null,
    grounding: report.grounding
      ? {
          score: report.grounding.score,
          summary: report.grounding.summary,
          anchors: report.grounding.anchors.map((anchor) => ({
            id: anchor.id,
            kind: anchor.kind,
            loadBearing: anchor.loadBearing,
            status: anchor.status,
            weight: anchor.weight,
            textHash: sha256Text(anchor.text),
            normalizedTextHash: sha256Text(anchor.normalizedText),
            contextEvidenceHash: anchor.contextEvidence ? sha256Text(anchor.contextEvidence) : null,
            contradictionEvidenceHash: anchor.contradictionEvidence ? sha256Text(anchor.contradictionEvidence) : null,
          })),
          noteCount: report.grounding.notes.length,
        }
      : null,
    policyFindings: report.policyFindings.map((finding) => ({ code: finding.code, severity: finding.severity })),
    topWeaknessCount: report.topWeaknesses.length,
    confidence: report.confidence,
    rubric: report.rubric,
    providerMetadata: report.providerMetadata,
    auditRef: report.auditRef,
    errorCount: report.errors.length,
    errorHashes: report.errors.map(sha256Text),
    productSemantics: report.productSemantics,
    readiness: report.readiness,
    createdAt: report.createdAt,
  };
}

function sanitizeSreBenchmarkItem(entry: SreBenchmarkItem) {
  return {
    case: sanitizeBenchmarkCase(entry.case),
    report: sanitizeSreBenchmarkReport(entry.report),
    expectedBandMatched: entry.expectedBandMatched,
    expectedBandDistance: entry.expectedBandDistance,
    policyExpectationMet: entry.policyExpectationMet,
    calibrationCaveatPresent: entry.calibrationCaveatPresent,
    trivialFeatures: entry.trivialFeatures,
  };
}

export function sanitizeSreBenchmarkResultForReview(result: SreBenchmarkResult) {
  return {
    calibration: result.calibration,
    productSemantics: result.productSemantics,
    generatedAt: result.generatedAt,
    inputCaseCount: result.inputCaseCount,
    governance: result.governance,
    sanitization: {
      rawFixtureProseIncluded: false,
      rawGroundingEvidenceIncluded: false,
      outputPurpose: "review_summary_not_fixture_replay",
      omittedRawFields: [
        "case.context",
        "case.rationale",
        "case.notes",
        "report.toulmin",
        "report.alternatives",
        "report.grounding.anchors.text",
        "report.grounding.anchors.contextEvidence",
        "report.grounding.anchors.contradictionEvidence",
        "report.policyFindings.message",
        "report.topWeaknesses",
        "report.errors",
      ],
    },
    metrics: sanitizeSreBenchmarkMetrics(result.metrics),
    items: result.items.map(sanitizeSreBenchmarkItem),
    shuffledControlItems: result.shuffledControlItems.map(sanitizeSreBenchmarkItem),
  };
}

export async function writeSreBenchmarkOutputs(result: SreBenchmarkResult, outputDir: string): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "result.json");
  const markdownPath = path.join(outputDir, "summary.md");
  await writeFile(jsonPath, `${JSON.stringify(sanitizeSreBenchmarkResultForReview(result), null, 2)}\n`);
  await writeFile(markdownPath, renderSreBenchmarkMarkdown(result));
  return { jsonPath, markdownPath };
}

export function renderSreBenchmarkStdoutSummary(result: SreBenchmarkResult, outputs: { jsonPath: string; markdownPath: string }): string {
  const failedThresholds = Object.entries(result.metrics.thresholdChecks).filter(([, check]) => check.passed === false);
  const failedSummary = failedThresholds.length
    ? `${failedThresholds.length} (${failedThresholds.map(([name, check]) => `${name}:${check.severity}`).join(", ")})`
    : "0";
  return [
    "SRE benchmark complete",
    `Calibration: ${result.calibration}`,
    `Cases: ${result.metrics.itemCount} (${result.metrics.completeCount} complete)`,
    `Mean overall signal: ${fmt(result.metrics.meanOverallSignal)}`,
    `Mean context grounding: ${fmt(result.metrics.meanContextGrounding)}`,
    `Strong/weak separation: ${fmt(result.metrics.strongWeakOverallSeparation)}`,
    `Strong/weak grounding separation: ${fmt(result.metrics.strongWeakGroundingSeparation)}`,
    `Weak false-proceed rate: ${fmt(result.metrics.falseProceedRateWeak)}`,
    `Permissive weak rate: ${fmt(result.metrics.permissiveRateWeak)}`,
    `Strong false-reconsider rate: ${fmt(result.metrics.falseReconsiderRateStrong)}`,
    `Review-needed rate: ${fmt(result.metrics.reviewNeededRate)}`,
    `Operator-review-required rate: ${fmt(result.metrics.operatorReviewRequiredRate)}`,
    `Policy violation detection rate: ${fmt(result.metrics.policyViolationDetectionRate)}`,
    `Rank agreement: ${fmt(result.metrics.rankAgreement)}`,
    `Shuffled-rationale drop: ${fmt(result.metrics.controlComparisons.shuffledDropFromOriginal)}`,
    `Shuffled-rationale grounding drop: ${fmt(result.metrics.controlComparisons.shuffledContextGroundingDropFromOriginal)}`,
    `Failed threshold checks: ${failedSummary}`,
    `JSON: ${outputs.jsonPath}`,
    `Markdown: ${outputs.markdownPath}`,
    "",
  ].join("\n");
}

function fmt(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(4);
}

function fmtInterval(interval: RateInterval | BootstrapInterval | undefined): string {
  if (!interval) return "n/a";
  return `${interval.method} n=${interval.n} estimate=${fmt(interval.estimate)} [${fmt(interval.lower)}, ${fmt(interval.upper)}]`;
}

export function renderSreBenchmarkMarkdown(result: SreBenchmarkResult): string {
  const lines: string[] = [];
  lines.push("# SRE Rationale-Action Specificity Benchmark Summary");
  lines.push("");
  lines.push(`Generated: ${result.generatedAt}`);
  lines.push(`Calibration: ${result.calibration}`);
  lines.push(`Benchmark schema: ${result.governance.benchmarkSchemaVersion}`);
  lines.push(`Non-prose fixture manifest fingerprint: ${result.governance.fixtureCaseManifestFingerprint}`);
  lines.push(`Full fixture content fingerprint: ${result.governance.fixtureFullContentFingerprint} (${result.governance.fixtureFullContentHashAlgorithm})`);
  lines.push(`Evaluator fingerprints: ${result.governance.evaluatorFingerprints.join(", ")}`);
  lines.push(
    `Lockbox process attestation source: ${result.governance.lockboxProcess.attestationSource}; raw prose inspected: ${result.governance.lockboxProcess.rawLockboxContextOrRationaleInspectedForThisRun ?? "not recorded"}; rules frozen: ${result.governance.lockboxProcess.rulesFrozenBeforeLockboxEvaluation ?? "not recorded"}`
  );
  lines.push("Sanitized review JSON omits raw fixture context/rationale prose and raw grounding evidence; hashes are provided for traceability without replaying the fixture.");
  lines.push("");
  lines.push(result.productSemantics);
  lines.push("");
  lines.push("## Headline Metrics");
  lines.push("");
  lines.push(`- Cases: ${result.metrics.itemCount} (${result.metrics.completeCount} complete)`);
  lines.push(`- Mean overall signal: ${fmt(result.metrics.meanOverallSignal)}`);
  lines.push(`- Mean context grounding: ${fmt(result.metrics.meanContextGrounding)}`);
  lines.push(`- Strong/weak signal separation: ${fmt(result.metrics.strongWeakOverallSeparation)}`);
  lines.push(`- Strong/weak specificity-margin separation: ${fmt(result.metrics.strongWeakMarginSeparation)}`);
  lines.push(`- Strong/weak context-grounding separation: ${fmt(result.metrics.strongWeakGroundingSeparation)}`);
  lines.push(`- Core weak signal separation (excludes unsupported/mismatched diagnostics): ${fmt(result.metrics.coreWeakOverallSeparation)}`);
  lines.push(`- Diagnostic mean signal for specific-but-unsupported/action-mismatched cases: ${fmt(result.metrics.diagnosticMeanOverallSignal)}`);
  lines.push(`- Diagnostic mean context grounding for specific-but-unsupported/action-mismatched cases: ${fmt(result.metrics.diagnosticMeanContextGrounding)}`);
  lines.push(`- Specific-but-unsupported mean context grounding: ${fmt(result.metrics.specificButUnsupportedMeanContextGrounding)}`);
  lines.push(`- Diagnostic grounding failure rate: ${fmt(result.metrics.groundingFailureRateDiagnostic)}`);
  lines.push(`- Diagnostic contradicted-anchor rate: ${fmt(result.metrics.contradictedAnchorRateDiagnostic)}`);
  lines.push(`- False-proceed rate on weak/adversarial/policy cases: ${fmt(result.metrics.falseProceedRateWeak)}`);
  lines.push(`- Permissive weak rate (proceed or proceed_with_caveats): ${fmt(result.metrics.permissiveRateWeak)}`);
  lines.push(`- False-reconsider/escalate rate on strong cases: ${fmt(result.metrics.falseReconsiderRateStrong)}`);
  lines.push(`- Policy violation detection rate: ${fmt(result.metrics.policyViolationDetectionRate)}`);
  lines.push(`- Pairwise rank/order agreement: ${fmt(result.metrics.rankAgreement)}`);
  lines.push(`- Expected band match rate: ${fmt(result.metrics.expectedBandMatchRate)}`);
  lines.push(`- Review-needed rate: ${fmt(result.metrics.reviewNeededRate)}`);
  lines.push(`- Operator-review-required rate: ${fmt(result.metrics.operatorReviewRequiredRate)}`);
  lines.push(`- Calibration caveat present in all items: ${result.metrics.calibrationCaveatTextPresent}`);
  lines.push(`- Shuffled-rationale mean signal: ${fmt(result.metrics.controlComparisons.shuffledMeanOverallSignal)}`);
  lines.push(`- Shuffled-rationale drop from original: ${fmt(result.metrics.controlComparisons.shuffledDropFromOriginal)}`);
  lines.push(`- Shuffled-rationale mean context grounding: ${fmt(result.metrics.controlComparisons.shuffledMeanContextGrounding)}`);
  lines.push(`- Shuffled-rationale context-grounding drop from original: ${fmt(result.metrics.controlComparisons.shuffledContextGroundingDropFromOriginal)}`);
  lines.push("");
  lines.push("## Internal Alpha Threshold Checks");
  lines.push("");
  for (const [name, check] of Object.entries(result.metrics.thresholdChecks)) {
    lines.push(
      `- ${name}: actual=${fmt(check.actual)}, threshold=${check.threshold}, passed=${check.passed}, severity=${check.severity}, interval=${fmtInterval(check.confidenceInterval)}. ${check.interpretation}`
    );
  }
  lines.push("");
  lines.push("## Confidence/Uncertainty Intervals");
  lines.push("");
  lines.push(
    "Wilson rate intervals and fixed-seed bootstrap intervals are reproducibility diagnostics for this small internal-alpha benchmark, not calibrated production confidence; bootstrap resampling uses the same documented seed across metrics for deterministic comparability."
  );
  lines.push("");
  for (const [name, interval] of Object.entries(result.metrics.rateIntervals)) {
    lines.push(`- ${name}: ${fmtInterval(interval)}`);
  }
  for (const [name, interval] of Object.entries(result.metrics.bootstrapIntervals)) {
    lines.push(`- ${name}: ${fmtInterval(interval)}`);
  }
  lines.push("");
  lines.push("## Confusion Matrix");
  lines.push("");
  lines.push(`- Total: ${result.metrics.recommendationConfusion.total}`);
  for (const [expected, row] of Object.entries(result.metrics.recommendationConfusion.rows)) {
    lines.push(`- expected ${expected}: ${JSON.stringify(row)}`);
  }
  lines.push("");
  lines.push("## Failure Taxonomy");
  lines.push("");
  for (const [key, count] of Object.entries(result.metrics.failureTaxonomy.counts)) {
    lines.push(`- ${key}: count=${count}, rate=${fmt(result.metrics.failureTaxonomy.rates[key as FailureTaxonomyKey])}`);
  }
  lines.push("");
  lines.push("## Split Metrics");
  lines.push("");
  lines.push("| Split | Count | Mean signal | Mean grounding | Review needed | Weak false-proceed | Weak permissive | Strong false-reconsider | Unsupported proceed count | Unsupported mean grounding | Diagnostic-vs-strong grounding gap | Diagnostic grounding failures | Diagnostic contradicted anchors | Rank agreement |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const [split, metrics] of Object.entries(result.metrics.bySplit)) {
    if (!metrics) continue;
    lines.push(
      `| ${split} | ${metrics.itemCount} | ${fmt(metrics.meanOverallSignal)} | ${fmt(metrics.meanContextGrounding)} | ${fmt(metrics.reviewNeededRate)} | ${fmt(metrics.falseProceedRateWeak)} | ${fmt(metrics.permissiveRateWeak)} | ${fmt(metrics.falseReconsiderRateStrong)} | ${metrics.specificButUnsupportedProceedCount} | ${fmt(metrics.unsupportedMeanContextGrounding)} | ${fmt(metrics.diagnosticStrongGroundingGap)} | ${fmt(metrics.groundingFailureRateDiagnostic)} | ${fmt(metrics.contradictedAnchorRateDiagnostic)} | ${fmt(metrics.rankAgreement)} |`
    );
  }
  lines.push("");
  lines.push("## Per-Label Metrics");
  lines.push("");
  lines.push("| Label | Count | Mean signal | Mean margin | Mean grounding | Recommendations |");
  lines.push("| --- | ---: | ---: | ---: | ---: | --- |");
  for (const [label, metrics] of Object.entries(result.metrics.byLabel)) {
    if (!metrics) continue;
    lines.push(
      `| ${label} | ${metrics.count} | ${fmt(metrics.meanOverallSignal)} | ${fmt(metrics.meanSpecificityMargin)} | ${fmt(metrics.meanContextGrounding)} | ${JSON.stringify(metrics.recommendations)} |`
    );
  }
  lines.push("");
  lines.push("## Baselines");
  lines.push("");
  for (const [name, metrics] of Object.entries(result.metrics.baselines)) {
    lines.push(
      `- ${name}: expected-band match ${fmt(metrics.expectedBandMatchRate)}, weak false-proceed ${fmt(metrics.falseProceedRateWeak)}, strong false-reconsider ${fmt(metrics.falseReconsiderRateStrong)}`
    );
  }
  lines.push("");
  lines.push("## Worst Disagreements");
  lines.push("");
  for (const disagreement of result.metrics.worstDisagreements) {
    lines.push(
      `- ${disagreement.id}: label=${disagreement.label}, expected=${disagreement.expected.join("/")}, actual=${disagreement.actual}, signal=${fmt(disagreement.signal)}, distance=${disagreement.distance}. ${disagreement.notes}`
    );
  }
  lines.push("");
  lines.push("## Interpretation Caveat");
  lines.push("");
  lines.push(
    "These results are internal-alpha evidence about a static SRE rationale-action specificity signal and deterministic context-grounding proxy. The grounding metrics are non-causal and non-authoritative; they cannot prove correctness, cannot validate hidden reasoning faithfulness, and are not a substitute for operator review or readiness for autonomous production gating."
  );
  lines.push("");
  return `${lines.join("\n")}\n`;
}
