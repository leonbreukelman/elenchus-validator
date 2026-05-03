# Elenchus Production-Readiness Gap Remediation Plan

Date: 2026-05-03
Repository: `/home/leonb/projects/elenchus-validator`
Baseline branch/HEAD: `main` at `9e24f13` (`Add context grounding remediation for rationale support`), ahead of `origin/main` by 2 local commits.
Plan status: Opus max-effort plan review returned ACCEPT_WITH_CHANGES; blocking feedback incorporated before implementation.
Calibration target for this iteration: `uncalibrated_internal_alpha` / advisory-only hardening. This plan does not attempt production allow/deny gating.

## Goal

Advance Elenchus's internal-alpha advisory hygiene and production-readiness instrumentation without overclaiming production-grade validation. The next remediation should address remaining context-grounding/benchmark-validity gaps by combining:

1. General synthetic-testable fixes for known deterministic grounding misclassification risks.
2. Explicit advisory-mode/readiness metadata so v2 reports cannot be interpreted as production allow/deny gates.
3. Benchmark validity instrumentation: confidence intervals, confusion matrices, review-needed rates, and threshold-governance output.
4. Documentation that preserves internal-alpha framing and explains the remaining gaps honestly.

This plan intentionally does **not** lower thresholds, inspect raw lockbox prose, add lockbox-shaped rules, or claim calibrated production readiness.

## Product framing constraints

Elenchus estimates rationale-action specificity and related internal-alpha signals. `contextGrounding` is a deterministic evidence-alignment proxy over supplied context only. It is non-causal, non-authoritative, cannot prove correctness, cannot validate hidden chain-of-thought faithfulness, cannot verify objective truth, and is not a substitute for operator review.

Target status after this plan, if successful: internal-alpha advisory hardening and PR-ready code/docs. Possible future status after separate human-labeled calibration work: production-advisory-only. Production gating remains out of scope.

## Preflight findings

Initial inspection commands rerun on 2026-05-03:

- `pwd`: `/home/leonb/projects/elenchus-validator`
- git toplevel: `/home/leonb/projects/elenchus-validator`
- branch: `main`
- HEAD: `9e24f13`
- status: `## main...origin/main [ahead 2]`
- remote: `git@github.com:leonbreukelman/elenchus-validator.git`
- latest commits include `9e24f13 Add context grounding remediation for rationale support`, `827ac52 Add SRE benchmark harness for rationale-action specificity`, and `c5c45d7 docs: add David Deutsch tribute (#7)`.

Reviewed required docs/source/tests and prior review result text. Latest benchmark output inspected only for aggregate/split/label/threshold metrics; no raw lockbox `context` or `rationale` prose was inspected.

## Research summary and methodology selection

The research note is saved at:

- `docs/research/2026-05-03-elenchus-production-eval-methodology.md`

Relevant conclusions:

- Evidence-grounded evaluation should decompose claims/anchors and attribute them to supplied evidence, but deterministic proxies remain limited.
- LLM-as-judge, NLI, and span-attribution methods are promising for future production advisory mode, but only after human-labeled calibration and governance exist.
- Score bands need calibration, reliability diagrams, confidence intervals, and held-out split discipline; 42 synthetic cases cannot validate production thresholds.
- Systems that evaluate rationales must not claim hidden chain-of-thought faithfulness; generated rationales can be post-hoc/unfaithful.
- The correct near-term remediation is hybrid: deterministic hardening for pre-existing general bugs plus advisory-mode and benchmark-validity instrumentation.

Selected methodology for this iteration:

- Keep deterministic-only runtime evaluation.
- Do not add a model/judge path in production code.
- Add CI/confusion/review-needed benchmark instrumentation, including fixed-seed bootstrap intervals for mean separations/gaps.
- Add advisory/readiness metadata to v2 reports with closed-enum reason codes, not free-text review reasons.
- Fix the fallback-grounding fabrication path so missing grounding cannot return a `proceed_with_caveats`-style green light.
- Add a runtime support diagnostic for non-positive/known-unreliable `specificityMargin` behavior.
- Fix only general grounding misclassification bugs already identified by prior review and fresh synthetic tests.
- Enforce evaluator-version snapshot discipline when scoring constants or grounding tables change.
- Treat remaining benchmark failures after the frozen run as a documented internal-alpha/off-ramp unless a new reviewed plan authorizes broader work.

## Known gaps: confirmed / partially confirmed / refuted / needs more evidence

| Gap | Status | Evidence from aggregate/split/label metrics only | Plan response |
| --- | --- | --- | --- |
| `falseReconsiderRateStrong = 0.3333 > target <= 0.17` | Confirmed | Latest threshold check failed. Strong label recs: 1 `proceed`, 3 `proceed_with_caveats`, 2 `reconsider`. | Fix general false-contradiction classes (family-local metric polarity/evidence). Do not lower recommendation floors. If still failed after freeze, document off-ramp. |
| `exploratoryFalseReconsiderRateStrong = 0.4 > target <= 0.17` | Confirmed | Latest exploratory split threshold check failed. | Same as above; exploratory split can guide synthetic bug tests only at aggregate level, not raw case prose. |
| `exploratoryDiagnosticStrongGroundingGap = 0.1716 < target >= 0.20` | Confirmed | Latest exploratory split threshold check failed. | Primarily improve strong grounding by removing false contradictions; do not over-penalize diagnostic cases with new fixture-specific unsupported rules. Add CI/context for small sample uncertainty. |
| `lockboxUnsupportedGroundingLeakageWarning = 0.0681 > target <= 0.05` | Confirmed warning | Lockbox unsupported mean grounding `0.2826`; exploratory unsupported mean grounding `0.2145`; delta `0.0681`. | Do not tune to lockbox. Add CI/failure-taxonomy context; if still failed, keep as validity warning/off-ramp. |
| `strongWeakMarginSeparation = -0.0711 < target >= 0.10` | Confirmed inherited gap | Latest threshold check failed and direction is currently anti-correlated, not merely uncalibrated. | Add runtime support diagnostics marking margin reliability as failed/experimental, keep the threshold visible, and document that consumers must not read higher margin as production evidence. Do not manipulate margin thresholds. Future work: calibrated contrastive/pairwise/NLI margin. |
| Tool not valid as production decision/gating tool | Confirmed | Current docs and review already state internal-alpha; remaining gate failures reinforce this. | Add explicit advisory/readiness contract: operator review required, production decision use not valid. |
| Needs researched productionization strategy, not more fixture tuning | Confirmed | Research note supports calibration, split discipline, CIs, abstention, monitoring, and governance. | Implement instrumentation and advisory contract. Deterministic changes limited to general pre-reviewed bug classes. |

## Lockbox blindness discipline

Rules for this plan:

1. Do not inspect raw lockbox fixture `context` or `rationale` before or after implementation in this session.
2. Do not copy raw benchmark/lockbox context or rationale prose into tests, docs, prompts, reports, or commit messages.
3. Do not tune grounding rules, synonyms, weights, thresholds, recommendation floors, or model prompts after observing benchmark/lockbox results.
4. Unit tests must use fresh synthetic examples authored for the tests.
5. Generated `benchmark-output/` remains ignored and uncommitted.
6. Inspect benchmark output only through aggregate, split, label, confusion, threshold, and summary metrics; do not inspect raw item prose.
7. Record fixture hashes before rule freeze and after benchmark runs so fixture mutation is auditable without reading raw fixture prose.
8. If saved-plan gates cannot pass without lockbox tuning, stop at the off-ramp and report the validity gap.

Plan-time disclosure: before writing this plan, I inspected source/docs/tests, prior review result text, and latest benchmark aggregate/split/label/threshold metrics only. I did not inspect raw lockbox `context` or `rationale` prose. This disclosure is governance context, not proof of held-out validity.

Rule-freeze point for implementation: after this plan review is ACCEPT or ACCEPT_WITH_CHANGES with no unresolved blocking issues, after RED tests are written and observed failing for the planned general behavior changes, and before the first post-implementation `npm run benchmark:sre`. At freeze, record `sha256sum benchmark/fixtures/sre/sre-benchmark-cases.json` without inspecting fixture prose.

## Exact files to change

Plan/research/docs:

- Create: `docs/research/2026-05-03-elenchus-production-eval-methodology.md`
- Create/modify: `docs/plans/2026-05-03-elenchus-production-readiness-gap-remediation-plan.md`
- Modify: `README.md`
- Modify: `docs/production-readiness.md`
- Modify: `docs/ADR-001-Socratic-Interception.md`

Production/source:

- Modify: `src/evaluation/types.ts`
- Modify: `src/evaluation/report.ts`
- Modify: `src/evaluation/evaluator.ts` only if audit/advisory payload wiring requires it
- Modify: `src/evaluation/grounding.ts`
- Modify: `src/evaluation/sreBenchmark.ts`
- Modify: `src/evaluation/runSreBenchmark.ts`

Tests:

- Modify: `test/evaluation/grounding.test.ts`
- Modify: `test/evaluation/v2-types-and-heuristics.test.ts`
- Modify: `test/evaluation/audit.test.ts`
- Modify: `test/evaluation/sre-benchmark.test.ts`
- Modify: `test/http/v2-route.test.ts`

Do not modify:

- `benchmark/fixtures/sre/sre-benchmark-cases.json`
- generated `benchmark-output/`
- raw lockbox extraction artifacts
- deployment/push configuration

## Implementation approach A: reduce strong false reconsider without unsupported leakage

Root cause hypothesis, based on prior Opus review and source inspection, not raw fixture prose:

- `polarityForMetric(clause, family)` is clause-scoped. In mixed-family clauses, a normal term near one family can set another family to `normal` even when the rationale asserts an issue for that second family.
- `metricEvidence(rawContext, family)` is part-scoped with `if hasNormal ... else if hasIssue ...`; a normal/negated phrase can hide genuine issue evidence in the same sentence/part.
- These general bugs can create false contradictions or missing present issue evidence, depressing strong grounded cases and causing `reconsider` caps.

Planned fix:

- Replace clause-global metric polarity with family-local polarity extraction.
- For each metric family, inspect windows/spans around matched family terms and around issue/normal terms, instead of the entire clause.
- Preserve negation-aware behavior already added: issue terms inside `no X`, `X absent`, `not blocked`, etc. should not create issue evidence.
- When both normal and issue evidence exist for a family in a context part, record both internally and classify the anchor using same-polarity evidence first. Add a note for mixed evidence, but do not create a false contradiction solely because another span is normal.
- Do not add new SRE synonym families or lockbox-shaped phrases. Use existing family tables and general windowing/polarity logic.

Expected effect:

- Some strong cases currently capped by false contradictions may move from `reconsider` to `proceed_with_caveats` or `proceed` if their grounding is genuinely supported.
- Unsupported-specific cases remain constrained because absent/contradicted anchors and recommendation floors are unchanged.

### Delta from prior remediation

Commit `9e24f13` already added numeric metric-family attribution and negation-aware metric-state handling. The new mechanical delta is narrower and must be proven by synthetic tests:

- Prior logic can still evaluate polarity at a clause/part level after a metric family is found, so unrelated normal terms in the same clause/part can contaminate a different family's issue evidence.
- New logic must create family-local evidence spans/windows before assigning polarity, then classify each family from the nearest matching span rather than the full clause.
- Prior `metricEvidence` can prefer a normal finding for a context part before recognizing issue evidence elsewhere in that part. New logic must preserve both same-family normal and issue evidence and select same-polarity support before contradiction.
- The minimum proof is a fresh synthetic case where old behavior creates a false contradiction/missing issue support and new behavior produces supported issue evidence without changing weights, thresholds, synonym tables, or recommendation floors.

Off-ramp:

- If strong false-reconsider remains above target after these general fixes, stop and document it. Do not add phrases or thresholds based on lockbox/split metrics.

## Implementation approach B: improve diagnostic-vs-strong grounding separation

Method:

- Improve strong grounding by preventing unrelated normal spans from depressing valid issue anchors.
- Leave diagnostic/unsupported penalties unchanged unless fresh synthetic tests show a general pre-existing bug.
- Add benchmark confidence intervals so a small split gap is interpreted with sample uncertainty instead of overclaimed as validation.

Do not:

- Lower diagnostic cases through new unsupported regexes after seeing aggregate failures.
- Change grounding weights/caps/floors in this iteration.

## Implementation approach C: reduce or contextualize lockbox unsupported grounding leakage

Because the warning is lockbox-specific and small (`0.0681` above exploratory unsupported mean), it is not safe to tune to it directly.

Implementation:

- Add split-specific confidence intervals for unsupported mean grounding and the lockbox-exploratory leakage delta.
- Add failure-taxonomy counts by split (absent anchors, contradicted anchors, no-checkable anchors, mixed evidence, review-needed) without raw prose.
- Keep the threshold warning visible and failing if the point estimate remains above `0.05`.

Off-ramp:

- If the warning remains failed, document that deterministic grounding has not validated lockbox unsupported behavior. Future work should use human labels / NLI-span attribution / calibrated judge path, not same-session lockbox tuning.

## Implementation approach D: specificityMargin treatment

Current `strongWeakMarginSeparation = -0.0711` indicates the existing `specificityMargin` does not separate strong from weak cases. This plan will not "fix" margin by adjusting existing deterministic support weights because that would risk another fixture-specific heuristic loop.

Actions:

- Preserve `support.specificityMargin` for backward-compatible diagnostics.
- Add a structured `support.marginReliability`/equivalent diagnostic and advisory/readiness metadata stating margin is exploratory, currently failed/anti-correlated on the latest benchmark, and not valid for production decisions.
- Add benchmark CI/threshold-governance output for margin so failed margin separation is explicit.
- Document a future margin redesign: contrastive pairwise action support, evidence-aware NLI/judge scoring, human-labeled calibration, and reliability curves.

## Advisory-mode / production contract

Add an additive v2 report field, tentatively named `readiness`, with a shape like:

```ts
interface EvaluationReadiness {
  operatingMode: "internal_alpha_advisory";
  productionDecisionUse: "not_validated_for_allow_deny";
  operatorReviewRequired: true;
  reviewNeeded: boolean;
  reviewReasons: EvaluationReviewReason[];
  blockedUses: string[];
  advisorySummary: EvaluationAdvisorySummary;
  evaluatorVersion: string;
}
```

`reviewReasons` and `advisorySummary` must be closed enums exported from `src/evaluation/types.ts`, not arbitrary free text. `operatorReviewRequired` is always true in this alpha mode. `reviewNeeded` is retained for compatibility with the plan but must be derived from structured reasons rather than hand-authored prose; high-priority reasons are separate from the always-true alpha gate. Review-needed/reason codes should be true/present when any of these are present:

- calibration is `uncalibrated_internal_alpha` (operator review required for all production-like use);
- `overallSignal` is null or status is not complete;
- `contextGrounding < 0.6`;
- any contradicted load-bearing anchor;
- policy blocker/warning;
- confidence below a documented internal-alpha threshold;
- `support.specificityMargin` is low/negative or benchmark margin state is documented as unreliable; this must set a margin diagnostic on the report support/readiness payload.
- fallback/no-anchor grounding is used; this must cap recommendation no higher than `reconsider`.

Important semantics:

- `recommendation` remains an advisory classification, not an allow/deny gate.
- `readiness.operatorReviewRequired` should be true for every current report, and `productSemantics`/`blockedUses` must say machine-actionable consumption is not validated.
- v1 response shape must remain unchanged.
- Audit payload may include readiness booleans/reason codes, not raw context/rationale/evidence. Audit tests must inject distinctive markers in all free-text-adjacent inputs (`support.notes`, `policyFindings.message`, advisory summary equivalents) and assert markers do not appear in on-disk audit content.

## Benchmark metrics to add

Add stable JSON fields and Markdown/stdout rendering for:

1. Confidence intervals
   - Wilson interval for rates: weak false-proceed, permissive weak, strong false-reconsider, policy detection, expected-band match, specific-but-unsupported proceed rates, review-needed rates.
   - Fixed-seed percentile bootstrap intervals for means/separations: mean grounding, strong/weak separations, diagnostic-vs-strong gaps, lockbox unsupported leakage delta, and margin separation.
   - Split-specific intervals for exploratory and lockbox rates.
   - Effective sample size and underpowered interpretation metadata; checks with effective `n < 20` must be severity `diagnostic` even if their point-estimate pass/fail remains visible.

2. Confusion matrices
   - `recommendationConfusion` by expected recommendation band center vs actual recommendation.
   - `byLabel[label].recommendations` already exists; add a stable aggregate and split-specific confusion matrix so reports can be reviewed without raw item prose.

3. Review-needed / abstention rates
   - Overall, by label, by split.
   - Rate of `operatorReviewRequired` should be 1.0 in this internal-alpha mode; `reviewNeeded` can be separated as high-priority review reasons.

4. Failure taxonomy
   - Counts/rates for absent grounding, contradicted grounding, mixed evidence, weak context grounding, low margin, policy findings, low confidence.
   - Split-specific taxonomy to diagnose transfer without reading lockbox prose.

5. Threshold governance output
   - For every threshold check, include `actual`, `threshold`, `passed`, optional `confidenceInterval`, `effectiveN`, `minimumDetectableEffectNote`, `severity` (`gate`, `warning`, `diagnostic`), and `interpretation`.
   - Do not weaken existing thresholds.

6. Reliability and baseline roadmap metadata
   - Include a textual reliability-summary caveat for this iteration: current confidence values are not calibrated probabilities and no production ECE claim is made.
   - If implementation scope permits without delaying blockers, add a simple bucketed expected-band agreement summary; otherwise document it as required for the next calibration workstream.
   - Do not add an uncalibrated LLM/NLI judge in this iteration. A sentence-overlap/BM25/NLI baseline is future methodology unless final review makes it blocking.

## Benchmark threshold/gate updates

Do not weaken existing point-estimate thresholds:

- `falseReconsiderRateStrong <= 0.17`
- `exploratoryFalseReconsiderRateStrong <= 0.17`
- `exploratoryDiagnosticStrongGroundingGap >= 0.20`
- `lockboxUnsupportedGroundingLeakageWarning <= 0.05` warning
- `strongWeakMarginSeparation >= 0.10` diagnostic, currently failed
- existing weak false-proceed, permissive weak, shuffled grounding drop, rank agreement, and unsupported zero-proceed checks

Add governance metadata but preserve pass/fail. A confidence interval does not convert a failed point estimate into a pass; it only contextualizes sample uncertainty.

Additional interpretation rules:

- Demote threshold interpretation severity to `diagnostic` whenever the effective sample size for that check is below 20; retain the point-estimate `passed` boolean but display an underpowered-gate note and approximate minimum-detectable-effect context.
- Add fixed-seed bootstrap intervals for mean/separation checks such as grounding gaps and strong/weak margin separation.
- Do not use confidence intervals to turn a failed point estimate into a success or to justify threshold weakening.

## Strict TDD task list

Every behavior change must start with a failing test, then a minimal implementation, then targeted green verification. Record RED/GREEN evidence for final reporting.

### Task 0: fallback/no-grounding fabrication guard

Files:
- Test first: `test/evaluation/v2-types-and-heuristics.test.ts`
- Production after RED: `src/evaluation/report.ts`

Expected RED tests:

- Calling `buildReport` with high fabricated subscores and no explicit grounding returns `recommendation === "reconsider"` or stricter, not `proceed` or `proceed_with_caveats`.
- The fallback grounding note/reason says no explicit grounding cannot justify a production green light.
- `readiness.reviewReasons` includes the closed enum reason for fallback/no-checkable grounding after Task 1.

Expected RED: current `defaultGrounding.score === 0.45` allows a high-subscore report to be capped only to `proceed_with_caveats`.

### Task 1: v2 readiness/advisory contract

Files:
- Test first: `test/evaluation/v2-types-and-heuristics.test.ts`
- Production after RED: `src/evaluation/types.ts`, `src/evaluation/report.ts`

Expected RED tests:

- `buildReport` includes `readiness.operatingMode === "internal_alpha_advisory"`.
- `readiness.productionDecisionUse === "not_validated_for_allow_deny"`.
- `readiness.operatorReviewRequired === true`.
- `readiness.blockedUses` mentions production allow/deny, machine-actionable consumption, and hidden CoT faithfulness.
- `readiness.reviewReasons` accepts only closed enum values and does not contain arbitrary free text.
- Error reports include readiness with structured review reasons and no numeric judgment fabrication.

Command:

```bash
npx vitest run test/evaluation/v2-types-and-heuristics.test.ts -t "readiness|advisory|operator review"
```

Expected RED: `readiness` field does not exist.

### Task 2: review-needed reasons and margin reframing

Files:
- Test first: `test/evaluation/v2-types-and-heuristics.test.ts`
- Production after RED: `src/evaluation/report.ts`

Expected RED tests:

- Contradicted/low-grounding report has structured review reason codes for grounding and operator review.
- Strong grounded report still has `operatorReviewRequired === true`, but high-priority review reasons exclude weak-grounding/contradiction.
- Low/negative `specificityMargin` produces a margin diagnostic/review reason without changing `support.specificityMargin`.
- Non-positive/benchmark-known-unreliable margin state is surfaced as an explicit support diagnostic, not only documentation.

Expected RED: no readiness/reason fields.

### Task 3: audit privacy for readiness metadata

Files:
- Test first: `test/evaluation/audit.test.ts`
- Production after RED if needed: `src/evaluation/evaluator.ts`, `src/evaluation/report.ts`

Expected RED/characterization tests:

- Audit payload contains readiness mode/reason codes if logged.
- Audit payload does not contain raw context, raw rationale, raw anchor text, context evidence, or contradiction evidence.
- Inject distinctive synthetic markers into `support.notes`, `policyFindings.message`, and any advisory-summary-like field; assert those markers are absent from on-disk audit content.

Sanitized readiness metadata may be logged only as enums/booleans/counters. Do not log raw prose.

### Task 4: family-local metric polarity extraction

Files:
- Test first: `test/evaluation/grounding.test.ts`
- Production after RED: `src/evaluation/grounding.ts`

Expected RED tests with fresh synthetic prose:

- Mixed-family clause: `locks are normal` plus `87% I/O wait shows storage saturation` yields `locks:normal` and `io:issue` present, and does not create `io:normal` from the lock phrase.
- Mixed-family clause: `CPU normal` plus `queue depth growing` yields `cpu:normal` and `queue:issue`, not `queue:normal`.
- Issue evidence after the number/metric term remains present without introducing unrelated contradictions.
- Synthetic prior-failure case proves the old clause-scoped implementation assigns normal polarity to an unrelated issue family; new implementation must not.

Command:

```bash
npx vitest run test/evaluation/grounding.test.ts -t "family-local|mixed-family|polarity"
```

Expected RED: current clause-scoped polarity can assign normal/issue to unrelated metric families.

### Task 5: span-aware metric evidence with mixed context

Files:
- Test first: `test/evaluation/grounding.test.ts`
- Production after RED: `src/evaluation/grounding.ts`

Expected RED tests:

- Context containing normal evidence for one span and issue evidence for another span of the same family supports an issue rationale when the issue span exists.
- Normal/negated spans still do not become issue evidence (`no lock waits`, `memory pressure absent`, `not blocked`).
- True contradictions remain detected when only opposite-polarity evidence exists.

Expected RED: current part-level `hasNormal else hasIssue` can hide issue evidence.

### Task 6: benchmark confidence intervals and confusion metrics

Files:
- Test first: `test/evaluation/sre-benchmark.test.ts`
- Production after RED: `src/evaluation/sreBenchmark.ts`

Expected RED tests:

- `computeSreBenchmarkMetrics` exposes Wilson intervals for `falseProceedRateWeak`, `permissiveRateWeak`, and `falseReconsiderRateStrong`, with values checked against hand-computed references within tolerance.
- Bootstrap intervals for mean/separation checks are deterministic with a fixed seed.
- `thresholdChecks.falseReconsiderRateStrong` includes interval/governance metadata without changing threshold, and effective `n < 20` yields `severity: "diagnostic"`.
- Aggregate `recommendationConfusion` and split-specific confusion matrices exist, contain expected counts, and satisfy row/column/total invariants.
- `bySplit.exploratory` and `bySplit.lockbox` include review-needed rates when reports contain readiness metadata.

Expected RED: fields do not exist.

### Task 7: benchmark review-needed/failure taxonomy metrics

Files:
- Test first: `test/evaluation/sre-benchmark.test.ts`
- Production after RED: `src/evaluation/sreBenchmark.ts`

Expected RED tests:

- Metrics include overall/by-label/by-split `reviewNeededRate`, `operatorReviewRequiredRate`, and failure taxonomy counts/rates.
- Failure taxonomy classifies synthetic absent, contradicted, mixed-evidence, no-checkable, low-margin, low-confidence, and policy-finding examples into expected buckets.
- Markdown summary includes review-needed/advisory caveats and does not include forbidden overclaims.

### Task 8: CLI benchmark visibility

Files:
- Test first if practical: `test/evaluation/sre-benchmark.test.ts` or targeted snapshot/unit around render output
- Production after RED: `src/evaluation/runSreBenchmark.ts`

Expected behavior:

- `npm run benchmark:sre` stdout includes mean context grounding, strong/weak grounding separation, permissive weak rate, false-reconsider strong, review-needed rate, and failed threshold count.

### Task 9: v2 HTTP and v1 compatibility

Files:
- Test first: `test/http/v2-route.test.ts`
- Production only if needed.

Expected tests:

- `/api/v2/evaluate` response includes readiness/advisory metadata.
- `/api/v1/intercept` success response still excludes `grounding`, `subscores`, `overallSignal`, `contextGrounding`, and `readiness`.

### Task 10: evaluator-version and fixture-hash governance

Files:
- Test first: `test/evaluation/v2-types-and-heuristics.test.ts` or a new focused evaluation-version test if the repo pattern supports it
- Production after RED: `src/evaluation/report.ts`, `src/evaluation/grounding.ts`, any benchmark metadata types

Expected RED tests:

- A snapshot/hash of scoring constants and grounding tables is associated with `rubric.evaluatorVersion`; changing `ANCHOR_WEIGHTS`, `OVERALL_WEIGHTS`, `GROUNDING_SCORE_CAPS`, `RECOMMENDATION_GROUNDING_FLOORS`, or metric-family regex tables without a version/hash update fails.
- Benchmark output includes a fixture SHA-256 and evaluator version/hash without exposing raw fixture prose.

### Task 11: docs updates

Files:
- Modify: `README.md`, `docs/production-readiness.md`, `docs/ADR-001-Socratic-Interception.md`

Content:

- Add advisory/readiness field to v2 response description.
- Document `specificityMargin` as exploratory/unreliable for production gating.
- Document benchmark CI/confusion/review-needed outputs.
- Preserve David Deutsch / *The Beginning of Infinity* tribute and independent/not-endorsed disclaimer.
- Avoid forbidden claims: truth validator, hidden chain-of-thought faithfulness detector, general reasoning oracle, production gate, safe-to-proceed guarantee.

## Verification commands

During TDD:

```bash
npx vitest run test/evaluation/v2-types-and-heuristics.test.ts -t "readiness|advisory|operator review|margin"
npx vitest run test/evaluation/grounding.test.ts -t "family-local|mixed-family|polarity|mixed evidence"
npx vitest run test/evaluation/sre-benchmark.test.ts -t "confidence|confusion|review-needed|threshold|taxonomy"
npx vitest run test/evaluation/audit.test.ts -t "readiness|grounding|audit"
npx vitest run test/http/v2-route.test.ts -t "readiness|legacy shape|v1"
```

Required final verification:

```bash
npx vitest run test/evaluation/grounding.test.ts test/evaluation/v2-types-and-heuristics.test.ts test/evaluation/audit.test.ts test/http/v2-route.test.ts test/evaluation/sre-benchmark.test.ts --no-cache
npm test
npm run lint
npm run benchmark:sre
npm audit --omit=dev --json
git diff --check
```

Benchmark handling:

- Capture before/after headline metrics from aggregate/split/label/threshold fields only.
- Do not inspect raw benchmark item context/rationale prose.
- Do not commit `benchmark-output/`.
- If gates fail after the frozen implementation, do not tune; document the off-ramp and remaining validity gaps.

## Production-readiness gates

Functional gates:

- v2 complete and error reports include readiness/advisory metadata.
- v1 response shape remains unchanged.
- Audit logs do not leak raw context/rationale/grounding text/evidence.
- Fallback/no-grounding reports cannot produce `proceed` or `proceed_with_caveats` from high fabricated subscores.
- Family-local polarity tests pass without adding new fixture-specific synonym phrases.
- Existing grounding tests still pass.
- Benchmark CI/confusion/review-needed/taxonomy metrics are present in JSON/Markdown/stdout and behavior-tested against synthetic references.
- Thresholds with effective `n < 20` are marked diagnostic/underpowered while retaining point-estimate pass/fail.
- Fixture hash and evaluator version/hash are present in benchmark metadata.

Benchmark gates (retain point estimates):

- `falseProceedRateWeak <= 0.10`
- `permissiveRateWeak <= 0.45`
- `falseReconsiderRateStrong <= 0.17`
- `exploratoryFalseReconsiderRateStrong <= 0.17`
- `exploratoryDiagnosticStrongGroundingGap >= 0.20`
- `lockboxUnsupportedGroundingLeakageWarning <= 0.05` warning-style but visible
- `strongWeakMarginSeparation >= 0.10` diagnostic / currently unvalidated
- lockbox and exploratory specific-but-unsupported zero `proceed`
- rank agreement and shuffled grounding drop checks remain visible

Review gates:

- Opus plan review returns ACCEPT or ACCEPT_WITH_CHANGES with no unresolved blockers.
- Final Opus implementation review returns ACCEPT or ACCEPT_WITH_CHANGES with no blocking issues.

Commit gates:

- Tests/lint/audit/diff checks pass.
- Benchmark failures, if any, are explicitly documented as plan-accepted internal-alpha/advisory caveats, not hidden blockers. Underpowered gates must be labeled diagnostic, not decisive validation/falsification.
- No secrets or generated benchmark outputs staged.
- Commit message includes research/methodology summary, benchmark results, remaining gaps, final Opus verdict, lockbox-process disclosure, and no-push confirmation.

## Off-ramp rules

Stop and report a genuine blocker/off-ramp instead of tuning if any occur:

1. Passing benchmark gates requires inspecting raw lockbox prose or adding lockbox-shaped phrases/weights/thresholds.
2. General family-local polarity/evidence fixes do not reduce strong false-reconsider enough, and further work would require fixture-specific diagnosis.
3. Opus plan review REJECTs the methodology and blockers cannot be fixed without changing product scope or overclaiming.
4. Final Opus review REJECTs the implementation and the fix would require lockbox tuning.
5. Tests reveal a broader architecture change requiring a new plan, such as adding a calibrated model judge or human-labeling workflow.

If off-ramped, final report must include failed gate names/values, aggregate/split/label metrics, tests/lint/audit status, exact files changed/left dirty, why further tuning would violate blindness, and next recommended plan (likely human-labeled calibration and/or calibrated NLI/judge path). The report must also acknowledge that lockbox blindness reduces but cannot eliminate overfitting risk because independently authored synthetic SRE tests may still converge on common SRE idioms.

## Plan-review feedback section

Opus max-effort read-only plan review completed from `/tmp/elenchus-production-readiness-plan-review.json`.

Verdict: ACCEPT_WITH_CHANGES.

Blocking issues accepted and incorporated:

1. `defaultGrounding` allowed fabricated high subscores to reach `proceed_with_caveats`; added Task 0 requiring a fallback/no-grounding guard and stronger test.
2. `specificityMargin` is anti-correlated, not merely uncalibrated; added runtime support/readiness diagnostics and explicit non-positive margin warning.
3. Audit privacy needed closed enums and marker tests; added structured `EvaluationReviewReason`, constrained `advisorySummary`, and marker-based redaction tests.
4. Family-local grounding fix needed a concrete delta from prior remediation; added a delta section and prior-fails/new-passes synthetic test requirement.
5. Presence-only tests were too weak; added Wilson numeric tolerance tests, bootstrap determinism, confusion invariants, taxonomy behavior tests, and audit marker tests.
6. Small-n gates were statistically underpowered; added effective-n, diagnostic severity for `n < 20`, minimum-detectable-effect notes, and fixed-seed bootstrap intervals.
7. Goal overclaimed production-grade methodology; reworded to internal-alpha advisory hygiene and instrumentation.
8. Evaluator version needed snapshot governance; added Task 10.
9. Lockbox blindness needed fixture-hash disclosure; added freeze/benchmark SHA-256 requirements.
10. Bootstrap CIs for mean/separation checks were made required in this iteration.

Non-blocking suggestions accepted where practical:

- Machine-actionable consumption added to blocked uses/product semantics.
- Drift monitoring and human-labeled calibration retained as prerequisites for any future production-advisory claim.
- Reliability/ECE and baseline/judge work documented as future work, with lightweight reliability summary allowed only if it does not overclaim calibration.
- Synthetic-test convergence with lockbox acknowledged as a residual risk in off-ramp/final reporting.

Suggestions deferred/rejected for this iteration:

- A runtime LLM/NLI/judge or BM25 baseline is deferred because the reviewed methodology deliberately avoids uncalibrated model-assisted scoring in this lockbox-sensitive remediation.
- Full reliability diagrams/ECE are deferred unless trivial to add honestly; current confidence is not calibrated probability and sample size is too small for production reliability claims.
- Replacing the weighted overall score is out of scope because it would require a separate calibration/product-API plan.

Implementation authorization condition: proceed only with the incorporated plan scope above. If implementation cannot satisfy these blockers without raw lockbox inspection, threshold weakening, or fixture-specific tuning, stop at the off-ramp.

## Lockbox-process disclosure for final report/commit

The final report and commit body must include:

- The plan was written after inspecting only source/docs/tests, prior review result text, and aggregate/split/label/threshold benchmark metrics.
- Raw lockbox context/rationale prose was not inspected before rule/test/constant freeze.
- Fixture SHA-256 was recorded at freeze and benchmark time without reading fixture prose.
- No grounding synonyms, weights, thresholds, recommendation floors, benchmark labels, model prompts, or fixture prose were tuned after observing post-implementation lockbox metrics.
- Generated benchmark output was not staged or committed.

## Expected status if completed

If tests/review pass and benchmark failures are either resolved by general bug fixes or documented as off-ramp caveats, the branch can be PR-ready and committed locally. The correct product status will still be internal-alpha advisory-only, not production-ready, not production-advisory-ready, and not production-gating. A production-advisory claim requires a separate labeled-calibration, judge/NLI baseline, drift-monitoring, and threshold-governance workstream.

No push or deploy is authorized by this plan.
