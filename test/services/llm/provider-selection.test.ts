import { describe, expect, it } from "vitest";
import {
  getDefaultProvider,
  resolveDefaultProviderConfig,
} from "../../../src/services/llm/providers.js";

const emptyEnv = {} as NodeJS.ProcessEnv;
const fakeProviderKey = (provider: "anthropic" | "xai" | "gemini") => `${provider}-` + "test-key";

describe("Phase 1 LLM provider selection", () => {
  it("falls back to deterministic local scoring when no provider keys are present", () => {
    const config = resolveDefaultProviderConfig(emptyEnv);
    const provider = getDefaultProvider(emptyEnv);

    expect(config).toMatchObject({ provider: "deterministic", model: "heuristic-v0" });
    expect(provider.metadata).toMatchObject({ provider: "deterministic-local", deterministic: true });
  });

  it("selects Claude first when Anthropic, xAI, and Gemini keys are all present", () => {
    const config = resolveDefaultProviderConfig({
      ANTHROPIC_API_KEY: fakeProviderKey("anthropic"),
      XAI_API_KEY: fakeProviderKey("xai"),
      GEMINI_API_KEY: fakeProviderKey("gemini"),
    } as NodeJS.ProcessEnv);
    const provider = getDefaultProvider({
      ANTHROPIC_API_KEY: fakeProviderKey("anthropic"),
      XAI_API_KEY: fakeProviderKey("xai"),
      GEMINI_API_KEY: fakeProviderKey("gemini"),
    } as NodeJS.ProcessEnv);

    expect(config.provider).toBe("claude");
    expect(provider.metadata).toMatchObject({ provider: "claude", deterministic: false });
    expect(provider.metadata.roles.supportScorer).toBe("claude_support_scorer");
  });

  it("selects Grok when Claude is unavailable and xAI is configured", () => {
    const config = resolveDefaultProviderConfig({
      XAI_API_KEY: fakeProviderKey("xai"),
      GEMINI_API_KEY: fakeProviderKey("gemini"),
    } as NodeJS.ProcessEnv);
    const provider = getDefaultProvider({
      XAI_API_KEY: fakeProviderKey("xai"),
      GEMINI_API_KEY: fakeProviderKey("gemini"),
    } as NodeJS.ProcessEnv);

    expect(config.provider).toBe("grok");
    expect(provider.metadata).toMatchObject({ provider: "grok", deterministic: false });
    expect(provider.metadata.roles.supportScorer).toBe("grok_support_scorer");
  });

  it("selects Gemini only as the third-tier LLM when it is the only configured key", () => {
    const config = resolveDefaultProviderConfig({ GEMINI_API_KEY: fakeProviderKey("gemini") } as NodeJS.ProcessEnv);
    const provider = getDefaultProvider({ GEMINI_API_KEY: fakeProviderKey("gemini") } as NodeJS.ProcessEnv);

    expect(config.provider).toBe("gemini");
    expect(provider.metadata).toMatchObject({ provider: "gemini", deterministic: false });
    expect(provider.metadata.roles.supportScorer).toBe("gemini_support_scorer");
  });

  it("lets deterministic mode be forced explicitly even when provider keys are available", () => {
    const config = resolveDefaultProviderConfig({
      ELENCHUS_LLM_PROVIDER: "deterministic",
      ANTHROPIC_API_KEY: fakeProviderKey("anthropic"),
    } as NodeJS.ProcessEnv);
    const provider = getDefaultProvider({
      ELENCHUS_LLM_PROVIDER: "deterministic",
      ANTHROPIC_API_KEY: fakeProviderKey("anthropic"),
    } as NodeJS.ProcessEnv);

    expect(config.provider).toBe("deterministic");
    expect(provider.metadata.provider).toBe("deterministic-local");
  });

  it("honors explicit Claude provider and ELENCHUS_PREFERRED_MODEL", () => {
    const config = resolveDefaultProviderConfig({
      ELENCHUS_LLM_PROVIDER: "claude",
      ELENCHUS_PREFERRED_MODEL: "claude-4",
      ANTHROPIC_API_KEY: fakeProviderKey("anthropic"),
    } as NodeJS.ProcessEnv);
    const provider = getDefaultProvider({
      ELENCHUS_LLM_PROVIDER: "claude",
      ELENCHUS_PREFERRED_MODEL: "claude-4",
      ANTHROPIC_API_KEY: fakeProviderKey("anthropic"),
    } as NodeJS.ProcessEnv);

    expect(config).toMatchObject({ provider: "claude", model: "claude-4" });
    expect(provider.metadata).toMatchObject({ provider: "claude", model: "claude-4" });
  });

  it("can infer Grok from ELENCHUS_PREFERRED_MODEL when no explicit provider is set", () => {
    const config = resolveDefaultProviderConfig({
      ELENCHUS_PREFERRED_MODEL: "grok-3",
      XAI_API_KEY: fakeProviderKey("xai"),
      GEMINI_API_KEY: fakeProviderKey("gemini"),
    } as NodeJS.ProcessEnv);

    expect(config).toMatchObject({ provider: "grok", model: "grok-3" });
  });

  it("rejects conflicting provider and preferred model families", () => {
    expect(() =>
      resolveDefaultProviderConfig({
        ELENCHUS_LLM_PROVIDER: "claude",
        ELENCHUS_PREFERRED_MODEL: "grok-3",
        ANTHROPIC_API_KEY: fakeProviderKey("anthropic"),
        XAI_API_KEY: fakeProviderKey("xai"),
      } as NodeJS.ProcessEnv)
    ).toThrow(/conflicts/i);
  });
});
