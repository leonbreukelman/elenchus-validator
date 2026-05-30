import { AnthropicEvaluationProvider } from "./anthropic.adapter.js";
import { DeterministicEvaluationProvider } from "./deterministic.adapter.js";
import { GeminiEvaluationProvider } from "./gemini.adapter.js";
import type { EvaluationProvider, LlmProviderName, ProviderResolutionConfig } from "./types.js";
import { XaiEvaluationProvider } from "./xai.adapter.js";

export const DEFAULT_LLM_MODELS = {
  claude: "claude-sonnet-4-5",
  grok: "grok-3",
  gemini: "gemini-3-flash-preview",
  deterministic: "heuristic-v0",
} as const satisfies Record<LlmProviderName, string>;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeProviderName(value: string | undefined): LlmProviderName | undefined {
  const normalized = clean(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "claude" || normalized === "anthropic") return "claude";
  if (normalized === "grok" || normalized === "xai" || normalized === "x-ai") return "grok";
  if (normalized === "gemini" || normalized === "google") return "gemini";
  if (normalized === "deterministic" || normalized === "deterministic-local" || normalized === "local") return "deterministic";
  return undefined;
}

export function inferProviderFromPreferredModel(model: string | undefined): LlmProviderName | undefined {
  const value = clean(model)?.toLowerCase();
  if (!value) return undefined;
  const providerAlias = normalizeProviderName(value);
  if (providerAlias) return providerAlias;
  if (value.startsWith("claude")) return "claude";
  if (value.startsWith("grok")) return "grok";
  if (value.startsWith("gemini")) return "gemini";
  return undefined;
}

function isProviderSelector(value: string | undefined): boolean {
  return normalizeProviderName(value) !== undefined;
}

function apiKeyFor(provider: Exclude<LlmProviderName, "deterministic">, env: NodeJS.ProcessEnv): { apiKey?: string; keySource: string } {
  if (provider === "claude") return { apiKey: clean(env.ANTHROPIC_API_KEY), keySource: "ANTHROPIC_API_KEY" };
  if (provider === "grok") return { apiKey: clean(env.XAI_API_KEY), keySource: "XAI_API_KEY" };
  const geminiKey = clean(env.GEMINI_API_KEY);
  return geminiKey
    ? { apiKey: geminiKey, keySource: "GEMINI_API_KEY" }
    : { apiKey: clean(env.API_KEY), keySource: "API_KEY" };
}

function modelFor(provider: LlmProviderName, env: NodeJS.ProcessEnv): string {
  const preferred = clean(env.ELENCHUS_PREFERRED_MODEL);
  const inferredPreferredProvider = inferProviderFromPreferredModel(preferred);
  if (preferred && !isProviderSelector(preferred) && (!inferredPreferredProvider || inferredPreferredProvider === provider)) {
    return preferred;
  }
  if (provider === "claude") return clean(env.ANTHROPIC_MODEL) ?? DEFAULT_LLM_MODELS.claude;
  if (provider === "grok") return clean(env.XAI_MODEL) ?? DEFAULT_LLM_MODELS.grok;
  if (provider === "gemini") return clean(env.GEMINI_MODEL) ?? DEFAULT_LLM_MODELS.gemini;
  return DEFAULT_LLM_MODELS.deterministic;
}

function deterministicConfig(): ProviderResolutionConfig {
  return { provider: "deterministic", model: DEFAULT_LLM_MODELS.deterministic };
}

function llmConfig(provider: Exclude<LlmProviderName, "deterministic">, env: NodeJS.ProcessEnv): ProviderResolutionConfig {
  const { apiKey, keySource } = apiKeyFor(provider, env);
  if (!apiKey) {
    throw new Error(`ELENCHUS_LLM_PROVIDER=${provider} requires ${keySource}`);
  }
  return { provider, model: modelFor(provider, env), apiKey, keySource };
}

export function resolveDefaultProviderConfig(env: NodeJS.ProcessEnv = process.env): ProviderResolutionConfig {
  const rawProvider = clean(env.ELENCHUS_LLM_PROVIDER);
  const explicitProvider = normalizeProviderName(rawProvider);
  if (rawProvider && !explicitProvider) {
    throw new Error(`Unsupported ELENCHUS_LLM_PROVIDER=${rawProvider}; expected claude, grok, gemini, or deterministic`);
  }

  const preferredModel = clean(env.ELENCHUS_PREFERRED_MODEL);
  const preferredProvider = inferProviderFromPreferredModel(preferredModel);
  if (preferredModel && !preferredProvider && !explicitProvider) {
    throw new Error("ELENCHUS_PREFERRED_MODEL does not identify a provider family; set ELENCHUS_LLM_PROVIDER explicitly");
  }
  if (explicitProvider && preferredProvider && explicitProvider !== preferredProvider && preferredProvider !== "deterministic") {
    throw new Error(`ELENCHUS_LLM_PROVIDER=${explicitProvider} conflicts with ELENCHUS_PREFERRED_MODEL=${preferredModel}`);
  }

  if (explicitProvider === "deterministic") return deterministicConfig();
  if (explicitProvider) return llmConfig(explicitProvider, env);
  if (preferredProvider === "deterministic") return deterministicConfig();
  if (preferredProvider) return llmConfig(preferredProvider, env);

  if (clean(env.ANTHROPIC_API_KEY)) return llmConfig("claude", env);
  if (clean(env.XAI_API_KEY)) return llmConfig("grok", env);
  if (clean(env.GEMINI_API_KEY) || clean(env.API_KEY)) return llmConfig("gemini", env);
  return deterministicConfig();
}

export function createProviderFromConfig(config: ProviderResolutionConfig): EvaluationProvider {
  if (config.provider === "deterministic") return new DeterministicEvaluationProvider();
  if (!config.apiKey) throw new Error(`Provider ${config.provider} requires an API key`);
  if (config.provider === "claude") return new AnthropicEvaluationProvider(config.apiKey, config.model);
  if (config.provider === "grok") return new XaiEvaluationProvider(config.apiKey, config.model);
  return new GeminiEvaluationProvider(config.apiKey, config.model);
}

export function getDefaultProvider(env: NodeJS.ProcessEnv = process.env): EvaluationProvider {
  return createProviderFromConfig(resolveDefaultProviderConfig(env));
}
