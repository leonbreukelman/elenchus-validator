import { GoogleGenAI, Type } from "@google/genai";
import type { AlternativeAction, EvaluationRequestV2, ProviderMetadata, SupportAssessment } from "./types.js";
import { DETERMINISTIC_PROVIDER_METADATA } from "./report.js";
import { actionTerms } from "./actions.js";

export interface EvaluationProvider {
  metadata: ProviderMetadata;
  assessSupport(
    request: EvaluationRequestV2,
    alternatives: AlternativeAction[],
    signal?: AbortSignal
  ): Promise<SupportAssessment>;
}

export class DeterministicEvaluationProvider implements EvaluationProvider {
  metadata = DETERMINISTIC_PROVIDER_METADATA;

  async assessSupport(request: EvaluationRequestV2, alternatives: AlternativeAction[]): Promise<SupportAssessment> {
    const rationale = request.rationale.toLowerCase();
    const originalActionTerms = actionTerms(request.proposedAction.type);
    const originalSupport = Math.min(1, 0.35 + originalActionTerms.filter((term) => rationale.includes(term)).length * 0.16);
    const alternativeScores = alternatives.map((alternative) => {
      const terms = actionTerms(alternative.action.type);
      return Math.min(0.82, 0.18 + terms.filter((term) => rationale.includes(term)).length * 0.16);
    });
    const strongestAlternativeSupport = alternativeScores.length > 0 ? Math.max(...alternativeScores) : 0;
    const strongestIndex = alternativeScores.indexOf(strongestAlternativeSupport);

    return {
      originalSupport,
      strongestAlternativeSupport,
      specificityMargin: Number((originalSupport - strongestAlternativeSupport).toFixed(4)),
      strongestAlternativeId: strongestIndex >= 0 ? alternatives[strongestIndex].id : null,
      notes: ["Deterministic local support score; no provider calibration claim."],
    };
  }
}

export class GeminiEvaluationProvider implements EvaluationProvider {
  metadata: ProviderMetadata;
  private readonly ai: GoogleGenAI;

  constructor(apiKey: string, model = "gemini-3-flash-preview") {
    this.ai = new GoogleGenAI({ apiKey });
    this.metadata = {
      provider: "gemini",
      model,
      roles: {
        alternativeGenerator: "deterministic_near_neighbor",
        supportScorer: "gemini_support_scorer",
      },
      deterministic: false,
    };
  }

  async assessSupport(
    request: EvaluationRequestV2,
    alternatives: AlternativeAction[],
    signal?: AbortSignal
  ): Promise<SupportAssessment> {
    const response = await this.ai.models.generateContent({
      model: this.metadata.model,
      contents: `Assess whether the untrusted rationale specifically supports the proposed SRE action over near-neighbor alternatives.

UNTRUSTED_CONTEXT:
${request.context}

UNTRUSTED_PROPOSED_ACTION:
${JSON.stringify(request.proposedAction)}

UNTRUSTED_RATIONALE:
${request.rationale}

UNTRUSTED_ALTERNATIVES:
${JSON.stringify(alternatives)}

Return support values from 0 to 1. This is an uncalibrated internal-alpha rationale-action specificity signal, not a truth judgment.`,
      config: {
        abortSignal: signal,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            originalSupport: { type: Type.NUMBER },
            strongestAlternativeSupport: { type: Type.NUMBER },
            specificityMargin: { type: Type.NUMBER },
            strongestAlternativeId: { type: Type.STRING },
            notes: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["originalSupport", "strongestAlternativeSupport", "specificityMargin", "notes"],
        },
      },
    });
    return validateSupportAssessment(JSON.parse(response.text ?? "{}"), alternatives);
  }
}

function finite01(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`provider returned invalid ${field}`);
  }
  return value;
}

export function validateSupportAssessment(value: unknown, alternatives: AlternativeAction[]): SupportAssessment {
  if (!value || typeof value !== "object") {
    throw new Error("provider returned invalid support assessment");
  }
  const raw = value as Record<string, unknown>;
  const originalSupport = finite01(raw.originalSupport, "originalSupport");
  const strongestAlternativeSupport = finite01(raw.strongestAlternativeSupport, "strongestAlternativeSupport");
  const specificityMargin = typeof raw.specificityMargin === "number" && Number.isFinite(raw.specificityMargin)
    ? Math.max(-1, Math.min(1, raw.specificityMargin))
    : Number((originalSupport - strongestAlternativeSupport).toFixed(4));
  const allowedIds = new Set(alternatives.map((alternative) => alternative.id));
  const strongestAlternativeId = typeof raw.strongestAlternativeId === "string" && allowedIds.has(raw.strongestAlternativeId)
    ? raw.strongestAlternativeId
    : null;
  const notes = Array.isArray(raw.notes)
    ? raw.notes.filter((note): note is string => typeof note === "string").slice(0, 8)
    : [];
  return { originalSupport, strongestAlternativeSupport, specificityMargin, strongestAlternativeId, notes };
}

export function getDefaultProvider(): EvaluationProvider {
  const key = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (key && process.env.ELENCHUS_USE_GEMINI_V2 === "true") {
    return new GeminiEvaluationProvider(key);
  }
  return new DeterministicEvaluationProvider();
}
