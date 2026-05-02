import type { EvaluationRequestV2, TypedAction } from "../evaluation/types.js";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateAction(value: unknown): value is TypedAction {
  return isPlainObject(value) && typeof value.type === "string" && value.type.length > 0;
}

export function parseEvaluationRequestV2(body: unknown): { ok: true; value: EvaluationRequestV2 } | { ok: false; error: string } {
  if (!isPlainObject(body)) return { ok: false, error: "body must be a JSON object" };
  if (typeof body.traceId !== "string" || body.traceId.length < 3) return { ok: false, error: "traceId must be a string" };
  if (body.domain !== "sre" && body.domain !== "generic") return { ok: false, error: "domain must be sre or generic" };
  if (typeof body.context !== "string" || body.context.trim().length < 10) return { ok: false, error: "context must be a non-empty string" };
  if (!validateAction(body.proposedAction)) return { ok: false, error: "proposedAction.type must be a string" };
  if (typeof body.rationale !== "string" || body.rationale.trim().length < 10) return { ok: false, error: "rationale must be a non-empty string" };

  return {
    ok: true,
    value: {
      traceId: body.traceId,
      domain: body.domain,
      context: body.context,
      proposedAction: body.proposedAction,
      rationale: body.rationale,
      metadata: isPlainObject(body.metadata) ? body.metadata : undefined,
    },
  };
}
