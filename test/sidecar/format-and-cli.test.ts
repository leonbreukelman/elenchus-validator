import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { reviewHermesAction } from "../../src/sidecar/actionReview.js";
import { advisoryExitCode, defaultActionReviewOutputDir, renderActionReviewCard } from "../../src/sidecar/format.js";

const execFileAsync = promisify(execFile);
const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Hermes sidecar formatting and CLI", () => {
  it("renders an advisory-only terminal card", async () => {
    const result = await reviewHermesAction({
      traceId: "card-render",
      context: "Synthetic context says a test fails in src/card.ts.",
      proposedAction: { type: "code_edit", target: "src/card.ts", riskLevel: "medium" },
      rationale: "Because the failing test names src/card.ts, a narrow code edit is proposed for operator review.",
    });

    const card = renderActionReviewCard(result, { reportPath: "/tmp/sanitized-report.json" });

    expect(card).toContain("Hermes / Elenchus Action Review");
    expect(card).toContain("ADVISORY ONLY");
    expect(card).toContain("DO NOT AUTO-EXECUTE");
    expect(card).toContain("code_edit");
    expect(card).toContain(result.advisory.decision);
    expect(card).toContain("/tmp/sanitized-report.json");
  });

  it("sanitizes trace ids before composing default output dirs", async () => {
    const result = await reviewHermesAction({
      traceId: "../../etc/passwd",
      context: "Synthetic context for path traversal.",
      proposedAction: { type: "code_edit", riskLevel: "medium" },
      rationale: "Because synthetic context exists, a code edit is proposed.",
    });
    const baseDir = await mkdtemp(join(tmpdir(), "sidecar-path-"));
    temporaryPaths.push(baseDir);

    const outputDir = defaultActionReviewOutputDir(result, baseDir, "2026-05-03T00-00-00-000Z");

    expect(resolve(outputDir).startsWith(resolve(baseDir))).toBe(true);
    expect(outputDir).not.toContain("..");
  });

  it("maps advisory decisions to explicit exit codes", () => {
    expect(advisoryExitCode("ready_for_operator_review")).toBe(0);
    expect(advisoryExitCode("revise_or_gather_context")).toBe(2);
    expect(advisoryExitCode("escalate_to_operator")).toBe(3);
    expect(advisoryExitCode("evaluation_error")).toBe(4);
  });

  it("CLI writes sanitized output to a custom directory and uses advisory exit code", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "sidecar-cli-"));
    temporaryPaths.push(tempDir);
    const inputPath = join(tempDir, "input.json");
    const outputDir = join(tempDir, "out");
    await writeFile(
      inputPath,
      JSON.stringify({
        traceId: "cli-share-mismatch",
        context: "CLI_RAW_CONTEXT_DO_NOT_PRINT says only view access was requested.",
        proposedAction: {
          type: "share_file",
          target: "/private/CLI_DOC_TOKEN",
          parameters: { permission: "edit", recipients: ["CLI_RECIPIENT_TOKEN"] },
          riskLevel: "high",
        },
        rationale: "CLI_RAW_RATIONALE_DO_NOT_PRINT says sharing is convenient.",
      }),
      "utf8"
    );

    let stdout = "";
    let stderr = "";
    let exitCode = 0;
    try {
      const result = await execFileAsync("node", ["--import", "tsx", "src/sidecar/runActionReview.ts", inputPath, "--out", outputDir], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error) {
      const failed = error as { stdout?: string; stderr?: string; code?: number };
      stdout = failed.stdout ?? "";
      stderr = failed.stderr ?? "";
      exitCode = typeof failed.code === "number" ? failed.code : 1;
    }

    expect(exitCode).toBe(2);
    expect(stderr).toBe("");
    expect(stdout).toContain("DO NOT AUTO-EXECUTE");
    expect(stdout).not.toContain("CLI_RAW_CONTEXT_DO_NOT_PRINT");
    expect(stdout).not.toContain("CLI_RAW_RATIONALE_DO_NOT_PRINT");
    expect(stdout).not.toContain("CLI_DOC_TOKEN");
    expect(stdout).not.toContain("CLI_RECIPIENT_TOKEN");

    const report = await readFile(join(outputDir, "report.json"), "utf8");
    expect(report).not.toContain("CLI_RAW_CONTEXT_DO_NOT_PRINT");
    expect(report).not.toContain("CLI_DOC_TOKEN");
  }, 20_000);
});
