import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reviewHermesAction } from "../../src/sidecar/actionReview.js";

const fixtureDir = join(process.cwd(), "examples", "sidecar");

describe("Hermes sidecar fixtures", () => {
  it("all fixtures are valid and advisory-only", async () => {
    const files = (await readdir(fixtureDir)).filter((file) => file.endsWith(".json")).sort();
    expect(files).toEqual([
      "delete-file-destructive.json",
      "grounded-code-action.json",
      "memory-grounding-gap.json",
      "send-email-missing-recipients.json",
      "share-file-edit-mismatch.json",
    ]);

    for (const file of files) {
      const value = JSON.parse(await readFile(join(fixtureDir, file), "utf8"));
      const result = await reviewHermesAction(value);
      expect(result.advisory.humanReviewRequired).toBe(true);
      expect(result.advisory.canAutonomouslyExecute).toBe(false);
      expect(result.request.rawContentPersisted).toBe(false);
    }
  });

  it("fixtures exercise expected advisory findings", async () => {
    const cases: Array<[string, string]> = [
      ["share-file-edit-mismatch.json", "share_permission_not_grounded"],
      ["send-email-missing-recipients.json", "missing_recipients"],
      ["delete-file-destructive.json", "irreversible_destructive_action_requires_explicit_confirmation"],
      ["memory-grounding-gap.json", "generic_domain_signal_unreliable"],
    ];

    for (const [file, code] of cases) {
      const value = JSON.parse(await readFile(join(fixtureDir, file), "utf8"));
      const result = await reviewHermesAction(value);
      expect(result.advisory.findings.map((finding) => finding.code)).toContain(code);
    }
  });
});
