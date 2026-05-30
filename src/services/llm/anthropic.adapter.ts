import Anthropic from "@anthropic-ai/sdk";
import type { ProviderMetadata } from "../../evaluation/types.js";
import type { JsonGenerationRequest } from "./types.js";
import { LlmSupportEvaluationProvider, parseJsonObject } from "./support-assessment.js";

function textFromAnthropicContent(content: unknown[]): string {
  return content
    .map((block) => {
      if (block && typeof block === "object" && "text" in block && typeof (block as { text?: unknown }).text === "string") {
        return (block as { text: string }).text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export class AnthropicEvaluationProvider extends LlmSupportEvaluationProvider {
  metadata: ProviderMetadata;
  private readonly client: Anthropic;

  constructor(apiKey: string, model = "claude-sonnet-4-5") {
    super();
    this.client = new Anthropic({ apiKey });
    this.metadata = {
      provider: "claude",
      model,
      roles: {
        alternativeGenerator: "deterministic_near_neighbor",
        supportScorer: "claude_support_scorer",
      },
      deterministic: false,
    };
  }

  async generateJson<T>(request: JsonGenerationRequest): Promise<T> {
    const toolName = `emit_${request.schemaName}`;
    const response = await this.client.messages.create(
      {
        model: this.metadata.model,
        max_tokens: 1200,
        temperature: 0,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        tools: [
          {
            name: toolName,
            description: `Return the ${request.schemaName} JSON object.`,
            input_schema: request.schema,
          },
        ],
        tool_choice: { type: "tool", name: toolName },
      } as any,
      { signal: request.signal } as any
    );

    const toolUse = response.content.find(
      (block: any) => block?.type === "tool_use" && block?.name === toolName && typeof block?.input === "object"
    ) as { input?: unknown } | undefined;
    if (toolUse?.input) return toolUse.input as T;

    return parseJsonObject(textFromAnthropicContent(response.content as unknown[])) as T;
  }
}
