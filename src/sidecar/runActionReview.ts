import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { reviewHermesAction } from "./actionReview.js";
import { advisoryExitCode, defaultActionReviewOutputDir, renderActionReviewCard, writeActionReviewArtifacts } from "./format.js";

function usage(): string {
  return "Usage: npm run review:action -- <input.json> [--input <input.json>] [--out <output-dir>]";
}

function parseArgs(argv: string[]): { inputPath: string; outputDir?: string } {
  let inputPath: string | undefined;
  let outputDir: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      inputPath = argv[index + 1];
      index += 1;
    } else if (arg === "--out") {
      outputDir = argv[index + 1];
      index += 1;
    } else if (!arg.startsWith("--") && !inputPath) {
      inputPath = arg;
    } else if (arg === "--help" || arg === "-h") {
      throw new Error(usage());
    }
  }
  if (!inputPath) throw new Error(usage());
  return { inputPath, outputDir };
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));
    const raw = await readFile(args.inputPath, "utf8");
    const value = JSON.parse(raw) as unknown;
    const result = await reviewHermesAction(value as never);
    const outputDir = args.outputDir ? resolve(args.outputDir) : defaultActionReviewOutputDir(result);
    const artifacts = await writeActionReviewArtifacts(result, outputDir);
    process.stdout.write(renderActionReviewCard(result, { reportPath: artifacts.reportPath, cardPath: artifacts.cardPath }));
    process.exitCode = advisoryExitCode(result.advisory.decision);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Hermes action review failed: ${message}\n`);
    process.exitCode = 1;
  }
}

await main();
