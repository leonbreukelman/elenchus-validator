# Core Signal Validation Phase Plan

> For Hermes: implement this directly and keep scope intentionally narrow. Do not use this plan to add new platform infrastructure.

Goal: validate whether Elenchus' current core signal answers: "How hard-to-vary and load-bearing is this rationale for the proposed action?"

Architecture: add one small validation runner around the existing v2 evaluation pipeline. It accepts anonymized SRE incident cases with optional human labels, emits compact per-case signal rows, and makes those rows easy to compare with human judgment. No sidecar, MCP, prompt-directory, saboteur, or response-shape expansion belongs in this phase.

Housekeeping scope note: this document is phase-local. The same repository housekeeping commit may capture separately planned provider-abstraction and Hermes action-review sidecar slices; those are tracked in their own plan files and in `docs/plans/2026-05-30-repo-housekeeping-capture.md`, not as part of this core-signal phase.

Tech stack: TypeScript, existing `evaluateRequestV2` pipeline, Vitest.

## Acceptance criteria

- A runnable script accepts a JSON collection of anonymized SRE incident context, proposed action, rationale, and optional human labels.
- Output includes the minimal inspection signals only:
  - `specificity_margin`
  - `rationale_specificity` and current subscore vector
  - load-bearing grounding anchors with status, kind, text, and notes
  - short critique/notes
  - optional human label fields copied through for comparison
- Output is structured for comparison: machine-readable JSON plus CSV row output.
- The minimal consumable signal shape is documented without turning it into a report format.
- Existing `src/sidecar/`, `examples/sidecar/`, `test/sidecar/`, sidecar README/package scripts, and the Hermes action-review sidecar plan are assessed directly and treated as out-of-scope for this phase.
- No shared `SupportScorer`, LLM saboteur, prompt directory, MCP routing, broad response-shape overhaul, or further sidecar development is added.

## Files to add or modify

- Create `src/evaluation/sreSignalValidation.ts` for schema parsing, pipeline invocation, minimal signal extraction, JSON/CSV rendering, and output writing.
- Create `src/evaluation/runSreSignalValidation.ts` as the tiny CLI entrypoint.
- Create `test/evaluation/sre-signal-validation.test.ts` with tests first.
- Create `benchmark/fixtures/sre/sre-signal-validation-sample.json` as a tiny schema smoke fixture, clearly marked non-validating.
- Create `docs/core-signal-validation.md` documenting input shape, command, minimal output shape, human-label comparison, sidecar assessment, and current recommendation.

Do not modify `src/sidecar/`, `examples/sidecar/`, `test/sidecar/`, MCP routes, prompt directories, or provider abstractions.

## TDD task slices

1. RED: test that a small in-memory validation collection produces one compact case output with human label passthrough, `specificity_margin`, `rationale_specificity`, subscore vector, load-bearing anchors, and critique notes.
2. RED: test that JSON and CSV renderers expose human labels beside machine signals without raw framework report bloat.
3. RED: test that malformed input fails with a clear schema error.
4. GREEN: implement only the smallest validation helper and CLI needed to pass those tests.
5. GREEN: add a tiny sample fixture and run the CLI against it, writing output under ignored `benchmark-output/sre-signal-validation/`.
6. Document the minimal signal shape and the sidecar decision.

## Verification commands

- `npx vitest run test/evaluation/sre-signal-validation.test.ts`
- `npm test -- --runInBand`
- `npm run lint`
- `node --import tsx src/evaluation/runSreSignalValidation.ts benchmark/fixtures/sre/sre-signal-validation-sample.json benchmark-output/sre-signal-validation/sample-run`

## Sidecar decision for this phase

The sidecar work does not align with the narrow validation goal. It may be useful later as a separate integration/product surface, but for this phase it should be paused and moved out of the main validation path. The core recommendation is: keep the accepted provider abstraction, do not extend sidecar code, and either remove sidecar changes from the next mainline diff or preserve them on a separate branch for later review.

## Risks and interpretation guardrails

- Real anonymized incident data is required before making product claims; the included sample fixture is only a smoke test.
- Human labels are copied through for comparison, not treated as ground truth unless the dataset provenance says so.
- The current signal is `uncalibrated_internal_alpha`; outputs must not claim correctness, safety, faithfulness, or production allow/deny readiness.
- If real-data results show poor separation between strong and weak human labels, pause productization and revisit the signal, not the infrastructure.
