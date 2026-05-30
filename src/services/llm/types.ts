import type {
  AlternativeAction,
  EvaluationRequestV2,
  ProviderMetadata,
  SupportAssessment,
} from "../../evaluation/types.js";

export type LlmProviderName = "claude" | "grok" | "gemini" | "deterministic";

export interface EvaluationProvider {
  metadata: ProviderMetadata;
  assessSupport(
    request: EvaluationRequestV2,
    alternatives: AlternativeAction[],
    signal?: AbortSignal
  ): Promise<SupportAssessment>;
}

export type JsonSchemaPrimitiveType = "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";

export interface JsonSchema {
  type?: JsonSchemaPrimitiveType | JsonSchemaPrimitiveType[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  enum?: unknown[];
}

export interface JsonGenerationRequest {
  system: string;
  prompt: string;
  schemaName: string;
  schema: JsonSchema;
  signal?: AbortSignal;
}

export interface JsonLlmAdapter {
  metadata: ProviderMetadata;
  generateJson<T>(request: JsonGenerationRequest): Promise<T>;
}

export interface ProviderResolutionConfig {
  provider: LlmProviderName;
  model: string;
  apiKey?: string;
  keySource?: string;
}
