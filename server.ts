import "dotenv/config";
import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GoogleGenAI, Type } from "@google/genai";
import {
  executeSocraticGateway,
  type InterceptionRequest,
} from "./src/services/interceptor.js";

// 1. Define MCP Server
const mcpServer = new Server(
  {
    name: "elenchus-validator",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper to get API Key with fallback and logging
const getApiKey = () => {
  const key = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (key) {
    const masked = `${key.substring(0, 3)}...${key.substring(key.length - 3)}`;
    console.log(`[AUTH] Using API Key: ${masked} (Length: ${key.length})`);
  } else {
    console.error("[AUTH] No API Key found in process.env.GEMINI_API_KEY or process.env.API_KEY");
  }
  return key;
};

// 2. Define MCP Tools
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  console.log("[MCP] Listing tools...");
  return {
    tools: [
      {
        name: "run_deutsch_probe",
        description: "Evaluate an explanation using David Deutsch's 'Good Explanation' criteria (variability, reach, testability).",
        inputSchema: {
          type: "object",
          properties: {
            theory: {
              type: "string",
              description: "The theory or explanation to evaluate.",
            },
          },
          required: ["theory"],
        },
      },
      {
        name: "run_variability_attack",
        description: "Attempt to 'sabotage' an explanation by finding plausible alternative mechanisms. Tests if an explanation is 'hard to vary'.",
        inputSchema: {
          type: "object",
          properties: {
            theory: {
              type: "string",
              description: "The theory or explanation to attack.",
            },
          },
          required: ["theory"],
        },
      },
      {
        name: "intercept_action",
        description: "Submit a proposed action for Socratic interception. The action is subjected to adversarial scrutiny: a saboteur generates a plausible alternative using the same reasoning, and a judge evaluates whether the original reasoning is 'hard to vary'. Returns reasoning quality score (0-100) and full audit log.",
        inputSchema: {
          type: "object",
          properties: {
            traceId: {
              type: "string",
              description: "Unique identifier from the calling agent swarm.",
            },
            context: {
              type: "string",
              description: "Environmental context: market state, system state, etc.",
            },
            proposedAction: {
              type: "object",
              description: "The action the agent wants to execute.",
            },
            reasoning: {
              type: "string",
              description: "The agent's stated justification for this action.",
            },
          },
          required: ["traceId", "context", "proposedAction", "reasoning"],
        },
      },
    ],
  };
});

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.log(`[MCP] Tool Call Received: ${name}`, JSON.stringify(args));

  // Initialize Gemini inside the handler to ensure fresh environment access
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error("[MCP] CRITICAL: API key is missing from environment (tried GEMINI_API_KEY and API_KEY)");
    return {
      content: [{ type: "text", text: "Error: API key is not configured on the server. Please add GEMINI_API_KEY to AI Studio Secrets." }],
      isError: true
    };
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    if (name === "run_deutsch_probe") {
      const theory = args?.theory as string;
      console.log(`[MCP] Calling Gemini for Deutsch Probe: ${theory.substring(0, 50)}...`);

      const response = await ai.models.generateContent({
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
      });

      console.log("[MCP] Gemini success for Deutsch Probe");
      return {
        content: [{ type: "text", text: response.text || "{}" }],
      };
    }

    if (name === "run_variability_attack") {
      const theory = args?.theory as string;
      console.log(`[MCP] Calling Gemini for Variability Attack: ${theory.substring(0, 50)}...`);

      const response = await ai.models.generateContent({
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
              success: { type: Type.BOOLEAN },
              variations: { type: Type.ARRAY, items: { type: Type.STRING } },
              explanation: { type: Type.STRING }
            },
            required: ["success", "variations", "explanation"]
          }
        }
      });

      console.log("[MCP] Gemini success for Variability Attack");
      return {
        content: [{ type: "text", text: response.text || "{}" }],
      };
    }

    if (name === "intercept_action") {
      const interceptRequest: InterceptionRequest = {
        traceId: args?.traceId as string,
        context: args?.context as string,
        proposedAction: args?.proposedAction as object,
        reasoning: args?.reasoning as string,
      };
      console.log(`[MCP] Running Socratic Gateway for traceId: ${interceptRequest.traceId}`);
      const result = await executeSocraticGateway(interceptRequest);
      console.log(`[MCP] Socratic Gateway result: score=${result.score}`);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }
  } catch (error: any) {
    console.error(`[MCP] Tool Execution Error (${name}):`, error);

    let errorMessage = `Server Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`;

    // Check for specific API key errors
    if (error?.message?.includes("API key not valid") || error?.status === "INVALID_ARGUMENT") {
      errorMessage = "CRITICAL: The Gemini API Key provided in AI Studio Secrets is invalid. Please double-check your key at https://aistudio.google.com/app/apikey and update it in the app Settings -> Secrets.";
    }

    return {
      content: [{ type: "text", text: errorMessage }],
      isError: true
    };
  }

  throw new Error(`Tool not found: ${name}`);
});

// 3. Start Express Server
async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(cors());
  app.use(express.json());

  // --- MCP Endpoints ---
  const transports = new Map<string, SSEServerTransport>();

  app.get("/mcp/sse", async (req, res) => {
    console.log("[SSE] New connection request from", req.ip);

    // Cloud Run / Nginx proxy compatibility: disable buffering
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const transport = new SSEServerTransport("/mcp/messages", res);
    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);

    console.log(`[SSE] Created session: ${sessionId}`);

    try {
      await mcpServer.connect(transport);
      console.log(`[SSE] MCP Server connected to session ${sessionId}`);
    } catch (err) {
      console.error(`[SSE] Failed to connect session ${sessionId}:`, err);
      transports.delete(sessionId);
      return;
    }

    req.on("close", () => {
      console.log(`[SSE] Session ${sessionId} closed`);
      transports.delete(sessionId);
    });
  });

  app.post("/mcp/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    console.log(`[MCP] POST message for session: ${sessionId}`);

    const transport = transports.get(sessionId);
    if (transport) {
      try {
        await transport.handlePostMessage(req, res);
      } catch (err) {
        console.error(`[MCP] Error in session ${sessionId} handlePostMessage:`, err);
        if (!res.headersSent) {
          res.status(500).send("Error handling MCP message");
        }
      }
    } else {
      console.error(`[MCP] Session ${sessionId} not found. Active sessions:`, Array.from(transports.keys()));
      res.status(400).send(`Session ${sessionId} not found. Please reconnect to /mcp/sse.`);
    }
  });

  // --- API Endpoints ---

  // Socratic Gateway interception endpoint
  app.post("/api/v1/intercept", async (req, res) => {
    const { traceId, context, proposedAction, reasoning } = req.body;

    // Validate required fields
    if (!traceId || typeof traceId !== "string") {
      res.status(400).json({ error: "Missing or invalid 'traceId' (string required)" });
      return;
    }
    if (!context || typeof context !== "string") {
      res.status(400).json({ error: "Missing or invalid 'context' (string required)" });
      return;
    }
    if (!proposedAction || typeof proposedAction !== "object") {
      res.status(400).json({ error: "Missing or invalid 'proposedAction' (object required)" });
      return;
    }
    if (!reasoning || typeof reasoning !== "string") {
      res.status(400).json({ error: "Missing or invalid 'reasoning' (string required)" });
      return;
    }

    // Abort controller — cancelled when the HTTP client closes the connection
    // before a response is sent (e.g. MÆI probe timeout).  This propagates to
    // executeSocraticGateway so in-flight Gemini calls are abandoned instead of
    // running to completion for nobody.
    const controller = new AbortController();
    req.on("close", () => {
      if (!res.writableEnded) {
        console.log(`[API] Client disconnected for traceId=${traceId} — aborting Gemini calls`);
        controller.abort();
      }
    });

    try {
      console.log(`[API] POST /api/v1/intercept | traceId=${traceId}`);
      const result = await executeSocraticGateway(
        { traceId, context, proposedAction, reasoning },
        controller.signal
      );
      console.log(`[API] Intercept result: score=${result.score}`);
      res.json(result);
    } catch (error: any) {
      console.error(`[API] Intercept error for traceId=${traceId}:`, error);
      res.status(500).json({
        error: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });

  app.get("/api/health", (req, res) => {
    const key = getApiKey();
    const masked = key ? `${key.substring(0, 3)}...${key.substring(key.length - 3)}` : "MISSING";
    res.json({
      status: "ok",
      service: "elenchus-validator",
      mode: "socratic-interception-proxy",
      mcp: "active",
      endpoints: {
        intercept: "POST /api/v1/intercept",
        mcpSse: "GET /mcp/sse",
        mcpMessages: "POST /mcp/messages",
      },
      env: {
        hasApiKey: !!key,
        maskedKey: masked,
        keyLength: key?.length || 0,
        nodeEnv: process.env.NODE_ENV,
      },
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] Elenchus Validator (Socratic Interception Proxy) running on http://0.0.0.0:${PORT}`);
    console.log(`[SERVER] Intercept: POST http://0.0.0.0:${PORT}/api/v1/intercept`);
    console.log(`[SERVER] Health:    GET  http://0.0.0.0:${PORT}/api/health`);
    console.log(`[SERVER] MCP SSE:   GET  http://0.0.0.0:${PORT}/mcp/sse`);
  });
}

startServer().catch(err => {
  console.error("[SERVER] Fatal startup error:", err);
});
