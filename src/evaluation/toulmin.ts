import type { LinguisticSpecificityScore, ToulminArgument } from "./types.js";

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;
const NUMBER_PATTERN = /\b\d+(?:\.\d+)?\s*(?:%|ms|s|m|h|minutes?|hours?|days?|x|mb|gb|iops)?\b/gi;
const CAUSAL = /\b(because|therefore|so that|causes?|causing|driving|blocks?|blocking|releases?|prevents?|addresses?|due to|leads to)\b/gi;
const DOMAIN = /\b(vacuum|lock|locks|idle in transaction|i\/o|io wait|latency|error rate|deployment|rollback|iops|sessions?|cpu|memory|saturation|blast radius)\b/gi;
const DOMAIN_TEST = /\b(vacuum|lock|locks|idle in transaction|i\/o|io wait|latency|error rate|deployment|rollback|iops|sessions?|cpu|memory|saturation|blast radius)\b/i;
const ACTION = /\b(terminate|rollback|restart|scale|increase|page|release|drain|throttle)\b/gi;
const EVIDENCE = /\b(shows?|observed|measured|metric|trace|logs?|pg_stat_activity|alert|threshold|older than|after)\b/gi;
const HEDGES = /\b(maybe|might|could|seems?|probably|looks|feel|guess)\b/gi;

function matches(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[0]);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function scoreLinguisticSpecificity(rationale: string): LinguisticSpecificityScore {
  const features = {
    numericThresholds: matches(rationale, NUMBER_PATTERN).length,
    causalConnectors: matches(rationale, CAUSAL).length,
    domainTerms: matches(rationale, DOMAIN).length,
    actionTerms: matches(rationale, ACTION).length,
    evidenceMarkers: matches(rationale, EVIDENCE).length,
    hedgeTerms: matches(rationale, HEDGES).length,
  };

  const positive =
    Math.min(features.numericThresholds, 3) * 0.14 +
    Math.min(features.causalConnectors, 4) * 0.12 +
    Math.min(features.domainTerms, 6) * 0.07 +
    Math.min(features.actionTerms, 3) * 0.08 +
    Math.min(features.evidenceMarkers, 4) * 0.08;
  const penalty = Math.min(features.hedgeTerms, 4) * 0.08;
  const value = clamp01(0.18 + positive - penalty);

  const notes: string[] = [];
  if (features.numericThresholds > 0) notes.push("contains thresholds or counts");
  if (features.causalConnectors > 0) notes.push("contains causal connectors");
  if (features.domainTerms > 0) notes.push("contains domain-specific terms");
  if (features.hedgeTerms > 0) notes.push("contains hedging language");

  return { value, features, notes };
}

export function extractToulminArgument(rationale: string): ToulminArgument {
  const sentences = rationale.split(SENTENCE_SPLIT).map((part) => part.trim()).filter(Boolean);
  const claim =
    sentences.find((sentence) => /\b(terminating|terminate|rollback|restart|scale|increase|page)\b/i.test(sentence)) ??
    sentences[0] ??
    rationale;
  const grounds = sentences.filter((sentence) => /\b(shows?|because|older than|holding|blocking|metric|logs?|alert|\d)/i.test(sentence));
  const warrants = sentences.filter((sentence) => /\b(releases?|addresses?|causes?|therefore|so that|driving|prevents?)\b/i.test(sentence));
  const backing = sentences.filter((sentence) => DOMAIN_TEST.test(sentence));
  const qualifiers = Array.from(new Set(matches(rationale, NUMBER_PATTERN).map((item) => item.trim())));
  const rebuttals = sentences.filter((sentence) => /\b(rather than|instead of|unless|except|however|but)\b/i.test(sentence));

  return {
    claim,
    grounds,
    warrants,
    backing,
    qualifiers,
    rebuttals,
    specificity: scoreLinguisticSpecificity(rationale),
  };
}
