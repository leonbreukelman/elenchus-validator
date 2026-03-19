import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GoogleGenAI, Type } from "@google/genai";

// 1. Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 2. Define MCP Server
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

// 3. Define MCP Tools
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
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
    ],
  };
});

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "run_deutsch_probe") {
    const theory = args?.theory as string;
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
            verdict: { type: Type.STRING, enum: ['Good', 'Bad'] }
          },
          required: ["score", "variability", "reach", "testability", "verdict"]
        }
      }
    });
    return {
      content: [{ type: "text", text: response.text }],
    };
  }

  if (name === "run_variability_attack") {
    const theory = args?.theory as string;
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
    return {
      content: [{ type: "text", text: response.text }],
    };
  }

  throw new Error(`Tool not found: ${name}`);
});

// 4. Start Express Server
async function startServer() {
  const app = express();
  const PORT = 3000;

  // --- MCP Endpoints ---
  let transport: SSEServerTransport | null = null;

  app.get("/mcp/sse", async (req, res) => {
    console.log("New MCP SSE connection");
    transport = new SSEServerTransport("/mcp/messages", res);
    await mcpServer.connect(transport);
  });

  app.post("/mcp/messages", async (req, res) => {
    console.log("New MCP message");
    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(400).send("No active SSE transport");
    }
  });

  // --- API Endpoints ---
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", mcp: "active" });
  });

  // --- Vite / Static Files ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`MCP SSE endpoint: http://localhost:${PORT}/mcp/sse`);
  });
}

startServer().catch(console.error);
