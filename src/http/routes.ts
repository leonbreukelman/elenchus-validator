import type { Router } from "express";
import express from "express";
import { FileAuditLogger } from "../evaluation/audit.js";
import { evaluateRequestV2 } from "../evaluation/evaluator.js";
import { buildErrorReport } from "../evaluation/report.js";
import { getDefaultProvider, type EvaluationProvider } from "../evaluation/providers.js";
import { requireBearerToken } from "./auth.js";
import { parseEvaluationRequestV2 } from "./validation.js";

export function createApiRouter(): Router {
  const router = express.Router();

  router.post("/api/v2/evaluate", requireBearerToken, async (req, res) => {
    const parsed = parseEvaluationRequestV2(req.body);
    if (parsed.ok === false) {
      const fallback = {
        traceId: typeof req.body?.traceId === "string" ? req.body.traceId : "invalid-request",
        domain: "generic" as const,
        context: "",
        proposedAction: { type: "invalid" },
        rationale: "",
      };
      res.status(400).json(buildErrorReport(fallback, parsed.error));
      return;
    }

    const controller = new AbortController();
    req.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    let provider: EvaluationProvider;
    try {
      provider = getDefaultProvider();
    } catch {
      res.status(502).json(buildErrorReport(parsed.value, "provider configuration error"));
      return;
    }

    const report = await evaluateRequestV2(parsed.value, {
      provider,
      auditLogger: new FileAuditLogger(),
      signal: controller.signal,
    });
    res.status(report.status === "complete" ? 200 : 502).json(report);
  });

  return router;
}
