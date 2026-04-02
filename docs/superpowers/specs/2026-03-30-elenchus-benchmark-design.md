# Elenchus Benchmark — Design Spec

## Purpose

This benchmark measures whether the Elenchus Validator makes reasoning hard to vary under adversarial attack. It is not a benchmark for truth in the abstract, and it is not a generic argument-quality grader.

The research questions are:

1. **Primary — hard-to-vary discrimination:** when context and conclusion are held fixed, can the validator separate a control argument from an adversarial fallacious variation?
2. **Exploratory — calibration:** does `concordanceScore` move with human argument-quality judgments on IBM Argument Quality?
3. **Conditional — verdict alignment:** if FOLIO records contain usable source-provided reasoning or proofs, do validator verdicts track FOLIO labels? If not, exclude FOLIO from v1.

## Architecture

Two-stage pipeline in a standalone Node.js/TypeScript project (`elenchus-benchmark`).

- **Stage 1 — Prepare:** download public datasets, sample records, normalize them into benchmark scenarios, and write `scenarios/*.json` plus a sample manifest.
- **Stage 2 — Run:** send scenarios to `POST /api/v1/intercept`, capture raw responses plus parsed benchmark metadata, and write resumable results.

The validator is always a separate process. The benchmark communicates over HTTP only and must not import validator source code. It pins each run to a validator URL, version, and git SHA. The benchmark relies only on the HTTP response contract (`score`, `terminalLog`) and must not duplicate validator thresholds, timeout values, or depth rules in benchmark logic. Any parsing of `terminalLog` is valid only for the pinned validator SHA.

## Project Structure

```text
elenchus-benchmark/
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── prepare/
│   │   ├── fallacy-pairs.ts
│   │   ├── ibm-aq.ts
│   │   └── folio.ts
│   ├── run/
│   │   └── runner.ts
│   └── types.ts
├── scenarios/                # generated, gitignored
│   ├── manifest.json
│   └── *.json
└── results/                  # generated, gitignored
    ├── pilot/
    ├── full/
    ├── checkpoints/
    ├── run-manifest.json
    └── summary.csv
```

## Dependencies

- Built-in `fetch` or a minimal Hugging Face client for dataset download
- Built-in `fetch` for validator HTTP calls
- `tsx` for running TypeScript
- No frameworks, no source-level validator dependency, no visualization stack in v1

## Types

### NormalizedScenario

```typescript
interface NormalizedScenario {
  id: string;
  source: "fallacy-pairs" | "ibm-aq" | "folio";
  evaluationMode: "pair" | "correlation" | "verdict";
  context: string;
  proposedAction: Record<string, unknown>; // validator accepts any JSON object
  reasoning: string;
  expectedScoreRange?: "high" | "low";
  humanQualityScore?: number;
  pairId?: string;
  pairRole?: "control" | "attack";
  metadata: {
    datasetId: string;
    datasetRevision?: string;
    datasetUrl: string;
    sourceRecordId: string;
    reasoningProvenance: {
      sourceField: string;
      transform: "verbatim" | "near-verbatim";
      notes?: string;
    };
    [key: string]: unknown;
  };
}
```

Not every dataset uses `expectedVerdict`. Verdict datasets populate it. Correlation datasets populate `humanQualityScore`. Pair datasets populate `pairId` and `pairRole`.

### RunResult

```typescript
interface RunResult {
  scenarioId: string;
  source: NormalizedScenario["source"];
  evaluationMode: NormalizedScenario["evaluationMode"];
  traceId: string;
  validator: {
    url: string;
    version?: string;
    gitSha: string;
  };
  raw: {
    httpStatus?: number;
    response?: {
      score: number;
      
      terminalLog: string[];
    };
    error?: string;
  };
  rawTerminalLog: string[];
  parsed: {
    latencyMs: number;
    rounds?: number;
    terminationReason?: string;
    systemFailure: boolean;
    failureClass?: "missing_api_key" | "timeout" | "saboteur_error" | "judge_error" | "network" | "http";
  };
  timestamp: string;
}
```

`rounds` and `terminationReason` may be parsed from standardized `terminalLog` line prefixes, but that parser must be keyed to a validator git SHA. If no parser exists for the pinned SHA, keep those fields unset and preserve the raw log.

## Prepare-Stage Rules

1. Use source-provided reasoning verbatim or near-verbatim only.
2. Allowed edits are light normalization only: trimming boilerplate, de-markup, whitespace cleanup, and non-substantive clipping.
3. Do **not** generate reasoning with an LLM, synthesize chains of thought, or paraphrase logic in a way that changes the substance.
4. If a record does not contain usable source-provided reasoning, skip it and resample.
5. Record reasoning provenance in `metadata.reasoningProvenance`.

## Dataset Transformations

### Contrastive Fallacy Pairs (primary benchmark)

- Dataset: `Navy0067/contrastive-pairs-for-logical-fallacy`
- Target sample: 30 pairs / 60 scenarios
- `evaluationMode: "pair"`
- Each pair keeps context and proposed action aligned while changing only the reasoning:
  - `pairRole: "control"` -> `expectedVerdict: "ALLOW"`
  - `pairRole: "attack"` -> `expectedVerdict: "DENY"`
- Required metadata: `pairId`, `fallacyType`

This is the main discrimination test because it measures whether the validator resists adversarial variation rather than merely rewarding fluent prose.

### IBM Argument Quality 30K (exploratory only)

- Dataset: `ibm-research/argument_quality_ranking_30k`
- Target sample: 50 scenarios, stratified across available human quality scores
- `evaluationMode: "correlation"`
- Use source argument text as `reasoning`
- Populate `humanQualityScore`; do **not** derive a binary `expectedVerdict`

This dataset is calibration-only. It can show whether validator scores co-vary with human judgments, but it is not the primary success criterion.

### FOLIO (conditional)

- Dataset: `tasksource/folio`
- Include only if sampled records contain usable source-provided reasoning/proof text
- `evaluationMode: "verdict"`
- Map labels to `expectedVerdict` only for included records
- If a candidate sample lacks usable reasoning, resample
- If the dataset cannot meet this requirement without synthesized reasoning, exclude FOLIO from v1 and record the exclusion in the sample manifest

## Runner Behavior

1. Read `scenarios/manifest.json` and all scenario files.
2. Run a required **pilot** before the full benchmark: 10 scenarios total across the included datasets. The pilot must validate request shape, raw response capture, parser coverage for the pinned validator SHA, and failure classification.
3. Build each request as:

   ```json
   {
     "traceId": "<scenario-id>",
     "context": "<scenario-context>",
     "proposedAction": { "...": "any JSON object" },
     "reasoning": "<scenario-reasoning>"
   }
   ```

4. Execute sequentially over HTTP. After each scenario, write the result and update a checkpoint file in `results/checkpoints/`.
5. Support resume: a resumed run skips scenario IDs already present in the checkpoint unless explicitly re-run.
6. Persist both:
   - the raw validator response (`score`, `terminalLog`)
   - parsed benchmark metadata (`latencyMs`, `rounds`, `terminationReason`, `systemFailure`, `failureClass`, validator URL/version/SHA, trace ID)
7. Treat fail-closed `DENY` results caused by missing API key, timeouts, or saboteur/judge errors as **system failures**. Keep the raw response, but classify them separately from task-level performance.
8. Never infer `ALLOW` or `DENY` from a benchmark-local score threshold. Use the validator's returned `score` and the pinned validator SHA as the source of truth.

## Reproducibility Metadata

The benchmark must emit enough metadata to rerun the same sample:

- dataset IDs, revisions, and source URLs
- sampling seed
- sample manifest with selected record IDs and any exclusions
- benchmark timestamp
- validator URL, version, and git SHA
- benchmark environment config (at minimum: Node version, benchmark git SHA if available, and non-secret run settings)

`scenarios/manifest.json` owns sampling provenance. `results/run-manifest.json` owns execution provenance.

## Output Artifacts

### Summary CSV

One row per scenario. Columns may be blank when a field does not apply to that evaluation mode:

`id,source,evaluationMode,expectedVerdict,humanQualityScore,pairId,pairRole,score,latencyMs,rounds,terminationReason,systemFailure,failureClass,traceId,validatorGitSha`

### Required External Analysis Artifacts

If analysis stays outside the runner, it must still emit:

- `metrics.json` — dataset-level metrics, baselines, confidence intervals, and run metadata references
- `pair-breakdown.csv` — one row per fallacy pair with control outcome, attack outcome, and strict-pair success/failure
- a reproducible script or notebook that reads the run manifest and raw results and regenerates the reported numbers

## Analysis Requirements

1. **Fallacy pairs (primary):**
   - strict pair accuracy = control `ALLOW` **and** attack `DENY`
   - 95% confidence interval
   - component breakdown: control-ALLOW rate, attack-DENY rate, false-ALLOW rate on attacks, false-DENY rate on controls
   - compare against trivial baselines (`always ALLOW`, `always DENY`, and random balanced guessing)

2. **IBM AQ (exploratory):**
   - Spearman correlation between `humanQualityScore` and `concordanceScore`
   - 95% confidence interval
   - no threshold-based pass/fail claim

3. **FOLIO (only if included):**
   - verdict accuracy with confidence interval
   - label-wise breakdown
   - comparison against trivial baselines, especially class-majority and always-`DENY`

## What This Does Not Include

- No retry logic or rate limiting in v1
- No parallel execution in v1
- No validator source dependency
- No synthetic reasoning generation
- No claims tied to benchmark-local copies of validator thresholds or timeout constants

## Usage

```bash
npm run prepare
npm run benchmark:pilot
npm run benchmark -- --resume
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| VALIDATOR_URL | No | http://localhost:3000 | Validator HTTP endpoint |
| VALIDATOR_GIT_SHA | Yes | — | Validator revision this run is pinned to |
| VALIDATOR_VERSION | No | — | Human-readable validator version label |
| BENCHMARK_SEED | Yes | — | Sampling seed for reproducibility |
| HF_TOKEN | No | — | Hugging Face token if a dataset requires it |
