// Intent: validator.ts provides standalone probe functions (runDeutschProbe,
// runVariabilityAttack) for direct use outside the MCP/interceptor pipeline.
// To prevent the same 25s-default vs 30s mismatch described in issue #1, these
// functions import PER_CALL_TIMEOUT_MS from interceptor.ts and enforce it via
// Promise.race so all Gemini calls across the system share a single timeout budget.
import { GoogleGenAI, Type } from "@google/genai";
import { PER_CALL_TIMEOUT_MS } from "./interceptor.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// withTimeout wraps any Promise with a rejection after `ms` milliseconds.
// Used here to apply PER_CALL_TIMEOUT_MS to raw Gemini calls in this module,
// matching the timeout discipline in interceptor.ts and server.ts.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export interface Theory {
  id: string;
  name: string;
  description: string;
  category: 'Scientific' | 'Pseudo-scientific' | 'Mythological' | 'Economic';
}

export interface ProbeResult {
  score: number;
  variability: string;
  reach: string;
  testability: string;
  quality: string;
}

export interface AttackResult {
  success: boolean;
  variations: string[];
  explanation: string;
}

export interface ValidationReport {
  theory: Theory;
  probe: ProbeResult;
  attack: AttackResult;
  concordance: number; // 0-100, how well the probe's judgment matches the attack's success
}

export const THEORIES: Theory[] = [
  {
    id: 'gr',
    name: 'General Relativity',
    description: 'Gravity is the curvature of spacetime caused by mass and energy.',
    category: 'Scientific'
  },
  {
    id: 'qm',
    name: 'Quantum Mechanics',
    description: 'Physical systems are described by wave functions that collapse upon measurement.',
    category: 'Scientific'
  },
  {
    id: 'string-theory',
    name: 'String Theory',
    description: 'Fundamental particles are one-dimensional strings vibrating at specific frequencies.',
    category: 'Scientific'
  },
  {
    id: 'astrology',
    name: 'Astrology',
    description: 'The positions of stars and planets at birth determine human personality and destiny.',
    category: 'Pseudo-scientific'
  },
  {
    id: 'homeopathy',
    name: 'Homeopathy',
    description: 'Substances that cause symptoms in healthy people can cure similar symptoms in sick people when highly diluted.',
    category: 'Pseudo-scientific'
  },
  {
    id: 'flat-earth',
    name: 'Flat Earth',
    description: 'The Earth is a flat disc centered at the North Pole and surrounded by an ice wall.',
    category: 'Pseudo-scientific'
  },
  {
    id: 'seasons-myth',
    name: "Demeter's Grief",
    description: 'Seasons occur because Demeter is sad when her daughter Persephone is in the underworld.',
    category: 'Mythological'
  },
  {
    id: 'thor-thunder',
    name: "Thor's Hammer",
    description: "Thunder is the sound of Thor's hammer Mjölnir striking giants in the sky.",
    category: 'Mythological'
  },
  {
    id: 'efficient-market',
    name: 'Efficient Market Hypothesis',
    description: 'Asset prices fully reflect all available information, making it impossible to beat the market.',
    category: 'Economic'
  },
  {
    id: 'malthusian-trap',
    name: 'Malthusian Trap',
    description: 'Population growth will inevitably outpace food production, leading to societal collapse.',
    category: 'Economic'
  }
];

export async function runDeutschProbe(theory: string): Promise<ProbeResult> {
  const response = await withTimeout(
    ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Evaluate this theory using David Deutsch's "Good Explanation" criteria:
    Theory: "${theory}"

    Focus on:
    1. Variability: How hard is it to change the details while keeping the explanation?
    2. Reach: Does it explain more than it was designed to?
    3. Testability: Is it falsifiable?`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            variability: { type: Type.STRING },
            reach: { type: Type.STRING },
            testability: { type: Type.STRING },
            quality: { type: Type.STRING }
          },
          required: ["score", "variability", "reach", "testability", "quality"]
        }
      }
    }),
    PER_CALL_TIMEOUT_MS,
    "runDeutschProbe"
  );
  return JSON.parse(response.text);
}

export async function runVariabilityAttack(theory: string): Promise<AttackResult> {
  const response = await withTimeout(
    ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an "Explanation Saboteur". Your goal is to prove that the following theory is "easy to vary".

    Theory: "${theory}"

    Try to create 3 alternative explanations that account for the SAME phenomena but use completely different mechanisms.
    If you can do this easily without losing explanatory power, the theory is "easy to vary" (Bad).
    If your alternatives feel forced, arbitrary, or "ad hoc", the theory is "hard to vary" (Good).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            success: { type: Type.BOOLEAN, description: "True if you found easy, plausible variations" },
            variations: { type: Type.ARRAY, items: { type: Type.STRING }, description: "The alternative explanations" },
            explanation: { type: Type.STRING, description: "Why it was easy or hard to vary" }
          },
          required: ["success", "variations", "explanation"]
        }
      }
    }),
    PER_CALL_TIMEOUT_MS,
    "runVariabilityAttack"
  );
  return JSON.parse(response.text);
}
