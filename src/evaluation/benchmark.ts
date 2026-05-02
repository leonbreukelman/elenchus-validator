import { evaluateWithDeterministicProvider } from "./evaluator.js";
import type { CalibrationState, EvaluationReportV2, EvaluationRequestV2 } from "./types.js";

export interface SeedBenchmarkFixture {
  id: string;
  label: "specific" | "weak" | "ambiguous";
  request: EvaluationRequestV2;
}

export interface SeedBenchmarkResult {
  calibration: CalibrationState;
  claims: string[];
  summary: {
    itemCount: number;
    averageOverallSignal: number;
  };
  items: Array<{
    id: string;
    label: SeedBenchmarkFixture["label"];
    report: EvaluationReportV2;
  }>;
}

export async function runSeedBenchmark(fixtures: SeedBenchmarkFixture[]): Promise<SeedBenchmarkResult> {
  const items = await Promise.all(
    fixtures.map(async (fixture) => ({
      id: fixture.id,
      label: fixture.label,
      report: await evaluateWithDeterministicProvider(fixture.request),
    }))
  );
  const completeSignals = items
    .map((item) => item.report.overallSignal)
    .filter((signal): signal is number => typeof signal === "number");
  const averageOverallSignal =
    completeSignals.length === 0
      ? 0
      : Number((completeSignals.reduce((sum, signal) => sum + signal, 0) / completeSignals.length).toFixed(4));

  return {
    calibration: "uncalibrated_internal_alpha",
    claims: [
      "seed smoke benchmark only",
      "not human-labeled calibration",
      "not a production validation claim",
    ],
    summary: {
      itemCount: items.length,
      averageOverallSignal,
    },
    items,
  };
}
