import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  InterceptionRequest,
  InterceptionResult,
  SaboteurOutput,
  JudgeVerdict,
} from "../src/services/interceptor.ts";

describe("executeSocraticGateway - Functional Tests", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should return a score based on judge assessment and not a binary verdict", async () => {
    const mockGenerateContent = vi.fn();
    vi.doMock("@google/genai", () => ({
      GoogleGenAI: class {
        models = { generateContent: mockGenerateContent };
      },
      Type: { OBJECT: "OBJECT", STRING: "STRING", NUMBER: "NUMBER" },
    }));

    const saboteurResponse = {
      alternativeAction: { type: "HOLD", description: "Maintain current position" },
      alternativeReasoning: "Reasoning is too vague to specify BUY vs HOLD.",
      plausibilityScore: 70,
    };

    const judgeResponse = {
      qualityAssessment: "Marginal",
      score: 45,
      reasoning: "The reasoning is somewhat easy to vary.",
    };

    let callCount = 0;
    mockGenerateContent.mockImplementation(async () => {
      callCount++;
      return { text: JSON.stringify(callCount % 2 === 0 ? judgeResponse : saboteurResponse) };
    });

    process.env.GEMINI_API_KEY = "test-mock-key";
    const { executeSocraticGateway } = await import("../src/services/interceptor.ts");

    const request: InterceptionRequest = {
      traceId: "test-score-001",
      context: "Neutral market.",
      proposedAction: { type: "BUY", instrument: "SPY" },
      reasoning: "I feel like it might go up.",
    };

    const result = await executeSocraticGateway(request);
    expect(result.score).toBe(45);
    expect(result).not.toHaveProperty("actionState");
  });
});

describe("executeSocraticGateway - Integration Test (Live API)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("@google/genai");
  });

  const HAS_API_KEY = !!(process.env.GEMINI_API_KEY || process.env.API_KEY);

  it.skipIf(!HAS_API_KEY)(
    "should return a real score for a logically sound reasoning",
    { timeout: 60_000 },
    async () => {
      const { executeSocraticGateway } = await import("../src/services/interceptor.ts");

      const request: InterceptionRequest = {
        traceId: "integration-test-001",
        context: "Market is trending up, all indicators green.",
        proposedAction: { type: "BUY", instrument: "BTC", amount: 1 },
        reasoning: "Buying BTC because the 50-day moving average just crossed above the 200-day moving average (Golden Cross) on high volume, and current RSI is 55, indicating healthy momentum without being overbought.",
      };

      const result = await executeSocraticGateway(request);
      process.stdout.write("INTEGRATION RESULT: " + JSON.stringify(result, null, 2) + "\n");

      expect(result).toHaveProperty("score");
      expect(typeof result.score).toBe("number");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  );
});


describe("executeSocraticGateway - Integration Test 2", () => {
  const HAS_API_KEY = !!(process.env.GEMINI_API_KEY || process.env.API_KEY);

  it.skipIf(!HAS_API_KEY)(
    "should return a score for a simple theory",
    { timeout: 60_000 },
    async () => {
      const { executeSocraticGateway } = await import("../src/services/interceptor.ts");

      const request: InterceptionRequest = {
        traceId: "integration-test-002",
        context: "The sun rises in the east every day.",
        proposedAction: { type: "OBSERVE", object: "SUN" },
        reasoning: "The Earth rotates on its axis from west to east, so to an observer on Earth, the Sun appears to rise in the east and set in the west. This is a consistent physical reality based on the planetary rotation.",
      };

      const result = await executeSocraticGateway(request);
      process.stdout.write("INTEGRATION RESULT 2: " + JSON.stringify(result, null, 2) + "\n");

      expect(result).toHaveProperty("score");
      expect(typeof result.score).toBe("number");
    }
  );
});
