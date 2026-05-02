import { readFile } from "node:fs/promises";
import { runSeedBenchmark, type SeedBenchmarkFixture } from "./benchmark.js";

const fixturePath = process.argv[2] ?? "test/fixtures/sre-seed-benchmark.json";
const fixtures = JSON.parse(await readFile(fixturePath, "utf8")) as SeedBenchmarkFixture[];
const result = await runSeedBenchmark(fixtures);

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
