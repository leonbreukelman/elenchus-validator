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
        traceId: "sre-integration-001",
        context: "Postgres DB showing high I/O wait. pg_stat_activity shows 12 sessions in idle in transaction state for >30 minutes.",
        proposedAction: { type: "TERMINATE_IDLE_SESSIONS", max_idle_age: "10m" },
        reasoning: "These 12 idle transactions are holding row-level locks on the audit_logs table, which is preventing the VACUUM process from cleaning up dead tuples. This is causing table bloat, where the database must scan significantly more pages than necessary, leading to the observed I/O spike. Terminating these sessions releases the locks and allows VACUUM to proceed.",
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
        traceId: "medical-integration-002",
        context: "Chest CT shows a 12mm sub-solid nodule in the right lung. No previous imaging available for comparison.",
        proposedAction: { type: "SCHEDULE_BIOPSY", priority: "high" },
        reasoning: "The nodule is 12mm, which is above the 6mm threshold for clinical concern. Its location and density suggest it should be biopsied immediately to rule out malignancy.",
      };

      const result = await executeSocraticGateway(request);
      process.stdout.write("INTEGRATION RESULT 2: " + JSON.stringify(result, null, 2) + "\n");

      expect(result).toHaveProperty("score");
      expect(typeof result.score).toBe("number");
    }
  );
});
