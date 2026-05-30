import { GoogleGenAI, Type } from "@google/genai";
import type { ProviderMetadata } from "../../evaluation/types.js";
import type { JsonGenerationRequest, JsonSchema, JsonSchemaPrimitiveType } from "./types.js";
import { LlmSupportEvaluationProvider, parseJsonObject } from "./support-assessment.js";

const GEMINI_TYPE_BY_JSON_TYPE: Partial<Record<JsonSchemaPrimitiveType, Type>> = {
  object: Type.OBJECT,
  array: Type.ARRAY,
  string: Type.STRING,
  number: Type.NUMBER,
  integer: Type.INTEGER,
  boolean: Type.BOOLEAN,
};

function firstNonNullType(type: JsonSchema["type"]): JsonSchemaPrimitiveType | undefined {
  if (Array.isArray(type)) return type.find((item) => item !== "null");
  return type;
}

function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  const type = firstNonNullType(schema.type);
  const converted: Record<string, unknown> = {};
  if (type && GEMINI_TYPE_BY_JSON_TYPE[type]) converted.type = GEMINI_TYPE_BY_JSON_TYPE[type];
  if (schema.description) converted.description = schema.description;
  if (schema.enum) converted.enum = schema.enum;
  if (schema.required) converted.required = schema.required;
  if (schema.properties) {
    converted.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, toGeminiSchema(value)])
    );
  }
  if (schema.items) converted.items = toGeminiSchema(schema.items);
  return converted;
}

export class GeminiEvaluationProvider extends LlmSupportEvaluationProvider {
  metadata: ProviderMetadata;
  private readonly ai: GoogleGenAI;

  constructor(apiKey: string, model = "gemini-3-flash-preview") {
    super();
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

  async generateJson<T>(request: JsonGenerationRequest): Promise<T> {
    const response = await this.ai.models.generateContent({
      model: this.metadata.model,
      contents: request.prompt,
      config: {
        systemInstruction: request.system,
        abortSignal: request.signal,
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(request.schema) as any,
      },
    });
    return parseJsonObject(response.text ?? "{}") as T;
  }
}
