import { describe, expect, it } from "vitest";
import { runSeedBenchmark, type SeedBenchmarkFixture } from "../../src/evaluation/benchmark.js";
import seedFixtures from "../fixtures/sre-seed-benchmark.json" with { type: "json" };

describe("seed benchmark harness", () => {
  it("runs fixture evaluations without turning uncalibrated output into product claims", async () => {
    const fixtures = seedFixtures as SeedBenchmarkFixture[];
    const result = await runSeedBenchmark(fixtures);

    expect(result.calibration).toBe("uncalibrated_internal_alpha");
    expect(result.claims).toContain("seed smoke benchmark only");
    expect(result.items).toHaveLength(seedFixtures.length);
    expect(result.items.every((item) => item.report.status === "complete")).toBe(true);
    expect(result.summary.averageOverallSignal).toEqual(expect.any(Number));
  });
});
