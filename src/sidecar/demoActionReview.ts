import { readdir, readFile } from "node:fs/promises";
import * as path from "node:path";
import { reviewHermesAction } from "./actionReview.js";
import { renderActionReviewCard, writeActionReviewArtifacts } from "./format.js";

const fixtureDir = path.join("examples", "sidecar");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputRoot = path.join("sidecar-output", "demo", timestamp);

async function main(): Promise<void> {
  const files = (await readdir(fixtureDir)).filter((file) => file.endsWith(".json")).sort();
  process.stdout.write("Hermes / Elenchus sidecar demo\n");
  process.stdout.write("ADVISORY ONLY — HUMAN REVIEW REQUIRED — DO NOT AUTO-EXECUTE\n\n");

  for (const file of files) {
    const inputPath = path.join(fixtureDir, file);
    const value = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
    const result = await reviewHermesAction(value as never);
    const caseDir = path.join(outputRoot, file.replace(/\.json$/i, ""));
    const artifacts = await writeActionReviewArtifacts(result, caseDir);
    process.stdout.write(`case: ${file}\n`);
    process.stdout.write(`  traceId: ${result.traceId}\n`);
    process.stdout.write(`  action: ${result.action.type}\n`);
    process.stdout.write(`  advisoryDecision: ${result.advisory.decision}\n`);
    process.stdout.write(`  effectiveRecommendation: ${result.evaluation.effectiveRecommendation}\n`);
    process.stdout.write(`  findingCodes: ${result.advisory.findings.map((finding) => finding.code).join(", ") || "none"}\n`);
    process.stdout.write(`  canAutonomouslyExecute: ${result.advisory.canAutonomouslyExecute}\n`);
    process.stdout.write(`  reportPath: ${artifacts.reportPath}\n\n`);
  }

  process.stdout.write(`demoOutputRoot: ${outputRoot}\n`);
  process.stdout.write("\nExample full card for the share-permission case:\n");
  const shareValue = JSON.parse(await readFile(path.join(fixtureDir, "share-file-edit-mismatch.json"), "utf8")) as unknown;
  const shareResult = await reviewHermesAction(shareValue as never);
  process.stdout.write(renderActionReviewCard(shareResult));
}

await main();
