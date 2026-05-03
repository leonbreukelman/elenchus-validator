import path from "node:path";
import { loadSreBenchmarkFixture, renderSreBenchmarkStdoutSummary, runSreBenchmark, writeSreBenchmarkOutputs } from "./sreBenchmark.js";

const fixturePath = process.argv[2] ?? "benchmark/fixtures/sre/sre-benchmark-cases.json";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = process.argv[3] ?? path.join("benchmark-output", "sre", timestamp);

const fixture = await loadSreBenchmarkFixture(fixturePath);
const result = await runSreBenchmark(fixture.cases, {
  fixtureFullContentFingerprint: fixture.fixtureFullContentFingerprint,
  fixtureFullContentHashAlgorithm: fixture.fixtureFullContentHashAlgorithm,
});
const outputs = await writeSreBenchmarkOutputs(result, outputDir);

process.stdout.write(renderSreBenchmarkStdoutSummary(result, outputs));
