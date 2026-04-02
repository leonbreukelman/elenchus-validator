import { GoogleGenAI, Type } from "@google/genai";

// --- Types ---

export interface InterceptionRequest {
  traceId: string;
  context: string;
  proposedAction: object;
  reasoning: string;
}

export interface InterceptionResult {
  score: number; // 0-100
  terminalLog: string[];
}

export interface SaboteurOutput {
  alternativeAction: object;
  alternativeReasoning: string;
  plausibilityScore: number; // 0-100
}

export interface JudgeVerdict {
  qualityAssessment: string;
  score: number;
  reasoning: string;
}

// --- Constants ---

const MAX_DEPTH = 2;
const PER_CALL_TIMEOUT_MS = 30000;
const GATEWAY_TIMEOUT_MS = 90000;
const MODEL = "gemini-3-flash-preview";

// --- Prompt Construction ---

function buildSaboteurPrompt(
  request: InterceptionRequest,
  priorRoundSummary?: string
): string {
  let prompt = `You are given an agent's proposed action and its reasoning within a specific context. Your task is to construct the most plausible ALTERNATIVE action that could be justified using the SAME reasoning and context. You are trying to show that the reasoning is "easy to vary" — that it can justify multiple contradictory actions equally well.

Context:
${request.context}

Proposed Action:
${JSON.stringify(request.proposedAction, null, 2)}

Agent's Reasoning:
${request.reasoning}`;

  if (priorRoundSummary) {
    prompt += `

Prior Round Summary:
${priorRoundSummary}

In this round, try a DIFFERENT angle of attack than the previous round. Find a new alternative that the prior defense did not address.`;
  }

  prompt += `

Construct an alternative action that:
1. Is plausible given the same context
2. Contradicts the proposed action (different direction, different instrument, different sizing, etc.)
3. Can be justified using the same high-level reasoning the agent provided

Rate the plausibility of your alternative from 0 to 100.

Respond with JSON matching the required schema.`;

  return prompt;
}

function buildJudgePrompt(
  request: InterceptionRequest,
  saboteurOutput: SaboteurOutput
): string {
  return `You are evaluating the quality of an agent's reasoning by checking if it is "hard to vary".

Context:
${request.context}

ORIGINAL Proposed Action:
${JSON.stringify(request.proposedAction, null, 2)}

ORIGINAL Reasoning:
${request.reasoning}

SABOTEUR'S Alternative Action:
${JSON.stringify(saboteurOutput.alternativeAction, null, 2)}

SABOTEUR'S Alternative Reasoning:
${saboteurOutput.alternativeReasoning}

Saboteur's Self-Assessed Plausibility: ${saboteurOutput.plausibilityScore}/100

Your task:
- Evaluate how well the original reasoning justifies the proposed action specifically, vs how well it justifies the saboteur's alternative.
- Reasoning is "good" (hard to vary) if it contains structural features or specific thresholds that make the proposed action the logical choice, while making the alternative feel forced or arbitrary.
- Reasoning is "bad" (easy to vary) if the same logic justifies the alternative just as well as the original.
- Provide a score from 0-100:
  - 80-100: Exceptional quality. Original reasoning is hard to vary, saboteur alternatives are clearly inferior.
  - 60-79: Good quality. Original reasoning holds but has minor weaknesses.
  - 40-59: Marginal quality. Original reasoning and alternative are close in plausibility.
  - 0-39: Poor quality. Original reasoning is easy to vary, saboteur produced compelling alternatives.

Respond with JSON matching the required schema.`;
}

// --- Gemini Call Helpers ---

async function callGeminiWithTimeout<T>(
  ai: GoogleGenAI,
  systemInstruction: string,
  prompt: string,
  responseSchema: object,
  timeoutMs: number
): Promise<T> {
  const callPromise = ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: responseSchema as any,
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`Gemini call timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  const response = await Promise.race([callPromise, timeoutPromise]);
  return JSON.parse(response.text!) as T;
}

async function callSaboteur(
  ai: GoogleGenAI,
  request: InterceptionRequest,
  priorRoundSummary?: string
): Promise<SaboteurOutput> {
  const systemInstruction =
    "You are an Explanation Saboteur. Your goal is to demonstrate that the given reasoning is 'easy to vary' by constructing an equally plausible alternative action justified by the SAME reasoning and context.";

  const prompt = buildSaboteurPrompt(request, priorRoundSummary);

  const schema = {
    type: Type.OBJECT,
    properties: {
      alternativeAction: {
        type: Type.OBJECT,
        description:
          "A plausible alternative action that contradicts the proposed action",
        properties: {
          type: { type: Type.STRING },
          description: { type: Type.STRING },
          details: { type: Type.STRING },
        },
        required: ["type", "description"],
      },
      alternativeReasoning: {
        type: Type.STRING,
        description:
          "Reasoning for the alternative action, using the same context and logic as the original",
      },
      plausibilityScore: {
        type: Type.NUMBER,
        description:
          "Self-assessed plausibility of this alternative (0-100)",
      },
    },
    required: ["alternativeAction", "alternativeReasoning", "plausibilityScore"],
  };

  return callGeminiWithTimeout<SaboteurOutput>(
    ai,
    systemInstruction,
    prompt,
    schema,
    PER_CALL_TIMEOUT_MS
  );
}

async function callJudge(
  ai: GoogleGenAI,
  request: InterceptionRequest,
  saboteurOutput: SaboteurOutput
): Promise<JudgeVerdict> {
  const systemInstruction =
    "You are an impartial Judge evaluating the quality of an agent's reasoning. You must determine how well the original proposed action is justified compared to a saboteur's alternative.";

  const prompt = buildJudgePrompt(request, saboteurOutput);

  const schema = {
    type: Type.OBJECT,
    properties: {
      qualityAssessment: {
        type: Type.STRING,
        description:
          "A brief summary of the quality assessment (e.g. 'Hard to vary', 'Easy to vary', 'Marginal')",
      },
      score: {
        type: Type.NUMBER,
        description:
          "0-100 score indicating reasoning quality",
      },
      reasoning: {
        type: Type.STRING,
        description:
          "Explanation of how the score was determined",
      },
    },
    required: ["qualityAssessment", "score", "reasoning"],
  };

  return callGeminiWithTimeout<JudgeVerdict>(
    ai,
    systemInstruction,
    prompt,
    schema,
    PER_CALL_TIMEOUT_MS
  );
}

// --- Core Gateway ---

export async function executeSocraticGateway(
  request: InterceptionRequest
): Promise<InterceptionResult> {
  const terminalLog: string[] = [];
  const gatewayStart = Date.now();

  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    terminalLog.push("[ERROR] No API key configured (GEMINI_API_KEY or API_KEY)");
    return { score: lastScore, terminalLog };
  }

  const ai = new GoogleGenAI({ apiKey });

  // Log receipt
  const actionSummary =
    typeof request.proposedAction === "object" && request.proposedAction !== null
      ? (request.proposedAction as any).type || "UNKNOWN"
      : "UNKNOWN";
  terminalLog.push(
    `[RECEIVE] traceId=${request.traceId} | action=${actionSummary} | timestamp=${new Date().toISOString()}`
  );

  let priorRoundSummary: string | undefined;
  let lastScore = 0;

  for (let round = 1; round <= MAX_DEPTH; round++) {
    // Check gateway timeout
    const elapsed = Date.now() - gatewayStart;
    if (elapsed >= GATEWAY_TIMEOUT_MS) {
      terminalLog.push(
        `[TIMEOUT] Gateway timeout reached at ${elapsed}ms.`
      );
      return { score: lastScore, terminalLog };
    }

    // --- Saboteur Attack ---
    let saboteurOutput: SaboteurOutput;
    try {
      saboteurOutput = await callSaboteur(ai, request, priorRoundSummary);
      terminalLog.push(
        `[SABOTEUR R${round}] Alternative: ${JSON.stringify(saboteurOutput.alternativeAction)}. Plausibility: ${saboteurOutput.plausibilityScore}/100.`
      );
    } catch (error: any) {
      terminalLog.push(
        `[ERROR] Saboteur call failed in round ${round}: ${error.message}.`
      );
      return { score: lastScore, terminalLog };
    }

    // Check gateway timeout before judge call
    const elapsedAfterSaboteur = Date.now() - gatewayStart;
    if (elapsedAfterSaboteur >= GATEWAY_TIMEOUT_MS) {
      terminalLog.push(
        `[TIMEOUT] Gateway timeout reached at ${elapsedAfterSaboteur}ms after saboteur.`
      );
      return { score: lastScore, terminalLog };
    }

    // --- Judge Verdict ---
    let judgeVerdict: JudgeVerdict;
    try {
      judgeVerdict = await callJudge(ai, request, saboteurOutput);
      terminalLog.push(
        `[JUDGE R${round}] Assessment: ${judgeVerdict.qualityAssessment}. Score: ${judgeVerdict.score}. ${judgeVerdict.reasoning}`
      );
    } catch (error: any) {
      terminalLog.push(
        `[ERROR] Judge call failed in round ${round}: ${error.message}.`
      );
      return { score: lastScore, terminalLog };
    }

    lastScore = judgeVerdict.score;

    // Early exit if score is very high or very low (clear result)
    if (judgeVerdict.score >= 80 || judgeVerdict.score <= 30) {
      const elapsedFinal = ((Date.now() - gatewayStart) / 1000).toFixed(1);
      terminalLog.push(
        `[RESULT] score=${judgeVerdict.score} | rounds=${round} | elapsed=${elapsedFinal}s`
      );
      return {
        score: judgeVerdict.score,
        terminalLog,
      };
    }

    // Judge is uncertain — prepare compressed summary for next round
    priorRoundSummary = `Round ${round}: Saboteur proposed ${JSON.stringify(saboteurOutput.alternativeAction)} with reasoning "${saboteurOutput.alternativeReasoning}" (plausibility: ${saboteurOutput.plausibilityScore}). Judge assessed: "${judgeVerdict.reasoning}" (score: ${judgeVerdict.score}).`;
  }

  const elapsedFinal = ((Date.now() - gatewayStart) / 1000).toFixed(1);
  terminalLog.push(
    `[RESULT] score=${lastScore} | rounds=${MAX_DEPTH} | elapsed=${elapsedFinal}s`
  );
  return {
    score: lastScore,
    terminalLog,
  };
}
