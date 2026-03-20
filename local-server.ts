import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// 1. Define Local MCP Server
const mcpServer = new Server(
  {
    name: "elenchus-validator-local",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 2. Define Tools
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "run_deutsch_probe",
        description: "Get the evaluation framework for David Deutsch's 'Good Explanation' criteria. The connected LLM will perform the evaluation.",
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
        description: "Get the framework to attempt to 'sabotage' an explanation by finding plausible alternative mechanisms. The connected LLM will perform the attack.",
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

// 3. Handle Tool Calls (LLM-Agnostic)
// Instead of calling an API, we return strict instructions to the connected LLM (e.g., Claude) 
// so that IT performs the evaluation using its own intelligence.
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "run_deutsch_probe") {
    const theory = args?.theory as string;
    return {
      content: [
        {
          type: "text",
          text: `SYSTEM INSTRUCTION FOR LLM: 
You are now acting as the Elenchus Validator. Evaluate the following theory using David Deutsch's "Good Explanation" criteria.

THEORY TO EVALUATE:
"${theory}"

CRITERIA:
1. Variability: How hard is it to change the details while keeping the explanation? (Hard to vary = Good)
2. Reach: Does it explain more than it was designed to?
3. Testability: Is it falsifiable?

Please provide your evaluation directly to the user, scoring it and giving a final verdict of "Good" or "Bad".`,
        },
      ],
    };
  }

  if (name === "run_variability_attack") {
    const theory = args?.theory as string;
    return {
      content: [
        {
          type: "text",
          text: `SYSTEM INSTRUCTION FOR LLM:
You are now acting as an "Explanation Saboteur". Your goal is to prove that the following theory is "easy to vary".

THEORY TO ATTACK:
"${theory}"

YOUR TASK:
Try to create 3 alternative explanations that account for the SAME phenomena but use completely different mechanisms. 
If you can do this easily without losing explanatory power, the theory is "easy to vary" (Bad).
If your alternatives feel forced, arbitrary, or "ad hoc", the theory is "hard to vary" (Good).

Present your 3 variations and your final conclusion to the user.`,
        },
      ],
    };
  }

  throw new Error(`Tool not found: ${name}`);
});

// 4. Start Stdio Server
async function run() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  
  // Stdio servers should log to stderr so they don't break the JSON-RPC stdout stream
  console.error("Elenchus Validator Local MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error running local server:", error);
  process.exit(1);
});
