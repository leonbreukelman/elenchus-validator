import type {
  ContextGroundingAssessment,
  EvaluationRecommendation,
  EvaluationRequestV2,
  GroundingAnchor,
  GroundingAnchorKind,
  GroundingAnchorStatus,
  TypedAction,
} from "./types.js";

export const ANCHOR_WEIGHTS: Record<GroundingAnchorKind, number> = {
  numeric: 1,
  entity: 0.7,
  metric_state: 1.2,
  mechanism: 1.2,
};

export const RECOMMENDATION_GROUNDING_FLOORS: {
  contradictionCap: EvaluationRecommendation;
  lowGroundingThreshold: number;
  lowGroundingCap: EvaluationRecommendation;
  mediumGroundingThreshold: number;
  mediumGroundingCap: EvaluationRecommendation;
} = {
  contradictionCap: "reconsider",
  lowGroundingThreshold: 0.4,
  lowGroundingCap: "reconsider",
  mediumGroundingThreshold: 0.6,
  mediumGroundingCap: "proceed_with_caveats",
};

export const GROUNDING_SCORE_CAPS = {
  noAnchorFloor: 0.45,
  anchorlessContextCap: 0.25,
  contradictedHighWeightCap: 0.35,
  absentHalfWeightCap: 0.5,
  absentHighWeightMechanismCap: 0.65,
} as const;

export const GROUNDING_RULESET_FINGERPRINT = "grounding-v2-alpha-2026-05-03-context-grounding-remediation";

interface AnchorMetadata {
  family?: string;
  polarity?: "issue" | "normal" | "positive" | "negative";
  numericValue?: number;
  numericToken?: string;
  unit?: string;
}

type InternalAnchor = GroundingAnchor & AnchorMetadata;

interface MetricFamily {
  name: string;
  terms: RegExp[];
  issueTerms: RegExp[];
  normalTerms: RegExp[];
}

interface MechanismFamily {
  name: string;
  positive: RegExp[];
  negative: RegExp[];
}

const NUMERIC_PATTERN = /\b\d+(?:\.\d+)?\s*(?:%|ms|s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|days?|x|mb|gb|iops)?\b/gi;
const ENTITY_PATTERN = /\b[a-z][a-z0-9]+(?:[-_][a-z0-9]+)+\b/gi;
const ACTION_ENTITY_EXCLUSIONS = new Set([
  "rollback_deployment",
  "terminate_idle_sessions",
  "restart_service",
  "scale_service",
  "increase_iops",
  "page_human",
  "investigate_more",
  "no_action",
  "deployment",
  "release-correlated",
  "releases",
]);

// Small SRE-general synonym table frozen before benchmark inspection. These are
// intentionally broad incident-response families, not fixture-specific phrases.
const METRIC_FAMILIES: MetricFamily[] = [
  {
    name: "latency",
    terms: [/\bp\d+\s+latency\b/i, /\blatency\b/i, /\bresponse\s+time\b/i],
    issueTerms: [/\b(rose|rising|increased?|elevated|high|slow|degraded|regression|spike|spiking)\b/i, /\b\d+(?:\.\d+)?\s*ms\b/i],
    normalTerms: [/\b(normal|steady|baseline|unchanged|healthy|nominal|low)\b/i],
  },
  {
    name: "errors",
    terms: [/\b5xx\b/i, /\berror\s+rate\b/i, /\berrors?\b/i],
    issueTerms: [/\b(rose|rising|increased?|elevated|high|degraded|regression|spike|spiking|affects?)\b/i, /\b\d+(?:\.\d+)?\s*%\b/i],
    normalTerms: [/\b(normal|steady|baseline|unchanged|healthy|nominal|low)\b/i],
  },
  {
    name: "cpu",
    terms: [/\bcpu\b/i, /\bprocessor\b/i],
    issueTerms: [/\b(saturation|saturated|pressure|contention|high|elevated|hot|pegged)\b/i, /\b\d+(?:\.\d+)?\s*%\b/i],
    normalTerms: [/\b(normal|healthy|idle|low|nominal|absent|no\s+cpu\s+saturation)\b/i],
  },
  {
    name: "memory",
    terms: [/\bmemory\b/i, /\bheap\b/i, /\boom\b/i],
    issueTerms: [/\b(leak|pressure|exhaustion|grows?|growth|saturation|high|elevated|oom)\b/i, /\b\d+(?:\.\d+)?\s*(?:mb|gb)\b/i],
    normalTerms: [/\b(normal|healthy|steady|baseline|absent|no\s+memory\s+pressure|no\s+memory\s+leak)\b/i],
  },
  {
    name: "io",
    terms: [/\bi\/o\b/i, /\bio\s+wait\b/i, /\biowait\b/i, /\biops\b/i, /\bdisk\b/i, /\bstorage\b/i],
    issueTerms: [/\b(wait|saturation|saturated|bottleneck|high|elevated|exhausted|pressure|spike|spiking)\b/i, /\b\d+(?:\.\d+)?\s*(?:%|iops)\b/i],
    normalTerms: [/\b(normal|healthy|steady|baseline|unchanged|low|nominal)\b/i],
  },
  {
    name: "locks",
    terms: [/\blocks?\b/i, /\block\s+waits?\b/i, /\bidle\s+in\s+transaction\b/i, /\bvacuum\b/i],
    issueTerms: [/\b(blocking|blocked|holding|waits?|contention|older\s+than)\b/i, /\b\d+(?:\.\d+)?\s*(?:m|min|mins|minutes?|h|hours?)?\b/i],
    normalTerms: [/\b(no\s+locks?|no\s+lock\s+waits?|not\s+blocked|clear|healthy|normal)\b/i],
  },
  {
    name: "queue",
    terms: [/\bqueue\b/i, /\bbacklog\b/i],
    issueTerms: [/\b(depth|backlog|delay|delayed|growing|high|elevated|saturation)\b/i, /\b\d+(?:\.\d+)?\b/i],
    normalTerms: [/\b(normal|empty|steady|healthy|low|nominal)\b/i],
  },
  {
    name: "release",
    terms: [/\bdeploy(?:ment)?\b/i, /\brelease\b/i, /\brollout\b/i, /\bversion\b/i, /\bbuild\b/i],
    issueTerms: [/\b(after|latest|caused?|correlated|correlation|regression|change)\b/i],
    normalTerms: [/\b(no\s+(?:deploy|deployment|release|rollout|version|version\s+change)|quiet|empty|not\s+correlated|unrelated)\b/i],
  },
];

const MECHANISM_FAMILIES: MechanismFamily[] = [
  {
    name: "release_correlation",
    positive: [
      /\bafter\s+(?:the\s+)?(?:latest\s+)?(?:deploy|deployment|release|rollout)\b/i,
      /\b(?:deploy|deployment|release|rollout)[-\s]?correlat(?:ed|ion)\b/i,
      /\b(?:deploy|deployment|release|rollout)\s+(?:caused?|introduced|triggered)\b/i,
      /\bregression\b/i,
    ],
    negative: [
      /\bno\s+(?:deploy|deployment|release|rollout|version\s+change|version)\b/i,
      /\b(?:deploy|deployment|release|rollout)\s+(?:calendar\s+)?(?:quiet|empty)\b/i,
      /\bnot\s+(?:deploy|deployment|release|rollout)[-\s]?correlated\b/i,
      /\bchange\s+calendar\s+is\s+empty\b/i,
    ],
  },
  {
    name: "resource_contention",
    positive: [
      /\bresource\s+contention\b/i,
      /\b(?:cpu|memory|i\/o|io|disk|storage|capacity)\s+(?:saturation|pressure|contention|bottleneck|exhaustion)\b/i,
      /\bcapacity\s+(?:saturation|bottleneck|exhaustion)\b/i,
    ],
    negative: [
      /\bno\s+resource\s+saturation\b/i,
      /\b(?:cpu|memory|i\/o|io|disk|storage|capacity)\s+(?:is\s+)?(?:normal|healthy|nominal|steady|low)\b/i,
      /\bmemory\s+pressure\s+(?:is\s+)?absent\b/i,
      /\bno\s+memory\s+pressure\b/i,
    ],
  },
  {
    name: "lock_contention",
    positive: [
      /\bidle\s+in\s+transaction\b/i,
      /\bholding\s+locks?\b/i,
      /\bblocking\s+vacuum\b/i,
      /\bvacuum\s+is\s+blocked\b/i,
      /\block\s+waits?\b/i,
    ],
    negative: [/\bno\s+locks?\b/i, /\bno\s+lock\s+waits?\b/i, /\bvacuum\s+(?:is\s+)?not\s+blocked\b/i, /\bno\s+idle\s+in\s+transaction\b/i],
  },
  {
    name: "connection_pool",
    positive: [/\bconnection\s+pool\b/i, /\bpool\s+exhaustion\b/i, /\bpool\s+saturation\b/i],
    negative: [/\bno\s+connection\s+pool\s+(?:issue|exhaustion|saturation)\b/i, /\bconnection\s+pool\s+(?:is\s+)?(?:healthy|normal|steady)\b/i],
  },
  {
    name: "local_process_degradation",
    positive: [/\bmemory\s+leak\b/i, /\bheap\s+grows?\b/i, /\bpod\s+restarts?\s+clear\b/i, /\blocal\s+process\s+degradation\b/i, /\bstuck\s+worker\b/i],
    negative: [/\bno\s+memory\s+leak\b/i, /\brestarts?\s+(?:do|does)\s+not\s+clear\b/i, /\bworkers?\s+(?:are\s+)?healthy\b/i],
  },
  {
    name: "dependency_failure",
    positive: [/\bdependency\s+failure\b/i, /\bupstream\s+(?:failure|rate\s+limiting|errors?)\b/i, /\bdownstream\s+(?:failure|errors?)\b/i],
    negative: [/\bno\s+(?:upstream|downstream|dependency)\s+(?:failure|errors?|issue)\b/i],
  },
];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9%._/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function displayText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, round4(value)));
}

function clauses(text: string): string[] {
  return text
    .split(/[.;]\s+|\n+|,\s+(?=(?:and|because|so|but|rather|while|then)\b)/i)
    .map(displayText)
    .filter(Boolean);
}

function addAnchor(anchors: InternalAnchor[], draft: Omit<InternalAnchor, "id" | "status" | "contextEvidence" | "contradictionEvidence" | "weight" | "notes"> & { notes?: string[] }) {
  const key = `${draft.kind}:${draft.normalizedText}`;
  if (anchors.some((anchor) => `${anchor.kind}:${anchor.normalizedText}` === key)) return;
  anchors.push({
    id: `anchor-${anchors.length + 1}`,
    kind: draft.kind,
    text: displayText(draft.text),
    normalizedText: draft.normalizedText,
    loadBearing: draft.loadBearing,
    status: "absent",
    contextEvidence: null,
    contradictionEvidence: null,
    weight: ANCHOR_WEIGHTS[draft.kind],
    notes: draft.notes ?? [],
    family: draft.family,
    polarity: draft.polarity,
    numericValue: draft.numericValue,
    numericToken: draft.numericToken,
    unit: draft.unit,
  });
}

function metricFamiliesIn(text: string): MetricFamily[] {
  return METRIC_FAMILIES.filter((family) => family.terms.some((term) => regexTest(text, term)));
}

function mechanismFamiliesIn(text: string): MechanismFamily[] {
  return MECHANISM_FAMILIES.filter(
    (family) => family.positive.some((pattern) => regexTest(text, pattern)) && !family.negative.some((pattern) => regexTest(text, pattern))
  );
}

function regexMatches(text: string, pattern: RegExp): Array<{ index: number; text: string }> {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  return Array.from(text.matchAll(matcher))
    .filter((match) => match.index !== undefined)
    .map((match) => ({ index: match.index ?? 0, text: match[0] }));
}

function regexTest(text: string, pattern: RegExp): boolean {
  return new RegExp(pattern.source, pattern.flags.replace("g", "")).test(text);
}

function distanceToSpan(start: number, end: number, targetStart: number, targetEnd: number): number {
  if (end <= targetStart) return targetStart - end;
  if (start >= targetEnd) return start - targetEnd;
  return 0;
}

function boundaryPenaltyBetween(clause: string, start: number, end: number): number {
  const between = clause.slice(Math.max(0, start), Math.max(0, end));
  return /[,;]|\b(?:and|while|whereas|but|although)\b/i.test(between) ? 20 : 0;
}

function metricTermDistance(clause: string, termStart: number, termEnd: number, numericStart: number, numericEnd: number): number {
  const base = distanceToSpan(termStart, termEnd, numericStart, numericEnd);
  const boundaryPenalty =
    termEnd <= numericStart
      ? boundaryPenaltyBetween(clause, termEnd, numericStart)
      : termStart >= numericEnd
        ? boundaryPenaltyBetween(clause, numericEnd, termStart)
        : 0;
  return base + boundaryPenalty;
}

function numericBindingPatterns(family: MetricFamily): RegExp[] {
  if (family.name === "release") return family.terms;
  const descriptors = [...family.issueTerms, ...family.normalTerms].filter((pattern) => !pattern.source.includes("\\d"));
  return [...family.terms, ...descriptors];
}

function isIdentifierNumeric(clause: string, numericIndex: number, numericToken: string): boolean {
  const previous = clause[numericIndex - 1] ?? "";
  const next = clause[numericIndex + numericToken.length] ?? "";
  return /[-_a-z]/i.test(previous) || /[-_a-z]/i.test(next);
}

function familyPreferredByUnit(unit: string): string | undefined {
  if (["mb", "gb"].includes(unit)) return "memory";
  if (["ms"].includes(unit)) return "latency";
  if (["iops"].includes(unit)) return "io";
  return undefined;
}

function metricFamilyForNumeric(clause: string, numericIndex: number, numericToken: string): MetricFamily | undefined {
  const parsed = parseNumericToken(numericToken);
  const numericEnd = numericIndex + numericToken.length;
  if (/^\s*%?\s+of\b/i.test(clause.slice(numericEnd))) return undefined;
  const candidates = metricFamiliesIn(clause)
    .flatMap((family) =>
      numericBindingPatterns(family).flatMap((term) =>
        regexMatches(clause, term).map((match) => {
          const termEnd = match.index + match.text.length;
          const distance = metricTermDistance(clause, match.index, termEnd, numericIndex, numericEnd);
          return { family, distance, termStart: match.index, termEnd };
        })
      )
    )
    .sort((left, right) => left.distance - right.distance || left.termStart - right.termStart);

  if (candidates.length === 0) return undefined;

  const unitPreferred = familyPreferredByUnit(parsed.unit);
  if (unitPreferred) {
    const preferred = candidates.find((candidate) => candidate.family.name === unitPreferred);
    if (preferred && preferred.distance <= 40) return preferred.family;
  }

  const best = candidates[0];
  const secondFamily = candidates.find((candidate) => candidate.family.name !== best.family.name);
  if (secondFamily && best.distance > 12 && secondFamily.distance - best.distance <= 12) return undefined;
  return best.family;
}

interface MetricPolarityMatch {
  text: string;
  index: number;
  end: number;
  score: number;
}

interface MetricPolarityEvidence {
  family?: string;
  normal?: string;
  issue?: string;
  normalScore?: number;
  issueScore?: number;
}

function closestMetricFamilyDistance(text: string, family: MetricFamily, start: number, end: number): number | undefined {
  const familyMatches = family.terms.flatMap((term) => regexMatches(text, term));
  if (familyMatches.length === 0) return undefined;
  return Math.min(
    ...familyMatches.map((match) => {
      const familyEnd = match.index + match.text.length;
      return metricTermDistance(text, match.index, familyEnd, start, end);
    })
  );
}

function descriptorMatches(text: string, family: MetricFamily, patterns: RegExp[]): MetricPolarityMatch[] {
  return patterns
    .flatMap((pattern) =>
      regexMatches(text, pattern).flatMap((match) => {
        const end = match.index + match.text.length;
        const score = closestMetricFamilyDistance(text, family, match.index, end);
        return score === undefined ? [] : [{ text: match.text, index: match.index, end, score }];
      })
    )
    .sort((left, right) => left.score - right.score || left.index - right.index || left.text.length - right.text.length);
}

function suppressedByLocalNormal(issue: MetricPolarityMatch, normal: MetricPolarityMatch, text: string): boolean {
  const gap = distanceToSpan(issue.index, issue.end, normal.index, normal.end);
  if (gap > 18) return false;
  const betweenStart = issue.end <= normal.index ? issue.end : normal.end <= issue.index ? normal.end : Math.min(issue.index, normal.index);
  const betweenEnd = issue.end <= normal.index ? normal.index : normal.end <= issue.index ? issue.index : Math.max(issue.end, normal.end);
  return boundaryPenaltyBetween(text, betweenStart, betweenEnd) === 0;
}

function suppressedByLocalNegation(issue: MetricPolarityMatch, text: string): boolean {
  const left = text.slice(Math.max(0, issue.index - 28), issue.index);
  const right = text.slice(issue.end, Math.min(text.length, issue.end + 24));
  const leftHasNegation = /\b(?:no|not|without)\b/i.test(left) && !/[,;]|\b(?:but|while|whereas|although)\b/i.test(left);
  const rightHasNormalizer = /\b(?:absent|normal|healthy|clear)\b/i.test(right) && !/[,;]|\b(?:but|while|whereas|although)\b/i.test(right);
  return leftHasNegation || rightHasNormalizer;
}

function metricPolarityEvidence(text: string, family: MetricFamily): MetricPolarityEvidence {
  const familyMatches = family.terms.flatMap((term) => regexMatches(text, term));
  if (familyMatches.length === 0) return {};

  const normalMatches = descriptorMatches(text, family, family.normalTerms);
  const rawIssueMatches = descriptorMatches(text, family, family.issueTerms);
  const issueMatches = rawIssueMatches.filter(
    (issue) => !suppressedByLocalNegation(issue, text) && !normalMatches.some((normal) => suppressedByLocalNormal(issue, normal, text))
  );

  const evidence: MetricPolarityEvidence = { family: displayText(text) };
  if (normalMatches[0]) {
    evidence.normal = displayText(text);
    evidence.normalScore = normalMatches[0].score;
  }
  if (issueMatches[0]) {
    evidence.issue = displayText(text);
    evidence.issueScore = issueMatches[0].score;
  }
  return evidence;
}

function polarityForMetric(text: string, family: MetricFamily): "issue" | "normal" | undefined {
  const evidence = metricPolarityEvidence(text, family);
  if (evidence.issue && !evidence.normal) return "issue";
  if (evidence.normal && !evidence.issue) return "normal";
  if (evidence.issue && evidence.normal) {
    const issueScore = evidence.issueScore ?? Number.POSITIVE_INFINITY;
    const normalScore = evidence.normalScore ?? Number.POSITIVE_INFINITY;
    if (issueScore + 8 < normalScore) return "issue";
    if (normalScore <= issueScore + 15) return "normal";
    return "issue";
  }
  return undefined;
}

function parseNumericToken(token: string): { value: number; unit: string; canonical: string } {
  const value = Number.parseFloat(token);
  const unit = token.replace(/^\d+(?:\.\d+)?\s*/i, "").toLowerCase();
  return { value, unit, canonical: `${value}${unit}` };
}

function snippet(rawContext: string, pattern: RegExp | string): string | null {
  if (typeof pattern === "string") {
    const index = rawContext.toLowerCase().indexOf(pattern.toLowerCase());
    if (index < 0) return null;
    return displayText(rawContext.slice(Math.max(0, index - 50), Math.min(rawContext.length, index + pattern.length + 50)));
  }
  const match = rawContext.match(pattern);
  if (!match || match.index === undefined) return null;
  return displayText(rawContext.slice(Math.max(0, match.index - 50), Math.min(rawContext.length, match.index + match[0].length + 50)));
}

function sentenceForFamily(rawContext: string, familyName: string): string | null {
  const family = METRIC_FAMILIES.find((entry) => entry.name === familyName);
  const mechanism = MECHANISM_FAMILIES.find((entry) => entry.name === familyName);
  const parts = rawContext.split(/(?<=[.!?])\s+/).map(displayText).filter(Boolean);
  for (const part of parts) {
    if (
      family?.terms.some((term) => regexTest(part, term)) ||
      mechanism?.positive.some((term) => regexTest(part, term)) ||
      mechanism?.negative.some((term) => regexTest(part, term))
    ) {
      return part;
    }
  }
  return null;
}

function evidenceParts(rawText: string): string[] {
  return rawText.split(/(?<=[.!?])\s+|;\s+/).map(displayText).filter(Boolean);
}

function metricEvidence(rawContext: string, family: MetricFamily): { normal?: string; issue?: string; family?: string } {
  const evidence: { normal?: string; issue?: string; family?: string } = {};
  for (const part of evidenceParts(rawContext)) {
    const partEvidence = metricPolarityEvidence(part, family);
    if (!partEvidence.family) continue;
    evidence.family ??= partEvidence.family;
    if (partEvidence.normal) evidence.normal ??= partEvidence.normal;
    if (partEvidence.issue) evidence.issue ??= partEvidence.issue;
  }
  return evidence;
}

function mechanismEvidence(rawContext: string, family: MechanismFamily): { positive?: string; negative?: string } {
  const evidence: { positive?: string; negative?: string } = {};
  for (const part of evidenceParts(rawContext)) {
    const hasNegative = family.negative.some((term) => regexTest(part, term));
    const hasPositive = family.positive.some((term) => regexTest(part, term));
    if (hasNegative) evidence.negative ??= part;
    else if (hasPositive) evidence.positive ??= part;
  }
  return evidence;
}

function numericEntriesByFamily(rawText: string): Array<{ family?: string; value: number; unit: string; token: string; snippet: string }> {
  const entries: Array<{ family?: string; value: number; unit: string; token: string; snippet: string }> = [];
  for (const clause of clauses(rawText)) {
    const families = metricFamiliesIn(clause);
    if (families.length === 0) continue;
    for (const match of regexMatches(clause, NUMERIC_PATTERN)) {
      if (isIdentifierNumeric(clause, match.index, match.text)) continue;
      const parsed = parseNumericToken(match.text);
      const family = metricFamilyForNumeric(clause, match.index, match.text);
      entries.push({ family: family?.name, value: parsed.value, unit: parsed.unit, token: parsed.canonical, snippet: clause });
    }
  }
  return entries;
}

function numericCompatible(left: { value: number; unit: string }, right: { value: number; unit: string }): boolean {
  if (left.unit && right.unit && left.unit !== right.unit) return false;
  if (left.value === right.value) return true;
  const tolerance = Math.max(0.01, Math.abs(left.value) * 0.05);
  return Math.abs(left.value - right.value) <= tolerance;
}

function numericContradicts(left: { value: number; unit: string }, right: { value: number; unit: string }): boolean {
  if (left.unit && right.unit && left.unit !== right.unit) return false;
  const tolerance = Math.max(0.01, Math.abs(left.value) * 0.1);
  return Math.abs(left.value - right.value) > tolerance;
}

function contextHasAnyCheckableAnchor(context: string): boolean {
  return (
    regexTest(context, NUMERIC_PATTERN) ||
    regexTest(context, ENTITY_PATTERN) ||
    METRIC_FAMILIES.some((family) => family.terms.some((term) => regexTest(context, term))) ||
    MECHANISM_FAMILIES.some((family) => [...family.positive, ...family.negative].some((term) => regexTest(context, term)))
  );
}

export function extractGroundingAnchors(rationale: string, action?: TypedAction): GroundingAnchor[] {
  const anchors: InternalAnchor[] = [];
  const normalizedRationale = normalizeText(rationale);

  for (const clause of clauses(rationale)) {
    const families = metricFamiliesIn(clause);
    for (const match of regexMatches(clause, NUMERIC_PATTERN)) {
      // Anchorless numerics are only accepted when nearby SRE/action vocabulary makes them checkable.
      // This prevents arbitrary identifiers from becoming evidence while preserving common operational counts.
      if (families.length === 0 && !/\b(sessions?|locks?|deploy|deployment|release|build|version|queue|requests?)\b/i.test(clause)) continue;
      if (isIdentifierNumeric(clause, match.index, match.text)) continue;
      const parsed = parseNumericToken(match.text);
      const family = metricFamilyForNumeric(clause, match.index, match.text);
      addAnchor(anchors, {
        kind: "numeric",
        text: clause,
        normalizedText: family ? `${family.name}:${parsed.canonical}` : parsed.canonical,
        loadBearing: true,
        family: family?.name,
        numericValue: parsed.value,
        numericToken: parsed.canonical,
        unit: parsed.unit,
        notes: ["numeric load-bearing rationale anchor"],
      });
    }

    for (const family of families) {
      const polarity = polarityForMetric(clause, family);
      if (!polarity) continue;
      addAnchor(anchors, {
        kind: "metric_state",
        text: clause,
        normalizedText: `${family.name}:${polarity}`,
        loadBearing: true,
        family: family.name,
        polarity,
        notes: ["metric-state load-bearing rationale anchor"],
      });
    }

    for (const family of mechanismFamiliesIn(clause)) {
      addAnchor(anchors, {
        kind: "mechanism",
        text: clause,
        normalizedText: family.name,
        loadBearing: true,
        family: family.name,
        polarity: "positive",
        notes: ["mechanism load-bearing rationale anchor"],
      });
    }
  }

  const entityTexts = new Set<string>();
  for (const match of regexMatches(rationale, ENTITY_PATTERN)) entityTexts.add(match.text);
  for (const match of regexMatches(rationale, /\b(?:release|deploy|build|version)[-_ ]?[a-z0-9][a-z0-9._-]*\b/gi)) entityTexts.add(match.text);
  if (action?.target && normalizedRationale.includes(normalizeText(action.target))) entityTexts.add(action.target);

  for (const entity of Array.from(entityTexts)) {
    const normalized = normalizeText(entity);
    if (!normalized || ACTION_ENTITY_EXCLUSIONS.has(normalized)) continue;
    addAnchor(anchors, {
      kind: "entity",
      text: entity,
      normalizedText: normalized,
      loadBearing: true,
      notes: ["entity load-bearing rationale anchor"],
    });
  }

  return anchors.map(({ family: _family, polarity: _polarity, numericValue: _numericValue, numericToken: _numericToken, unit: _unit, ...anchor }) => anchor);
}

function classifyInternalAnchor(anchor: InternalAnchor, rawContext: string, normalizedContext: string, contextNumerics: ReturnType<typeof numericEntriesByFamily>): InternalAnchor {
  if (!normalizedContext) return { ...anchor, status: "absent" };

  if (anchor.kind === "entity") {
    const present = normalizedContext.includes(anchor.normalizedText);
    return present
      ? { ...anchor, status: "present", contextEvidence: snippet(rawContext, anchor.normalizedText) ?? sentenceForFamily(rawContext, anchor.normalizedText) }
      : { ...anchor, status: "absent" };
  }

  if (anchor.kind === "numeric") {
    const sameFamily = anchor.family ? contextNumerics.filter((entry) => entry.family === anchor.family) : contextNumerics;
    const sameValue = sameFamily.find((entry) =>
      anchor.numericValue === undefined || anchor.unit === undefined ? false : numericCompatible({ value: anchor.numericValue, unit: anchor.unit }, entry)
    );
    if (sameValue) return { ...anchor, status: "present", contextEvidence: sameValue.snippet };

    const contradicted = sameFamily.find((entry) =>
      anchor.numericValue === undefined || anchor.unit === undefined ? false : numericContradicts({ value: anchor.numericValue, unit: anchor.unit }, entry)
    );
    if (contradicted) return { ...anchor, status: "contradicted", contradictionEvidence: contradicted.snippet };

    if (!anchor.family && anchor.numericToken && normalizedContext.includes(anchor.numericToken)) {
      return { ...anchor, status: "present", contextEvidence: snippet(rawContext, anchor.numericToken) };
    }
    return { ...anchor, status: "absent" };
  }

  if (anchor.kind === "metric_state") {
    const family = METRIC_FAMILIES.find((entry) => entry.name === anchor.family);
    if (!family) return { ...anchor, status: "absent" };
    const evidence = metricEvidence(rawContext, family);
    if (!evidence.family) return { ...anchor, status: "absent" };
    if (anchor.polarity === "issue") {
      if (evidence.issue) return { ...anchor, status: "present", contextEvidence: evidence.issue };
      if (evidence.normal) return { ...anchor, status: "contradicted", contradictionEvidence: evidence.normal };
    }
    if (anchor.polarity === "normal") {
      if (evidence.normal) return { ...anchor, status: "present", contextEvidence: evidence.normal };
      if (evidence.issue) return { ...anchor, status: "contradicted", contradictionEvidence: evidence.issue };
    }
    return { ...anchor, status: "present", contextEvidence: evidence.family };
  }

  if (anchor.kind === "mechanism") {
    const family = MECHANISM_FAMILIES.find((entry) => entry.name === anchor.family);
    if (!family) return { ...anchor, status: "absent" };
    const evidence = mechanismEvidence(rawContext, family);
    if (evidence.positive) return { ...anchor, status: "present", contextEvidence: evidence.positive };
    if (evidence.negative) return { ...anchor, status: "contradicted", contradictionEvidence: evidence.negative };
    return { ...anchor, status: "absent" };
  }

  return { ...anchor, status: "absent" };
}

function restoreInternalMetadata(anchor: GroundingAnchor): InternalAnchor {
  const separator = anchor.normalizedText.indexOf(":");
  const family =
    anchor.kind === "entity"
      ? undefined
      : anchor.kind === "mechanism"
        ? anchor.normalizedText
        : separator >= 0
          ? anchor.normalizedText.slice(0, separator)
          : undefined;
  const suffix = separator >= 0 ? anchor.normalizedText.slice(separator + 1) : anchor.normalizedText;
  const parsed = anchor.kind === "numeric" ? parseNumericToken(suffix) : undefined;
  return {
    ...anchor,
    family,
    polarity: anchor.kind === "metric_state" ? (suffix as "issue" | "normal" | undefined) : anchor.kind === "mechanism" ? "positive" : undefined,
    numericValue: anchor.kind === "numeric" ? parsed?.value : undefined,
    numericToken: anchor.kind === "numeric" ? suffix : undefined,
    unit: anchor.kind === "numeric" ? parsed?.unit : undefined,
  };
}

export function classifyGroundingAnchors(context: string, anchors: GroundingAnchor[]): GroundingAnchor[] {
  const normalizedContext = normalizeText(context);
  const contextNumerics = numericEntriesByFamily(context);
  return anchors
    .map(restoreInternalMetadata)
    .map((anchor) => classifyInternalAnchor(anchor, context, normalizedContext, contextNumerics))
    .map(({ family: _family, polarity: _polarity, numericValue: _numericValue, numericToken: _numericToken, unit: _unit, ...anchor }) => anchor);
}

function summarize(anchors: GroundingAnchor[]): ContextGroundingAssessment["summary"] {
  const loadBearing = anchors.filter((anchor) => anchor.loadBearing);
  return {
    present: loadBearing.filter((anchor) => anchor.status === "present").length,
    absent: loadBearing.filter((anchor) => anchor.status === "absent").length,
    contradicted: loadBearing.filter((anchor) => anchor.status === "contradicted").length,
    loadBearing: loadBearing.length,
  };
}

function scoreAnchors(anchors: GroundingAnchor[], context: string, notes: string[]): number {
  const loadBearing = anchors.filter((anchor) => anchor.loadBearing);
  if (loadBearing.length === 0) {
    notes.push("No checkable load-bearing rationale anchors were extracted; grounding uses the no-anchor floor.");
    return GROUNDING_SCORE_CAPS.noAnchorFloor;
  }

  const totalWeight = loadBearing.reduce((sum, anchor) => sum + anchor.weight, 0);
  const absentWeight = loadBearing.filter((anchor) => anchor.status === "absent").reduce((sum, anchor) => sum + anchor.weight, 0);
  const weighted = loadBearing.reduce((sum, anchor) => {
    const contribution = anchor.status === "present" ? 1 : anchor.status === "absent" ? 0.25 : 0;
    return sum + contribution * anchor.weight;
  }, 0);

  let score = totalWeight === 0 ? GROUNDING_SCORE_CAPS.noAnchorFloor : weighted / totalWeight;
  const hasContradictedHighWeight = loadBearing.some((anchor) => anchor.status === "contradicted" && anchor.weight >= 1);
  const hasAbsentHighWeightMechanism = loadBearing.some((anchor) => anchor.kind === "mechanism" && anchor.status === "absent" && anchor.weight >= 1.2);

  if (!contextHasAnyCheckableAnchor(context) || loadBearing.every((anchor) => anchor.status === "absent")) {
    score = Math.min(score, GROUNDING_SCORE_CAPS.anchorlessContextCap);
    notes.push("Supplied context has no matching checkable anchors for the rationale.");
  }
  if (hasContradictedHighWeight) {
    score = Math.min(score, GROUNDING_SCORE_CAPS.contradictedHighWeightCap);
    notes.push("At least one high-weight load-bearing rationale anchor is contradicted by the supplied context.");
  }
  if (absentWeight >= totalWeight / 2) {
    score = Math.min(score, GROUNDING_SCORE_CAPS.absentHalfWeightCap);
    notes.push("At least half of load-bearing rationale anchor weight is absent from the supplied context.");
  }
  if (hasAbsentHighWeightMechanism) {
    score = Math.min(score, GROUNDING_SCORE_CAPS.absentHighWeightMechanismCap);
    notes.push("A high-weight load-bearing mechanism is not supported by the supplied context.");
  }

  return clamp01(score);
}

export function assessContextGrounding(request: EvaluationRequestV2): ContextGroundingAssessment {
  const extracted = extractGroundingAnchors(request.rationale, request.proposedAction);
  const classified = classifyGroundingAnchors(request.context, extracted);
  const notes = [
    "Deterministic context-grounding proxy over supplied context only; not objective truth validation.",
  ];
  const score = scoreAnchors(classified, request.context, notes);
  return {
    score,
    anchors: classified,
    summary: summarize(classified),
    notes,
  };
}
