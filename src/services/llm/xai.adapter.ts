import OpenAI from "openai";
import type { ProviderMetadata } from "../../evaluation/types.js";
import type { JsonGenerationRequest } from "./types.js";
import { LlmSupportEvaluationProvider, parseJsonObject } from "./support-assessment.js";

export class XaiEvaluationProvider extends LlmSupportEvaluationProvider {
  metadata: ProviderMetadata;
  private readonly client: OpenAI;

  constructor(apiKey: string, model = "grok-3") {
    super();
    this.client = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });
    this.metadata = {
      provider: "grok",
      model,
      roles: {
        alternativeGenerator: "deterministic_near_neighbor",
        supportScorer: "grok_support_scorer",
      },
      deterministic: false,
    };
  }

  async generateJson<T>(request: JsonGenerationRequest): Promise<T> {
    const response = await this.client.chat.completions.create(
      {
        model: this.metadata.model,
        temperature: 0,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: request.schemaName,
            strict: true,
            schema: request.schema,
          },
        },
      } as any,
      { signal: request.signal } as any
    );

    const text = response.choices[0]?.message?.content;
    return parseJsonObject(text ?? "{}") as T;
  }
}
