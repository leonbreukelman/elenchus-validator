import path from "node:path";
import {
  loadSreSignalValidationCases,
  renderSreSignalValidationStdoutSummary,
  runSreSignalValidation,
  writeSreSignalValidationOutputs,
} from "./sreSignalValidation.js";

function usage(): string {
  return [
    "Usage: node --import tsx src/evaluation/runSreSignalValidation.ts <cases.json> [output-dir]",
    "",
    "Input must be a JSON array or { \"cases\": [...] } of anonymized SRE rationale/action cases.",
    "Outputs: result.json and comparison.csv under the output directory.",
  ].join("\n");
}

const inputPath = process.argv[2];
if (!inputPath || inputPath === "--help" || inputPath === "-h") {
  process.stderr.write(`${usage()}\n`);
  process.exit(inputPath ? 0 : 1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = process.argv[3] ?? path.join("benchmark-output", "sre-signal-validation", timestamp);

try {
  const cases = await loadSreSignalValidationCases(inputPath);
  const result = await runSreSignalValidation(cases);
  const outputs = await writeSreSignalValidationOutputs(result, outputDir);
  process.stdout.write(renderSreSignalValidationStdoutSummary(result, outputs));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
