import { describe, it, expect, vi } from "vitest";
import type {
  InterceptionRequest,
  InterceptionResult,
  SaboteurOutput,
  JudgeVerdict,
} from "../src/services/interceptor.ts";

const HAS_API_KEY = !!(process.env.GEMINI_API_KEY || process.env.API_KEY);

describe("executeSocraticGateway", () => {
  // ─── Test 1: The Hallucination (DENY expected) ───────────────────────

  it.skipIf(!HAS_API_KEY)(
    "should DENY when reasoning is logically disconnected from the action",
    { timeout: 30_000 },
    async () => {
      const { executeSocraticGateway } = await import(
        "../src/services/interceptor.ts"
      );

      const request: InterceptionRequest = {
        traceId: "test-hallucination-001",
        context:
          "Portfolio holds 500 shares of AAPL at average cost $182.30. Current price $178.50. " +
          "No earnings upcoming. Market is flat. VIX at 14.2.",
        proposedAction: {
          type: "BUY",
          instrument: "AAPL",
          quantity: 1000,
          price: 178.5,
        },
        reasoning:
          "Cumulus cloud formations observed over the Pacific Northwest suggest increased " +
          "precipitation this quarter. Historical weather patterns from 1987 correlate with " +
          "agricultural yields in the Midwest. The barometric pressure has been dropping steadily, " +
          "which reminds me of a similar pattern last autumn. Therefore, doubling the AAPL position " +
          "is the optimal move.",
      };

      const result: InterceptionResult =
        await executeSocraticGateway(request);

      // Shape assertions
      expect(result).toHaveProperty("actionState");
      expect(result).toHaveProperty("concordanceScore");
      expect(result).toHaveProperty("terminalLog");

      // The hallucinated reasoning should be denied
      expect(result.actionState).toBe("DENY");
      expect(result.concordanceScore).toBeLessThan(50);
      expect(result.terminalLog.length).toBeGreaterThan(0);
    }
  );

  // ─── Test 2: The Robust Action (ALLOW expected) ──────────────────────

  it.skipIf(!HAS_API_KEY)(
    "should ALLOW when reasoning is tightly coupled and hard to vary",
    { timeout: 30_000 },
    async () => {
      const { executeSocraticGateway } = await import(
        "../src/services/interceptor.ts"
      );

      const request: InterceptionRequest = {
        traceId: "test-robust-002",
        context:
          "Portfolio holds 2000 shares of TSLA at average cost $245.00. Current price $232.10, " +
          "down 5.3% in 3 sessions. 14-day RSI is 28.4 (oversold). Portfolio delta exposure is " +
          "+0.82, exceeding the 0.70 risk limit. VIX spiked from 15.1 to 22.8 in 48 hours. " +
          "Earnings report due in 6 trading days. Max drawdown policy: 8% per position. " +
          "Current drawdown: 5.3%. Remaining buffer: 2.7% before forced liquidation trigger.",
        proposedAction: {
          type: "REDUCE_POSITION",
          instrument: "TSLA",
          quantity: 600,
          price: 232.1,
          reason: "risk_limit_breach",
        },
        reasoning:
          "Reducing position by 600 shares (30%) because: (1) portfolio delta of 0.82 exceeds " +
          "the 0.70 hard limit — this alone mandates reduction per risk policy; (2) RSI at 28.4 " +
          "signals continued downside momentum, increasing probability of hitting the 8% max " +
          "drawdown trigger at $225.40; (3) VIX jump from 15.1 to 22.8 indicates regime change " +
          "to elevated volatility, which historically widens TSLA daily ranges by 40-60%; " +
          "(4) earnings in 6 days introduces binary event risk on an already stressed position. " +
          "The 30% reduction brings delta to ~0.57, within policy, while preserving 1400 shares " +
          "for potential recovery. This is the minimum reduction that satisfies the delta constraint.",
      };

      const result: InterceptionResult =
        await executeSocraticGateway(request);

      expect(result.actionState).toBe("ALLOW");
      expect(result.concordanceScore).toBeGreaterThan(60);
      expect(result.terminalLog.length).toBeGreaterThan(0);
    }
  );

  // ─── Test 3: The Deadlock (circuit breaker, fully mocked) ────────────

  it("should DENY at MAX_DEPTH when judge verdicts are perpetually inconclusive", async () => {
    // Mock @google/genai before importing the interceptor
    const mockGenerateContent = vi.fn();

    vi.doMock("@google/genai", () => {
      return {
        GoogleGenAI: class {
          models = {
            generateContent: mockGenerateContent,
          };
        },
        Type: {
          OBJECT: "OBJECT",
          STRING: "STRING",
          NUMBER: "NUMBER",
        },
      };
    });

    // Saboteur response: plausible alternative, score 50 (inconclusive zone)
    const saboteurResponse: SaboteurOutput = {
      alternativeAction: {
        type: "HOLD",
        description: "Maintain current position without changes",
      },
      alternativeReasoning:
        "The same market conditions could justify holding rather than acting, " +
        "since the signals are ambiguous.",
      plausibilityScore: 50,
    };

    // Judge response: uncertain, ALLOW but low concordance (below 70 threshold)
    const judgeResponse: JudgeVerdict = {
      verdict: "ALLOW",
      concordanceScore: 50,
      reasoning:
        "Both the original and alternative have merit. The original reasoning " +
        "is slightly more specific but not decisively so.",
    };

    // Mock returns saboteur on odd calls, judge on even calls
    // Round 1: call 1 = saboteur, call 2 = judge
    // Round 2: call 3 = saboteur, call 4 = judge
    let callCount = 0;
    mockGenerateContent.mockImplementation(async () => {
      callCount++;
      const isJudgeCall = callCount % 2 === 0;
      return {
        text: JSON.stringify(isJudgeCall ? judgeResponse : saboteurResponse),
      };
    });

    // Set env var so the gateway doesn't bail on missing key
    const originalKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-mock-key";

    try {
      // Dynamic import so the mock is active
      const { executeSocraticGateway } = await import(
        "../src/services/interceptor.ts"
      );

      const request: InterceptionRequest = {
        traceId: "test-deadlock-003",
        context: "Neutral market conditions. No strong signals.",
        proposedAction: {
          type: "BUY",
          instrument: "SPY",
          quantity: 100,
        },
        reasoning: "General market outlook is positive based on broad sentiment.",
      };

      const result: InterceptionResult =
        await executeSocraticGateway(request);

      // System must fail closed after MAX_DEPTH
      expect(result.actionState).toBe("DENY");

      // Terminal log should have: 1 RECEIVE + 2 SABOTEUR + 2 JUDGE + 1 VERDICT = 6 entries
      // Filter to round-specific entries to verify exactly 2 rounds occurred
      const saboteurEntries = result.terminalLog.filter((l) =>
        l.includes("[SABOTEUR R")
      );
      const judgeEntries = result.terminalLog.filter((l) =>
        l.includes("[JUDGE R")
      );
      expect(saboteurEntries).toHaveLength(2);
      expect(judgeEntries).toHaveLength(2);

      // Verify the VERDICT line indicates max depth was reached
      const verdictLine = result.terminalLog.find((l) =>
        l.includes("[VERDICT]")
      );
      expect(verdictLine).toBeDefined();
      expect(verdictLine).toContain("DENY");
      expect(verdictLine).toContain("max depth reached");

      // Should have made exactly 4 Gemini calls (2 saboteur + 2 judge)
      expect(mockGenerateContent).toHaveBeenCalledTimes(4);
    } finally {
      // Restore env
      if (originalKey === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = originalKey;
      }
      vi.doUnmock("@google/genai");
    }
  });
});
