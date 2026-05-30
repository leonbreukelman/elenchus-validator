import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { reviewHermesAction } from "../../src/sidecar/actionReview.js";
import { renderActionReviewCard, writeActionReviewArtifacts } from "../../src/sidecar/format.js";

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const sensitiveInput = {
  traceId: "sanitize-sensitive-values",
  context: "RAW_CONTEXT_PHRASE_DO_NOT_PERSIST says only view access was requested for DOC_TOKEN_ABC123.",
  proposedAction: {
    type: "share_file",
    target: "/private/customer/DOC_TOKEN_ABC123",
    parameters: {
      permission: "edit",
      "customer/path/key": "SENSITIVE_PARAMETER_VALUE_DO_NOT_PERSIST",
      normalKey: "ANOTHER_RAW_VALUE_DO_NOT_PERSIST",
      recipients: ["SYNTHETIC_RECIPIENT_TOKEN_DO_NOT_PERSIST"],
    },
    expectedEffect: "RAW_EXPECTED_EFFECT_DO_NOT_PERSIST",
    riskLevel: "high" as const,
  },
  rationale: "RAW_RATIONALE_PHRASE_DO_NOT_PERSIST says edit access is convenient.",
  metadata: { source: "unit-test", secretLikeValue: "RAW_METADATA_VALUE_DO_NOT_PERSIST" },
};

describe("Hermes sidecar sanitization", () => {
  it("persists only the frozen sanitized report allowlist", async () => {
    const result = await reviewHermesAction(sensitiveInput);

    expect(Object.keys(result).sort()).toEqual([
      "action",
      "advisory",
      "createdAt",
      "evaluation",
      "grounding",
      "readiness",
      "request",
      "schemaVersion",
      "support",
      "traceId",
      "traceIdHash",
    ].sort());
    expect(Object.keys(result.request).sort()).toEqual([
      "contextHash",
      "contextSectionCount",
      "domain",
      "metadataKeys",
      "rationaleHash",
      "rawContentPersisted",
    ].sort());
    expect(Object.keys(result.action).sort()).toEqual([
      "expectedEffectHash",
      "parameterKeys",
      "riskLevel",
      "targetHash",
      "type",
    ].sort());
    expect(Object.keys(result.advisory).sort()).toEqual([
      "canAutonomouslyExecute",
      "decision",
      "findings",
      "humanReviewRequired",
      "nextSteps",
      "reasons",
    ].sort());
    expect(Object.keys(result.readiness).sort()).toEqual([
      "blockedUses",
      "operatorReviewRequired",
      "productionDecisionUse",
      "reviewNeeded",
      "reviewReasons",
    ].sort());
    expect(result.request.rawContentPersisted).toBe(false);
    expect(result.readiness.productionDecisionUse).toBe("not_validated_for_allow_deny");
  });

  it("does not leak raw context, rationale, target, parameter values, or sensitive-looking keys", async () => {
    const result = await reviewHermesAction(sensitiveInput);
    const serialized = JSON.stringify(result);
    const card = renderActionReviewCard(result);

    for (const forbidden of [
      "RAW_CONTEXT_PHRASE_DO_NOT_PERSIST",
      "DOC_TOKEN_ABC123",
      "/private/customer",
      "SENSITIVE_PARAMETER_VALUE_DO_NOT_PERSIST",
      "ANOTHER_RAW_VALUE_DO_NOT_PERSIST",
      "SYNTHETIC_RECIPIENT_TOKEN_DO_NOT_PERSIST",
      "RAW_EXPECTED_EFFECT_DO_NOT_PERSIST",
      "RAW_RATIONALE_PHRASE_DO_NOT_PERSIST",
      "RAW_METADATA_VALUE_DO_NOT_PERSIST",
      "customer/path/key",
    ]) {
      expect(serialized).not.toContain(forbidden);
      expect(card).not.toContain(forbidden);
    }
    expect(result.action.targetHash).toHaveLength(64);
    expect(result.action.parameterKeys).toContain("[redacted_key]");
    expect(result.action.parameterKeys).toContain("normalKey");
  });

  it("writes sanitized report and card artifacts", async () => {
    const result = await reviewHermesAction(sensitiveInput);
    const outputDir = await mkdtemp(join(tmpdir(), "sidecar-artifacts-"));
    temporaryPaths.push(outputDir);

    const artifacts = await writeActionReviewArtifacts(result, outputDir);
    const report = await readFile(artifacts.reportPath, "utf8");
    const card = await readFile(artifacts.cardPath, "utf8");

    expect(report).toContain("hermes-action-review-v0-alpha-2026-05-03");
    expect(card).toContain("DO NOT AUTO-EXECUTE");
    expect(report).not.toContain("RAW_CONTEXT_PHRASE_DO_NOT_PERSIST");
    expect(card).not.toContain("RAW_RATIONALE_PHRASE_DO_NOT_PERSIST");
  });
});
