import { describe, expect, it } from "vitest";
import { generateNearNeighborAlternatives } from "../../src/evaluation/saboteur.js";
import type { EvaluationRequestV2 } from "../../src/evaluation/types.js";

function request(type: string, domain: "generic" | "sre" = "generic"): EvaluationRequestV2 {
  return {
    traceId: `trace-${domain}-${type}`,
    domain,
    context: "Synthetic context for near-neighbor generation.",
    proposedAction: { type, target: "synthetic-target", riskLevel: "medium" },
    rationale: `The rationale specifically discusses why ${type} is the next action.`,
  };
}

describe("generic near-neighbor alternatives", () => {
  it("keeps SRE alternatives stable", () => {
    const alternatives = generateNearNeighborAlternatives(request("terminate_idle_sessions", "sre"));

    expect(alternatives.map((alternative) => alternative.action.type)).toEqual([
      "increase_iops",
      "restart_service",
      "page_human",
    ]);
  });

  it.each([
    ["share_file", ["share_view_only", "ask_permission_confirmation", "do_not_share"]],
    ["send_email", ["draft_only", "ask_recipient_confirmation", "do_not_send"]],
    ["code_edit", ["add_test_first", "read_more_context", "run_verification"]],
    ["add_memory", ["save_as_hypothesis", "do_not_add_memory", "ask_memory_confirmation"]],
    ["mark_task_complete", ["run_verification", "keep_task_open", "request_human_review"]],
  ])("generates Hermes-style alternatives for %s", (type, expectedTypes) => {
    const alternatives = generateNearNeighborAlternatives(request(type));

    expect(alternatives.map((alternative) => alternative.action.type)).toEqual(expectedTypes);
    expect(alternatives.every((alternative) => alternative.generationMethod === "deterministic_near_neighbor")).toBe(true);
    expect(alternatives.every((alternative) => alternative.rationale.includes(type))).toBe(true);
  });

  it("uses generic default alternatives for unknown generic actions", () => {
    const alternatives = generateNearNeighborAlternatives(request("open_local_widget"));

    expect(alternatives.map((alternative) => alternative.action.type)).toEqual([
      "request_human_review",
      "narrow_scope",
      "do_nothing",
    ]);
  });
});
