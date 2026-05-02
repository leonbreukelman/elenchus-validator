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

describe("executeSocraticGateway - Abort / caller-disconnect handling", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should exit immediately and make no Gemini calls when signal is already aborted", async () => {
    // Intent: verify that a pre-aborted signal prevents any Gemini API spend.
    // The gateway must detect signal.aborted at loop entry and return without
    // calling the saboteur or judge at all.
    const mockGenerateContent = vi.fn();
    vi.doMock("@google/genai", () => ({
      GoogleGenAI: class {
        models = { generateContent: mockGenerateContent };
      },
      Type: { OBJECT: "OBJECT", STRING: "STRING", NUMBER: "NUMBER" },
    }));

    process.env.GEMINI_API_KEY = "test-mock-key";
    const { executeSocraticGateway } = await import("../src/services/interceptor.ts");

    const controller = new AbortController();
    controller.abort(); // already disconnected before gateway starts

    const request: InterceptionRequest = {
      traceId: "abort-pre-001",
      context: "Market context.",
      proposedAction: { type: "BUY" },
      reasoning: "Some reasoning.",
    };

    const result = await executeSocraticGateway(request, controller.signal);

    // No Gemini calls should have been made
    expect(mockGenerateContent).not.toHaveBeenCalled();
    // Log must contain an abort marker
    expect(result.terminalLog.some((line) => line.includes("[ABORT]"))).toBe(true);
    // Score defaults to 0 — no judgment was rendered
    expect(result.score).toBe(0);
  });

  it("should abort mid-execution when signal fires during a Gemini call", async () => {
    // Intent: simulate a slow Gemini call where the client disconnects while
    // the saboteur is running.  The gateway must surface the abort and return
    // without proceeding to the judge call.
    const mockGenerateContent = vi.fn();
    vi.doMock("@google/genai", () => ({
      GoogleGenAI: class {
        models = { generateContent: mockGenerateContent };
      },
      Type: { OBJECT: "OBJECT", STRING: "STRING", NUMBER: "NUMBER" },
    }));

    process.env.GEMINI_API_KEY = "test-mock-key";
    const { executeSocraticGateway } = await import("../src/services/interceptor.ts");

    const controller = new AbortController();

    // Saboteur call hangs until aborted
    mockGenerateContent.mockImplementation(
      () =>
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error("Caller disconnected — aborting Gemini call"));
          });
          // Abort after a short delay to simulate mid-flight disconnect
          setTimeout(() => controller.abort(), 10);
        })
    );

    const request: InterceptionRequest = {
      traceId: "abort-mid-002",
      context: "Market context.",
      proposedAction: { type: "SELL" },
      reasoning: "Price dropped.",
    };

    const result = await executeSocraticGateway(request, controller.signal);

    // Only one Gemini call should have been attempted (saboteur R1)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    // Log must contain an abort marker
    expect(result.terminalLog.some((line) => line.includes("[ABORT]"))).toBe(true);
    // Score is still 0 — no judge verdict reached
    expect(result.score).toBe(0);
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
