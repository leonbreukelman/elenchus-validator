import { describe, expect, it } from "vitest";
import { parseHermesActionReviewInput } from "../../src/sidecar/actionReview.js";

describe("Hermes action-review input parsing", () => {
  it("accepts valid string context and sanitizes caller trace ids", () => {
    const parsed = parseHermesActionReviewInput({
      traceId: "../../unsafe trace id",
      context: "Synthetic context says the failing test names src/widget.ts and the proposed edit is narrow.",
      proposedAction: { type: "code_edit", target: "src/widget.ts", riskLevel: "medium" },
      rationale: "Because the failing test names src/widget.ts, a narrow code_edit is the next reviewable step.",
    });

    expect(parsed.traceId).toBe("unsafe_trace_id");
    expect(parsed.traceIdHash).toHaveLength(64);
    expect(parsed.domain).toBe("generic");
    expect(parsed.contextSectionCount).toBe(1);
    expect(parsed.proposedAction.type).toBe("code_edit");
  });

  it("accepts labeled context sections and normalizes them into bounded context", () => {
    const parsed = parseHermesActionReviewInput({
      context: [
        { label: "user request", text: "Synthetic user asks for a draft-only email response." },
        { label: "thread summary", text: "Synthetic thread contains no requested attachment." },
      ],
      proposedAction: { type: "send_email", parameters: { recipients: ["synthetic reviewer token"] }, riskLevel: "medium" },
      rationale: "Because the thread asks for a draft-only response, sending an email requires operator review.",
    });

    expect(parsed.context).toContain("[user request]");
    expect(parsed.context).toContain("[thread summary]");
    expect(parsed.contextSectionCount).toBe(2);
  });

  it.each([
    [{ context: "", proposedAction: { type: "code_edit" }, rationale: "because" }, "context"],
    [{ context: "context", proposedAction: { type: "" }, rationale: "because" }, "proposedAction.type"],
    [{ context: "context", proposedAction: { type: "code_edit" }, rationale: "" }, "rationale"],
  ])("rejects malformed input mentioning %s", (value, expectedMessage) => {
    expect(() => parseHermesActionReviewInput(value)).toThrow(expectedMessage);
  });
});
