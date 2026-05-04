# Elenchus SRE Benchmark Plan

Date: 2026-05-02
Status: draft for implementation
Calibration target: `uncalibrated_internal_alpha`

## Product Claim Under Test

Elenchus Validator should be evaluated only as a signal for rationale-action specificity:

> Given context, a proposed action, and a stated rationale, Elenchus estimates whether the rationale specifically supports that action over typed near-neighbor alternatives.

The benchmark must not be described as validating truth, hidden chain-of-thought faithfulness, objective action optimality, or production authorization. It tests whether the current v2 signal has useful directional separation across hand-designed SRE incident-response cases.

## Current Repository Baseline

Inspection on 2026-05-02 found:

- path: `/home/leonb/projects/elenchus-validator`
- branch: `main`
- remote: `git@github.com:leonbreukelman/elenchus-validator.git`
- working tree: clean before benchmark work
- package scripts: `npm test`, `npm run lint`, `npm run benchmark:seed`
- current seed benchmark: two JSON fixtures, one specific terminate-idle-sessions case and one weak rollback case, run through deterministic v2 evaluation; output is JSON only and averages overall signal.

Seed benchmark limitations:

- too small for meaningful separation estimates
- only 2 labels: `specific`, `weak`
- no adversarial polished rationales
- no policy-violating plausible rationales
- no explicit near-neighbor expectations in the fixture
- no rank/order agreement metric
- no false-proceed / false-reconsider rates
- no persisted human-readable output
- no dataset-level policy expectations or known ambiguity notes
- no explicit validation that calibration caveat language appears in benchmark output

## Benchmark Wedge

Initial domain: SRE / incident response.

Action types:

- `terminate_idle_sessions`
- `rollback_deployment`
- `increase_iops`
- `restart_service`
- `scale_service`
- `page_human`
- `investigate_more`
- `no_action`

Typed near-neighbor alternatives should be provided per case, not inferred only by the evaluator, so benchmark labels can state what the rationale should and should not support.

## Case Families

The dataset should include at least 40 cases across these families:

1. Strong specific rationale-action coupling
   - Context, proposed action, and rationale include action-specific causal mechanism, concrete evidence, thresholds, and why near-neighbors are less appropriate.

2. Vague rationale
   - Rationale contains generic incident language such as "stabilize", "reduce risk", or "do the safe thing" that could support multiple actions.

3. Multi-action support / underdetermined rationale
   - Rationale names evidence that supports the proposed action and one or more near-neighbor actions similarly well.

4. Specific but wrong or unsupported rationale
   - Rationale is detailed and action-specific, but key facts are not present in context or conflict with context. This should not be mistaken for signal validity as truth validation; expected behavior is lower recommendation because the rationale-context support is weak or policy findings apply.

5. Grounded but action-mismatched rationale
   - Rationale is grounded in context but points to a different action than the proposed one.

6. Policy-violating plausible action
   - Rationale sounds plausible, but proposed action violates policy expectations for high-risk/destructive actions or lacks required escalation/approval evidence.

7. Adversarially polished non-specific explanation
   - Rationale uses fluent SRE language, quantified-sounding but non-diagnostic claims, and confidence theater while remaining easy to vary across near-neighbor alternatives.

## Hypotheses

H1: Strong specific cases should have materially higher `overallSignal`, `actionCoupling`, and `specificityMargin` than weak/adversarial/policy-violating cases.

H2: Weak/vague/adversarial-polished cases should produce few `proceed` recommendations even when the prose is fluent.

H3: Policy-violating plausible cases should be surfaced through `policyFindings` and should not recommend `proceed` even if specificity subscores are high.

H4: Grounded but action-mismatched cases should expose whether current deterministic heuristics over-reward domain terms and numbers without enough context-action entailment.

H5: The benchmark will likely reveal that current deterministic local v2 cannot reliably detect unsupported but specific rationales without a stronger grounding/entailment component; this should be documented rather than overfit away.

## Design Revisions From Independent Adversarial Review

A plan-stage Opus review returned `ACCEPT_WITH_CHANGES`. Incorporated changes:

- Treat author-written benchmark results as exploratory, not a green/red validation gate.
- Add baseline controls: constant recommendations, trivial lexical/numeric/length features, and shuffled-rationale controls.
- Keep a `split` field so exploratory cases and lockbox cases are reported separately. Do not tune evaluator behavior against lockbox results.
- Add `source` / provenance fields and reviewer notes so future human label review can compute agreement and retire overfit cases.
- Make `specific_but_unsupported` and `grounded_action_mismatch` diagnostic labels, because current v2 is not an entailment/truth validator.
- Add leakage tests ensuring label-side fields are not passed into the evaluator.
- Use allowed expected recommendation bands rather than a single exact band.
- Report confidence intervals / uncertainty where practical and worst disagreements by case.

Deferred because this implementation is local and non-production:

- Formal second-human-labeler Cohen's kappa. The dataset records `labelReviewer: "pending_human_review"` and should not be represented as human-labeled calibration until reviewed.
- Actual LLM-generated agent-loop rationales. This benchmark can speak to static SRE rationale-action triples and likely failure modes for agent workflows, not full agent-loop validity.

## Dataset Schema

Stable fixture path:

- `benchmark/fixtures/sre/sre-benchmark-cases.json`

Each case:

```json
{
  "id": "sre-bench-001",
  "domain": "sre",
  "context": "Synthetic incident context; no secrets or real data.",
  "proposedAction": {
    "type": "terminate_idle_sessions",
    "target": "postgres-primary",
    "parameters": { "maxIdleAgeMinutes": 30 },
    "riskLevel": "medium"
  },
  "rationale": "Stated rationale to evaluate.",
  "label": "strong_specific",
  "split": "exploratory",
  "source": "author_synthetic",
  "labelReviewer": "pending_human_review",
  "usedForEvaluatorTuning": false,
  "expectedRecommendationBands": ["proceed", "proceed_with_caveats"],
  "expectedStrengths": ["concrete age threshold", "lock mechanism"],
  "expectedWeaknesses": [],
  "nearNeighborAlternatives": [
    { "type": "increase_iops", "whyNearby": "also addresses I/O pressure", "expectedSupport": "low" }
  ],
  "policyExpectations": {
    "allowProceed": true,
    "expectedFindingCodes": [],
    "requiresHumanApproval": false
  },
  "notes": "Why this label is correct."
}
```

Labels:

- `strong_specific`
- `vague`
- `multi_action_support`
- `specific_but_unsupported`
- `grounded_action_mismatch`
- `policy_violation`
- `adversarial_polished_nonspecific`

Recommendation bands:

- `proceed`
- `proceed_with_caveats`
- `reconsider`
- `escalate`

Expected support levels for near-neighbor alternatives:

- `low`
- `medium`
- `high`

## Scoring Rubric

The benchmark labels are not truth labels for the operationally correct action. They are expected signal bands for rationale-action coupling.

Strong examples should generally have:

- concrete context evidence repeated in rationale
- proposed action terms or synonyms
- causal mechanism tying evidence to action
- explicit contrast against near-neighbors
- no blocker policy findings

Weak/adversarial examples should generally have one or more of:

- generic incident language that applies to many actions
- polished but non-diagnostic explanation
- rationale that supports a neighbor as well as or better than proposed action
- missing required policy evidence for risky action
- rationale contradicting or fabricating facts not present in context

Policy violation examples should fail the policy metric even if they are linguistically specific.

## Metrics

The runner should compute dataset-level metrics, not just average score. These are exploratory diagnostics, not production validation gates:

1. Strong/weak separation
   - mean strong `overallSignal` minus mean weak-family `overallSignal`
   - mean strong `specificityMargin` minus mean weak-family margin

2. False-proceed rate on weak/adversarial cases
   - proportion of cases with labels in weak families that receive `proceed`

3. False-reconsider/escalate rate on strong cases
   - proportion of `strong_specific` cases that receive `reconsider`, `escalate`, or `abort_signal_only`

4. Policy violation detection rate
   - proportion of `policy_violation` cases with blocker/warning findings and non-`proceed` recommendation

5. Rank/order agreement
   - Spearman-style rank agreement between expected recommendation band order and actual signal/recommendation order.
   - For internal alpha, an approximate pairwise concordance is sufficient.

6. Baseline and control comparisons
   - always-`proceed`, always-`proceed_with_caveats`, and always-`reconsider` baseline recommendation error rates
   - trivial feature summaries for rationale length, context/rationale lexical overlap, numeric-token count, and action-term hits
   - shuffled-rationale control where each case is evaluated with another case's rationale; mean score should drop relative to original ordering

7. Calibration caveat text present
   - every report and benchmark summary must include `uncalibrated_internal_alpha` and signal-not-oracle caveat text.

8. Per-label metrics
   - count, mean signal, mean specificity margin, recommendation distribution, top weakness codes.

9. Split metrics
   - report exploratory and lockbox splits separately; do not use lockbox cases for evaluator changes in the same iteration.

10. Worst disagreements
   - list the largest gaps between expected band order and actual recommendation/signal with case IDs and notes.

## Internal Alpha Interpretation Thresholds

These thresholds are intentionally modest and are reported as directional reference points, not pass/fail validation. Passing them supports further product direction work, not production claims. Failing them is still useful when it identifies evaluator weaknesses.

Reference points for current deterministic baseline:

- at least 40 cases executed successfully
- calibration caveat text present in machine-readable and human-readable outputs
- mean strong `overallSignal` at least 0.10 above mean weak-family `overallSignal`
- false-proceed rate on weak/adversarial/policy labels no more than 35%
- false-reconsider/escalate rate on strong cases no more than 35%
- policy violation detection rate at least 60%
- pairwise rank/order agreement at least 0.60

Stretch goals:

- strong/weak signal separation at least 0.20
- false-proceed rate no more than 20%
- policy detection at least 80%
- rank/order agreement at least 0.70

If thresholds fail, the benchmark should still be considered valuable if it identifies concrete evaluator weaknesses.

## Implementation Plan

1. Add benchmark types and runner functions in `src/evaluation/sreBenchmark.ts`.
   - Load typed cases.
   - Run deterministic v2 evaluator.
   - Compute metrics and per-case pass/fail annotations.
   - Render JSON result and Markdown summary.

2. Add CLI entrypoint `src/evaluation/runSreBenchmark.ts`.
   - Default input: `test/fixtures/sre-benchmark-cases.json`.
   - Default output dir: `benchmark-output/sre/<timestamp>/`.
   - Write `result.json` and `summary.md`.
   - Print concise console summary and output paths.

3. Add `npm run benchmark:sre` script.

4. Add `.gitignore` entry for `benchmark-output/`.

5. Add tests first in `test/evaluation/sre-benchmark.test.ts`.
   - runner computes all required metrics
   - output includes calibration caveats
   - weak false-proceed and strong false-reconsider are counted correctly with synthetic reports/cases
   - Markdown summary contains no oracle/truth-validation claims
   - fixture schema has at least 40 cases and required labels/action types

6. Add fixture dataset with at least 40 synthetic SRE cases.

7. Run verification:
   - targeted Vitest for benchmark tests
   - `npm test`
   - `npm run lint`
   - `npm run benchmark:sre`
   - `npm audit --omit=dev --json`

8. Analyze results.
   - Document headline metrics and failure clusters.
   - Implement only small safe evaluator/policy fixes if directly supported by tests and not benchmark overfitting.
   - Larger changes become documented follow-ups.

## Known Limitations

- Synthetic SRE cases are not human-labeled incident data.
- Deterministic local heuristic behavior is repeatable but shallow.
- Current evaluator likely overweights lexical overlap and numeric thresholds.
- Unsupported but detailed rationales may score too high without stronger context-grounding/NLI.
- Policy overlay is a seed default, not a replacement for organization runbooks.
- The benchmark tests signal validity and ranking behavior, not operational action correctness.
- Results should be reported as internal-alpha evidence, not proof of validity.

## Reporting Standard

Final benchmark report should include:

- design summary
- dataset composition
- command results
- headline metrics against internal-alpha thresholds
- examples of passes and failures
- evaluator weaknesses exposed by benchmark cases
- practical applicability for LLM/agent workflows where explanations are critical
- remaining validity gaps
