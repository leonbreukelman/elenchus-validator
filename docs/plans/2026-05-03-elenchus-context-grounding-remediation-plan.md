# Elenchus Context Grounding Remediation Implementation Plan

> **For Hermes:** Use `disciplined-project-delivery`, `writing-plans`, `test-driven-development`, `systematic-debugging`, `requesting-code-review`, and `claude-code`. Do not modify production code until this remediation plan has completed read-only Opus plan review and valid blocking feedback has been incorporated.

**Goal:** Remediate the rejected deterministic `contextGrounding` implementation so strong grounded rationales are not collapsed by unrelated anchor contradictions, unsupported specific rationales remain constrained, benchmark gates are explicit, and product documentation stays narrow and non-oracular.

**Architecture:** Keep the deterministic local grounder, but fix two synthetic-testable root causes: numeric metric-family attribution in multi-family clauses and negation-aware metric-state classification. Then freeze report weights and benchmark gates, update docs, and verify with tests, lint, benchmark, audit, and final Opus read-only implementation review. If acceptance requires lockbox-shaped regexes or post-lockbox tuning, take the off-ramp instead of overfitting.

**Tech Stack:** TypeScript, Vitest, existing deterministic v2 evaluator, existing SRE benchmark harness, Claude Code Opus read-only review.

---

## Inspection Status

Date: 2026-05-03
Repository: `/home/leonb/projects/elenchus-validator`
Branch: `main`
HEAD: `827ac52`
Remote: `git@github.com:leonbreukelman/elenchus-validator.git`
Initial working tree: prior uncommitted context-grounding implementation plus untracked original plan, grounder, and grounding tests; no commit/push performed.

Inspection performed without reading raw lockbox `context` or `rationale` fixture text. I inspected source, tests, docs, current diff, prior Opus review result text, and prior generated benchmark metrics by parsing only aggregate/split/label/threshold fields from `benchmark-output/.../result.json`.

Current targeted tests before remediation pass, which confirms the current test suite does not cover the rejected behaviors:

```bash
npx vitest run test/evaluation/grounding.test.ts test/evaluation/v2-types-and-heuristics.test.ts test/evaluation/audit.test.ts test/http/v2-route.test.ts test/evaluation/sre-benchmark.test.ts
# 5 files passed, 39 tests passed
```

Prior benchmark aggregate metrics parsed without raw fixture text:

- cases: 42 complete
- mean overall signal: 0.5897
- mean context grounding: 0.4775
- strong/weak signal separation: 0.1182
- strong/weak grounding separation: 0.0360
- weak false-proceed rate: 0
- permissive weak rate: 0.3611
- strong false-reconsider rate: 0.6667
- policy violation detection rate: 0.8333
- rank agreement: 0.7879
- shuffled-rationale signal drop: 0.1125
- shuffled-rationale grounding drop: 0.1749
- exploratory split: itemCount 32, meanOverallSignal 0.5975, meanContextGrounding 0.4965, falseProceedRateWeak 0, rankAgreement 0.8408, groundingFailureRateDiagnostic 0.7778, contradictedAnchorRateDiagnostic 0.4444
- lockbox split: itemCount 10, meanOverallSignal 0.5648, meanContextGrounding 0.4165, falseProceedRateWeak 0, rankAgreement 0.4118, groundingFailureRateDiagnostic 0.3333, contradictedAnchorRateDiagnostic 0.3333

## Lockbox Discipline

Rules for this remediation:

1. Do not inspect raw lockbox fixture `context` or `rationale` before grounding rules, constants, tests, and this remediation plan are frozen.
2. Do not copy raw benchmark/lockbox context or rationale prose into tests or docs.
3. New tests must use fresh synthetic cases that exercise general bug classes.
4. Do not tune grounding rules, synonym tables, weights, thresholds, or recommendation floors after observing post-remediation lockbox benchmark results.
5. The benchmark may be run after the tests/rules/constants/plan are frozen; inspect only aggregate, split, label, and threshold metrics.
6. Generated `benchmark-output/` artifacts must remain ignored and uncommitted.
7. Final report and commit message must include a lockbox-process disclosure: when rules froze, whether raw lockbox context/rationale was read before freeze, and whether post-lockbox tuning occurred. This disclosure is governance context, not proof of held-out validity.
8. Negation patterns and synthetic phrases must be authored from general SRE/operator language, not from observed lockbox phrasings. If a benchmark gate failure suggests adding a lockbox-shaped phrase, take the off-ramp.
9. Before the post-remediation benchmark, record a fixture hash/status check without reading raw fixture prose, so generated result changes can be tied to a frozen fixture state.

Rule freeze point for this session: after Opus accepts this plan (or accepts with incorporated changes), after RED tests for synthetic bug classes, default-grounding fallback, v1 compatibility, constants, and threshold freezes are written and observed failing, and before the first post-remediation `npm run benchmark:sre`.

## Confirmed / Partially Confirmed / Refuted / Needs-More-Evidence

| Prior finding | Status | Evidence without raw lockbox text | Remediation |
| --- | --- | --- | --- |
| 1. Strong-specific cases collapsed too often to `reconsider`, triggering saved-plan rejection. | Confirmed | Parsed benchmark metrics: `strong_specific` recommendations were 4 `reconsider`, 2 `proceed_with_caveats`; `falseReconsiderRateStrong` was 0.6667 vs saved plan <= 0.17. | Fix numeric attribution and negation classification; add strong-specific protection tests; keep threshold <= 0.17. |
| 2. Numeric metric-family attribution bug assigns a numeric near I/O wait to locks when a nearby lock term wins. | Confirmed as general bug class | Source: `metricFamilyForNumeric` prefers terms before the numeric over after-numeric terms. Synthetic check with locks + I/O in one clause produced a numeric normalized as `locks:<value>` even though the metric phrase after the number was I/O wait. | Replace proximity heuristic with span-aware semantic binding that favors enclosing/adjacent metric phrases, specific multi-word terms, unit-family compatibility, and nearest term on either side rather than blanket before-numeric preference. |
| 3. Negation-blind metric-state issue regex turns normal/negated evidence into contradictions. | Confirmed | Source: `classifyInternalAnchor` independently searches `normalTerms` and `issueTerms`; issue regexes such as `waits?`, `pressure`, `blocking`, or numeric percentages match inside normal/negated spans. Synthetic checks: `no lock waits`, `memory pressure is absent`, and `CPU usage is normal` classified as contradicted normal anchors. | Add sentence/span-level polarity extraction. Issue evidence must be ignored when inside or governed by a normal/negated span; normal claims must still be contradicted by genuine issue spans elsewhere. |
| 4. Shuffled grounding drop 0.1749 below target >= 0.20. | Confirmed | Parsed benchmark `controlComparisons.shuffledContextGroundingDropFromOriginal` = 0.1749. | Add threshold check. Re-run only after rules/tests frozen. If still below 0.20 after general bug fixes, report off-ramp rather than tune. |
| 5. Strong/weak grounding separation 0.0360 below target >= 0.10. | Confirmed | Parsed metric and threshold: actual 0.036, `passed=false`. | Fix false contradictions on strong cases; add threshold check already present but keep/verify. |
| 6. Exploratory diagnostic-vs-strong grounding gap too small. | Confirmed/partially quantified | Existing split fields do not directly expose strong-vs-diagnostic gap by split, but parsed exploratory mean grounding and label means support the review's concern; current strong grounding is depressed by confirmed bug classes. | Add explicit split threshold checks for exploratory diagnostic-vs-strong context-grounding gap >= 0.20. |
| 7. `docs/ADR-001-Socratic-Interception.md` was not updated with `contextGrounding`. | Confirmed | ADR V2 Interface line lists subscores as rationale specificity, action coupling, alternative resistance, policy alignment only. | Update ADR with `contextGrounding`, grounding assessment, caveats, v1 compatibility, and current internal-alpha framing. |
| 8. `falseReconsiderRateStrong` threshold is <= 0.35 in code while saved plan requires <= 0.17. | Confirmed | `src/evaluation/sreBenchmark.ts` threshold check uses `<= 0.35`. | Change threshold check to `<= 0.17`; add exact threshold test. |
| 9. Missing threshold checks for shuffled grounding drop, lockbox specific-but-unsupported zero proceed, permissive weak rate, and related gates. | Confirmed | `thresholdChecks` lacks `shuffledContextGroundingDrop`, `permissiveRateWeak`, lockbox zero-proceed, exploratory strong false-reconsider, exploratory diagnostic-vs-strong gap, lockbox rank agreement, and lockbox unsupported leakage warning. | Extend metrics and tests. Make checks visible in JSON and Markdown. |
| 10. `OVERALL_WEIGHTS` not exported/test-frozen. | Confirmed | `OVERALL_WEIGHTS` is module-private in `src/evaluation/report.ts`; tests freeze only `ANCHOR_WEIGHTS` and `RECOMMENDATION_GROUNDING_FLOORS`. | Export `OVERALL_WEIGHTS`; add exact-value test matching original plan. |
| Prior review B9. Lockbox-process disclosure absent. | Confirmed for current diff/report state | No final report or commit message exists yet; original plan required process disclosure. | Include a non-certifying disclosure in final response and commit message body if commit gates pass. |
| Prior review N2 / Opus plan blocker B1. `defaultGrounding` can fabricate high grounding if callers pass subscores without anchors. | Confirmed | Opus review identified a direct, benchmark-independent path in `src/evaluation/report.ts`: `buildReport` can be called with `subscores.contextGrounding = 0.99` and no explicit `grounding`, yielding `recommendation: proceed` and `summary.contradicted = 0`. This is not limited to the current evaluator path. | Add an unconditional regression test: `buildReport` without explicit `grounding` cannot return plain `proceed` regardless of `subscores.contextGrounding`. GREEN either by requiring grounding for complete reports or by making fallback grounding score/caps safe; choose the smallest backward-compatible fix. |
| Opus plan blocker B2. v1 success-shape compatibility is not exercised. | Confirmed | Existing `test/http/v2-route.test.ts` only exercises the v1 malformed/error path; it does not assert successful legacy shape. | Add a successful v1 route/handler test asserting legacy fields only and no v2-only fields (`grounding`, `subscores`, `overallSignal`, `contextGrounding`). |
| Opus plan blocker B3. Split-specific benchmark metrics are under-specified. | Confirmed | Current plan says helper metrics “as needed,” while `SreBenchmarkMetrics.bySplit` is a small fixed `Pick<>`; threshold checks could be computed ad hoc without stable JSON fields. | Add exact `bySplit` fields and wire threshold checks to those fields. |
| Prior review N5. Audit payload still passes raw `support`/`policyFindings`. | Partially confirmed / not primary blocker | Current deterministic provider and policy messages are not raw context/rationale, and existing plan only promised grounding subtree privacy. But future provider notes could leak. | Preserve current grounding privacy tests; optionally add a narrow sanitizer for support notes/policy messages if final review flags this as blocking. Avoid overclaiming whole-audit privacy beyond current structural guarantees. |

## Root Cause Summary

### Numeric family attribution

Current implementation:

- extracts numeric anchors in `extractGroundingAnchors`
- calls `metricFamilyForNumeric(clause, numericIndex)`
- `metricFamilyForNumeric` computes candidate distances, but sorts all terms before the numeric ahead of after-numeric terms
- this lets a generic earlier family term win over a specific metric phrase immediately after the number
- later classification compares the numeric against the wrong family and can mark it absent or contradicted, while `recommend` caps any contradiction at `reconsider`

### Negation-aware metric-state classification

Current implementation:

- determines rationale anchor polarity with `polarityForMetric`
- for classification, checks `normalTerms` and `issueTerms` independently against the entire raw context
- for normal rationale anchors, any issue regex match in context triggers contradiction
- issue regexes match substrings inside normal phrases like `no lock waits`, `no memory pressure`, `memory pressure is absent`, `not blocked`, or `CPU usage is normal`
- normal/negated context is therefore interpreted as issue evidence

## Exact Files To Change

Plan and docs:

- Create/modify: `docs/plans/2026-05-03-elenchus-context-grounding-remediation-plan.md`
- Modify: `README.md`
- Modify: `docs/production-readiness.md`
- Modify: `docs/ADR-001-Socratic-Interception.md`

Production/source:

- Modify: `src/evaluation/grounding.ts`
- Modify: `src/evaluation/report.ts`
- Modify: `src/evaluation/sreBenchmark.ts`
- Modify: `src/evaluation/runSreBenchmark.ts`
- Modify only if needed by tests/review: `src/evaluation/types.ts`
- Do not modify benchmark fixtures.

Tests:

- Modify: `test/evaluation/grounding.test.ts`
- Modify: `test/evaluation/v2-types-and-heuristics.test.ts`
- Modify: `test/evaluation/sre-benchmark.test.ts`
- Modify if needed for regression coverage: `test/evaluation/audit.test.ts`
- Modify for v1 success-shape compatibility regression: `test/http/v2-route.test.ts`

Do not stage or commit:

- `benchmark-output/`
- `/tmp/elenchus-grounding-*.json`
- any raw lockbox extraction artifacts

## Implementation Approach: Numeric Family Attribution

Replace `metricFamilyForNumeric` with a general, testable attribution helper.

Design requirements:

1. Examine all matches for all metric-family terms in the clause; do not use only the first match per family.
2. Use term spans and token distance to the numeric span.
3. Score candidate family matches with:
   - exact/adjacent metric phrase near the numeric wins over generic single-token terms
   - multi-word/specific patterns win small bonuses (`I/O wait`, `io wait`, `lock waits`, `error rate`, `queue depth`, `CPU usage`, `memory pressure`)
   - unit compatibility bonus where available (`%` near `I/O wait`, `CPU`, `error rate`; `ms` near latency; `iops` near I/O)
   - terms after the numeric are allowed to win when they are closer or more specific (for `87% I/O wait` style language)
   - unrelated family terms in the same clause do not win solely because they appear before the number
4. For multiple numeric tokens in one clause, bind each number independently to the nearest semantically relevant family.
5. If there is no reliable family candidate, keep a familyless numeric anchor rather than forcing a wrong family.
6. Keep this general; do not add fixture-specific phrases.

Expected public helper shape, if useful for tests:

```ts
export function inferMetricFamilyForNumeric(clause: string, numericIndex: number, numericToken: string): string | undefined
```

Alternatively, tests can assert through `assessContextGrounding` / `extractGroundingAnchors` and `normalizedText` without exporting the helper.

Synthetic tests to add first (use fresh, generalized phrasing; at least two numeric phrasings must not be literal substrings of any existing `METRIC_FAMILIES`/`MECHANISM_FAMILIES` term):

- `binds_percentage_after_lock_phrase_to_io_wait_not_locks`
- `binds_numeric_when_metric_term_appears_after_number`
- `binds_cpu_and_memory_numbers_to_their_own_families_in_one_clause`
- `binds_queue_and_error_numbers_to_their_own_families_in_one_clause`
- `falls_back_to_familyless_for_ambiguous_multi_family_numeric`
- `keeps_same_value_numerics_separate_across_metric_families`
- `does_not_mark_strong_case_contradicted_due_to_unrelated_family_in_clause`

## Implementation Approach: Negation-Aware Metric-State Classification

Add sentence/span-level polarity extraction so classification decides whether the context has issue evidence, normal evidence, or both for a family without matching issue terms inside normal/negated spans.

Design requirements:

1. Split context into clauses/sentences already used by `clauses()` plus sentence splitting in `sentenceForFamily`.
2. For each metric family in each clause, identify normal spans and issue spans:
   - normal explicit: family normal terms (`normal`, `healthy`, `steady`, `baseline`, `absent`, `clear`, `not blocked`, etc.)
   - negated issue: `no <family/issue phrase>`, `not <issue phrase>`, `<family phrase> is absent`, `<family phrase> remains normal`, `<family phrase> is healthy`, `<family phrase> is clear`
   - issue explicit: family issue terms only when not inside or governed by a normal/negated span
3. Classification rules:
   - issue rationale + normal-only context for same family => contradicted
   - issue rationale + issue context => present
   - normal rationale + normal context => present
   - normal rationale + genuine issue context outside a normal/negated span => contradicted
   - mixed context => use nearest/same-clause evidence when possible; prefer explicit contradiction only when a genuine opposite-polarity span is found
4. Numeric tokens should not by themselves turn a normal clause into issue evidence. Example: `CPU usage is normal at 28%` is normal, not issue.
5. Preserve true contradiction detection:
   - issue claim contradicted by normal context (`rationale: CPU saturation`, `context: CPU usage normal`)
   - normal claim contradicted by issue context (`rationale: no queue backlog`, `context: queue backlog growing`)
6. Mechanism negative matching remains allowed, but must not make metric_state issue regexes fire inside the same negated text.

Synthetic tests to add first (each negation/normal class must include at least two fresh phrasings not literal substrings of current family term lists, so tests cannot pass by adding one fixture-shaped regex):

- `classifies_no_lock_waits_as_present_normal_not_contradicted` plus a variant such as `lock waits remain at zero`
- `classifies_no_memory_pressure_as_present_normal_not_contradicted` plus a variant such as `memory pressure not observed`
- `classifies_memory_pressure_absent_as_present_normal_not_contradicted`
- `classifies_not_blocked_as_present_normal_not_contradicted` plus a variant such as `blocking is absent`
- `classifies_cpu_usage_normal_as_present_normal_not_contradicted` plus a variant such as `CPU load remains within baseline`
- `preserves_issue_claim_contradicted_by_normal_context` for several families, not only one example
- `preserves_normal_claim_contradicted_by_issue_context` for several families, not only one example

## Benchmark Threshold/Gate Updates

Update `SreBenchmarkMetrics.thresholdChecks` and tests so the saved-plan gates are explicit.

Required checks:

- `falseReconsiderRateStrong`: threshold `<= 0.17` (not `<= 0.35`)
- `shuffledContextGroundingDrop`: threshold `>= 0.20`
- `strongWeakGroundingSeparation`: threshold `>= 0.10`
- `permissiveRateWeak`: threshold `<= 0.45`
- `lockboxSpecificButUnsupportedZeroProceed`: threshold `0 proceed`
- `exploratorySpecificButUnsupportedZeroProceed`: threshold `0 proceed`
- `exploratoryFalseReconsiderRateStrong`: threshold `<= 0.17`
- `exploratoryDiagnosticStrongGroundingGap`: threshold `>= 0.20`
- `lockboxRankAgreement`: threshold `>= 0.55`
- `lockboxUnsupportedGroundingLeakageWarning`: threshold is warning-style; pass when lockbox unsupported mean grounding is not more than 0.05 above exploratory unsupported mean grounding, null if data absent

Expose these concrete per-split fields in `SreBenchmarkMetrics.bySplit[splitName]` (not just ad hoc locals inside threshold construction):

```ts
type SreBenchmarkSplitMetrics = {
  itemCount: number;
  meanOverallSignal: number;
  meanContextGrounding: number;
  falseProceedRateWeak: number;
  permissiveRateWeak: number;
  falseReconsiderRateStrong: number | null;
  rankAgreement: number;
  groundingFailureRateDiagnostic: number;
  contradictedAnchorRateDiagnostic: number;
  specificButUnsupportedProceedCount: number;
  specificButUnsupportedProceedRate: number | null;
  diagnosticStrongGroundingGap: number | null;
  unsupportedMeanContextGrounding: number | null;
};
```

Threshold-to-field wiring must be explicit:

- `lockboxSpecificButUnsupportedZeroProceed` reads `bySplit.lockbox.specificButUnsupportedProceedCount === 0`.
- `exploratorySpecificButUnsupportedZeroProceed` reads `bySplit.exploratory.specificButUnsupportedProceedCount === 0`.
- `exploratoryFalseReconsiderRateStrong` reads `bySplit.exploratory.falseReconsiderRateStrong <= 0.17` when non-null.
- `exploratoryDiagnosticStrongGroundingGap` reads `bySplit.exploratory.diagnosticStrongGroundingGap >= 0.20` when non-null.
- `lockboxUnsupportedGroundingLeakageWarning` reads `bySplit.lockbox.unsupportedMeanContextGrounding` and `bySplit.exploratory.unsupportedMeanContextGrounding` and passes/warns when lockbox is not more than 0.05 above exploratory, with `actual: null` if either side is absent.

`lockboxRankAgreement >= 0.55` is retained as a principled internal-alpha floor above random ordering plus margin, not chosen to pass the observed 0.4118; if it fails after general bug fixes, report it as a validity gap/off-ramp rather than lowering it.

Do not tune thresholds to make current results pass.

## Strict TDD Task List

Every behavior change must follow RED-GREEN-REFACTOR. Record command, expected red failure, and green result in final report.

### Task 0A: Close fallback grounding fabrication path

**Objective:** Prevent direct `buildReport` calls from fabricating a plain `proceed` recommendation using high `subscores.contextGrounding` without explicit grounding evidence.

**Files:**
- Modify test first: `test/evaluation/v2-types-and-heuristics.test.ts`
- Modify production after RED: `src/evaluation/report.ts`

**RED test:**

Call `buildReport` with a complete request/report input that supplies high `subscores.contextGrounding` but omits explicit `grounding`. Assert `recommendation !== "proceed"`, fallback grounding summary has no supported anchors, and the result communicates caveat/reconsider rather than verified evidence.

**RED command:**

```bash
npx vitest run test/evaluation/v2-types-and-heuristics.test.ts -t "fallback grounding|without explicit grounding"
```

Expected RED: current implementation can return plain `proceed` from fabricated fallback grounding.

**GREEN:** Prefer the smallest backward-compatible fix: make default grounding score safe (e.g., no verified anchors, low score, unsupported summary) so complete reports without explicit grounding cannot satisfy the plain-proceed floor. Do not weaken real evaluator paths that pass explicit grounding.

### Task 0B: Add successful v1 response-shape compatibility test

**Objective:** Prove legacy v1 success responses do not leak v2 fields.

**Files:**
- Modify test first: `test/http/v2-route.test.ts`
- Modify production only if the test reveals a real compatibility regression.

**RED/characterization test:**

Exercise a successful v1 route/handler path with provider/service dependencies stubbed at the module boundary if needed. Assert the response body is legacy-shaped (currently `score` and `terminalLog` plus any existing v1 legacy fields) and does not contain `grounding`, `subscores`, `overallSignal`, `contextGrounding`, or v2 calibration/status fields. Do not use or print real credentials.

**Command:**

```bash
npx vitest run test/http/v2-route.test.ts -t "v1.*success|legacy shape"
```

Expected result: if current v1 shape is already compatible, this may pass as a characterization test; if it fails, fix only the compatibility regression.

### Task 1: Numeric family attribution RED tests

**Objective:** Prove numerics bind to the closest semantically relevant family, including metric terms after the number.

**Files:**
- Modify test first: `test/evaluation/grounding.test.ts`
- Modify production after RED: `src/evaluation/grounding.ts`

**Step 1: Add failing tests**

Add fresh synthetic cases:

- locks + `87% I/O wait`: numeric anchor must be `io:<value>`, no unrelated locks contradiction
- `87% I/O wait` where the metric term appears after the numeric
- CPU + memory in the same clause with separate numbers
- queue + errors in the same clause with separate numbers
- an ambiguous multi-family numeric that should remain familyless rather than bind to the wrong family
- two same-value numerics in different families that must not be treated as interchangeable

**Step 2: RED command**

```bash
npx vitest run test/evaluation/grounding.test.ts -t "numeric|binds|I/O|CPU|queue"
```

Expected RED: current implementation produces `locks:<value>` for I/O wait or otherwise misbinds a multi-family number.

**Step 3: GREEN implementation**

Implement span-aware metric family candidate scoring in `grounding.ts` with no fixture-specific synonyms.

**Step 4: GREEN command**

```bash
npx vitest run test/evaluation/grounding.test.ts -t "numeric|binds|I/O|CPU|queue"
```

### Task 2: Negation-aware metric-state RED tests

**Objective:** Stop issue regexes from contradicting normal anchors when the issue word is inside a normal/negated span.

**Files:**
- Modify test first: `test/evaluation/grounding.test.ts`
- Modify production after RED: `src/evaluation/grounding.ts`

**Step 1: Add failing tests**

Add fresh synthetic cases for:

- `no lock waits`
- `no memory pressure`
- `memory pressure is absent`
- `not blocked`
- `CPU usage is normal`
- issue claim contradicted by normal context across CPU/memory/I/O/locks/queue/error or latency families where practical
- normal claim contradicted by issue context across CPU/memory/I/O/locks/queue/error or latency families where practical
- at least two fresh phrasings that are not already literal family terms

**Step 2: RED command**

```bash
npx vitest run test/evaluation/grounding.test.ts -t "no lock waits|memory pressure|not blocked|CPU usage is normal|contradicted by"
```

Expected RED: current implementation marks normal/negated spans as contradicted.

**Step 3: GREEN implementation**

Implement polarity extraction and use it in metric-state classification.

**Step 4: GREEN command**

```bash
npx vitest run test/evaluation/grounding.test.ts -t "no lock waits|memory pressure|not blocked|CPU usage is normal|contradicted by"
```

### Task 3: Strong-specific protection and unsupported guard tests

**Objective:** Prove strong grounded cases are not over-penalized while specific unsupported cases remain constrained.

**Files:**
- Modify test first: `test/evaluation/grounding.test.ts`
- Modify test first: `test/evaluation/v2-types-and-heuristics.test.ts`
- Modify production after RED if needed: `src/evaluation/grounding.ts`, `src/evaluation/report.ts`

**RED tests:**

- Strong synthetic case with unrelated normal lock clause plus true I/O issue remains `contextGrounding >= 0.75`, `summary.contradicted === 0`, recommendation `proceed` or `proceed_with_caveats`.
- Specific-but-unsupported synthetic rationale with absent fabricated mechanism remains `contextGrounding <= 0.50` or recommendation not `proceed`.

**RED command:**

```bash
npx vitest run test/evaluation/grounding.test.ts test/evaluation/v2-types-and-heuristics.test.ts -t "strong|unsupported|over-penal"
```

Expected RED: current code over-penalizes strong mixed-family/negated cases or lacks the new guard.

**GREEN:** Minimal fixes from Tasks 1 and 2 should make the strong case pass without weakening unsupported constraints. Do not relax recommendation floors.

### Task 4: Export and freeze report weights and grounding score caps

**Objective:** Prevent silent changes to the saved plan's report weighting and load-bearing grounding caps/floors.

**Files:**
- Modify test first: `test/evaluation/v2-types-and-heuristics.test.ts` and/or `test/evaluation/grounding.test.ts`
- Modify production after RED: `src/evaluation/report.ts`, `src/evaluation/grounding.ts`

**RED tests:**

Import `OVERALL_WEIGHTS` and assert exact value:

```ts
expect(OVERALL_WEIGHTS).toEqual({
  rationaleSpecificity: 0.23,
  actionCoupling: 0.22,
  alternativeResistance: 0.2,
  policyAlignment: 0.15,
  contextGrounding: 0.2,
});
```

Export a `GROUNDING_SCORE_CAPS` (or equivalently named) constant and assert exact values for the existing load-bearing caps/floors:

```ts
expect(GROUNDING_SCORE_CAPS).toEqual({
  noAnchorsFloor: 0.45,
  noCheckableContextCap: 0.25,
  contradictedHighWeightCap: 0.35,
  halfOrMoreAbsentCap: 0.5,
  absentMechanismCap: 0.65,
});
```

**RED command:**

```bash
npx vitest run test/evaluation/v2-types-and-heuristics.test.ts test/evaluation/grounding.test.ts -t "weights|score caps"
```

Expected RED: import/export missing or assertion unavailable.

**GREEN:** Export existing values; do not change weights/caps while freezing.

### Task 5: Benchmark threshold and split-gate RED tests

**Objective:** Make saved-plan gates executable and visible.

**Files:**
- Modify test first: `test/evaluation/sre-benchmark.test.ts`
- Modify production after RED: `src/evaluation/sreBenchmark.ts`

**RED tests:**

- `falseReconsiderRateStrong` threshold equals `<= 0.17`.
- `permissiveRateWeak` threshold exists and equals `<= 0.45`.
- `shuffledContextGroundingDrop` threshold exists and equals `>= 0.20`.
- lockbox/exploratory specific-but-unsupported zero-proceed checks exist.
- exploratory strong false-reconsider and diagnostic-vs-strong grounding-gap checks exist.
- lockbox rank agreement and unsupported grounding leakage warning checks exist.

**RED command:**

```bash
npx vitest run test/evaluation/sre-benchmark.test.ts -t "threshold|lockbox|permissive|shuffled|exploratory"
```

Expected RED: missing threshold check keys or old `<= 0.35` value.

**GREEN:** Extend metrics helpers and threshold checks. Keep checks independent from raw fixture text.

### Task 6: CLI/reporting visibility

**Objective:** Include grounding-specific headline fields in benchmark stdout.

**Files:**
- Modify test first if a CLI output test exists or add a small unit around rendered stdout if practical; otherwise treat as low-risk reporting change after benchmark metric tests are green.
- Modify production: `src/evaluation/runSreBenchmark.ts`

**Behavior:** stdout includes mean context grounding and shuffled grounding drop.

**Verification command:**

```bash
npm run benchmark:sre
```

### Task 7: Documentation updates

**Objective:** Update stale docs without overclaiming.

**Files:**
- Modify: `docs/ADR-001-Socratic-Interception.md`
- Review/modify: `README.md`
- Review/modify: `docs/production-readiness.md`

**Content requirements:**

- ADR v2 interface includes `contextGrounding` and `grounding` assessment.
- ADR explains context grounding as deterministic supplied-context evidence alignment only.
- ADR states it cannot prove truth, hidden cognition faithfulness, operational correctness, or production gating readiness.
- README and production readiness preserve David Deutsch tribute/independent disclaimer and do not overclaim.
- Audit wording remains limited to grounding subtree metadata, not whole-system proof of no future leakage; do not claim audit logs contain no operational evidence beyond what tests prove.
- ADR should include wording equivalent to: `contextGrounding is a deterministic supplied-context evidence-alignment proxy; it cannot prove truth, hidden cognition faithfulness, action optimality, or production allow/deny safety.`
- PR creation is out of scope for this remediation unless the user separately authorizes push/PR; leave the branch unpushed.

**Verification:** docs included in final diff review; no docs-only overclaim terms.

### Task 8: Targeted regression suite

**Objective:** Ensure all new and existing relevant tests pass together.

**Command:**

```bash
npx vitest run test/evaluation/grounding.test.ts test/evaluation/v2-types-and-heuristics.test.ts test/evaluation/audit.test.ts test/http/v2-route.test.ts test/evaluation/sre-benchmark.test.ts
```

### Task 9: Freeze and run benchmark

**Objective:** Inspect metrics after rules/tests/constants/plan are frozen.

**Pre-run process disclosure:** Record in final report: rules/constants/tests frozen after Tasks 1-8 passed; raw lockbox context/rationale not read; no post-lockbox tuning planned. Do not frame this as certified held-out validation.

**Command:**

```bash
npm run benchmark:sre
```

**Allowed inspection:** stdout and parsed `metrics` only: aggregate, split, label, threshold checks, recommendations by label, generated output paths.

**Forbidden inspection:** raw `items[*].case.context`, raw `items[*].case.rationale`, raw lockbox text, fixture prose, or raw benchmark contexts/rationales.

**Off-ramp:** If saved-plan benchmark gates fail after general synthetic-testable fixes, stop and report the validity gap. Do not tune synonyms/weights/floors after seeing lockbox/split results.

### Task 10: Full verification

Run:

```bash
npm test
npm run lint
npm audit --omit=dev --json
```

Then parse audit JSON for production vulnerabilities; do not print secrets.

### Task 11: Final Opus implementation review

**Objective:** Independent read-only review after local verification or off-ramp.

Use `/tmp/elenchus-grounding-final-implementation-review.md` and the user-specified `claude -p ... --model opus --effort max --allowedTools 'Read,Bash' --max-turns 20 --output-format json` command.

If Opus returns blockers, incorporate valid blockers with additional TDD cycles and rerun verification/review. If blockers require lockbox tuning or overfitting, take the off-ramp.

### Task 12: Commit readiness

Only commit if:

- targeted tests pass
- `npm test` passes
- `npm run lint` passes
- `npm audit --omit=dev --json` passes or is triaged as no production vulnerability
- benchmark gates either pass or any remaining failures are explicitly plan-accepted internal-alpha caveats, not saved-plan blockers
- final Opus implementation review is ACCEPT or ACCEPT_WITH_CHANGES with no blocking issues remaining
- generated benchmark output is not staged

Before commit:

```bash
git status --short
git diff --stat
# inspect full relevant diffs
git diff --check
git add README.md docs/production-readiness.md docs/ADR-001-Socratic-Interception.md docs/plans/2026-05-02-elenchus-context-grounding-plan.md docs/plans/2026-05-03-elenchus-context-grounding-remediation-plan.md src/evaluation/grounding.ts src/evaluation/report.ts src/evaluation/evaluator.ts src/evaluation/sreBenchmark.ts src/evaluation/runSreBenchmark.ts src/evaluation/types.ts test/evaluation/grounding.test.ts test/evaluation/v2-types-and-heuristics.test.ts test/evaluation/audit.test.ts test/evaluation/sre-benchmark.test.ts test/http/v2-route.test.ts
git diff --cached --stat
git diff --cached --check
```

Use explicit pathspecs only. Do not push.

Suggested commit:

```text
Add context grounding remediation for rationale support

- Fix numeric metric-family attribution so mixed-family clauses bind numbers to the closest semantically relevant metric family instead of unrelated nearby terms.
- Make metric-state classification negation-aware for normal spans such as no lock waits, no memory pressure, memory pressure absent, not blocked, and CPU usage normal.
- Export and freeze report overall weights; add saved-plan benchmark gates for strong false-reconsider, shuffled grounding drop, permissive weak rate, and split-specific unsupported checks.
- Update ADR/README/production-readiness docs with deterministic context-grounding caveats and internal-alpha framing.
- Lockbox-process disclosure: rules/constants/tests froze before post-remediation benchmark inspection; raw lockbox context/rationale was not read before freeze; no post-lockbox tuning was performed. This disclosure is governance context, not proof of held-out validity.
- No push performed.
```

## Verification Commands

During TDD:

```bash
npx vitest run test/evaluation/grounding.test.ts -t "numeric|binds|I/O|CPU|queue"
npx vitest run test/evaluation/grounding.test.ts -t "no lock waits|memory pressure|not blocked|CPU usage is normal|contradicted by"
npx vitest run test/evaluation/grounding.test.ts test/evaluation/v2-types-and-heuristics.test.ts -t "strong|unsupported|over-penal|weights"
npx vitest run test/evaluation/sre-benchmark.test.ts -t "threshold|lockbox|permissive|shuffled|exploratory"
```

Required final commands:

```bash
npx vitest run test/evaluation/grounding.test.ts test/evaluation/v2-types-and-heuristics.test.ts test/evaluation/audit.test.ts test/http/v2-route.test.ts test/evaluation/sre-benchmark.test.ts
npm test
npm run lint
npm run benchmark:sre
npm audit --omit=dev --json
```

Review commands:

```bash
claude -p "$(cat /tmp/elenchus-grounding-remediation-plan-review.md)" \
  --model opus \
  --effort max \
  --allowedTools 'Read,Bash' \
  --max-turns 20 \
  --output-format json > /tmp/elenchus-grounding-remediation-plan-review.json

claude -p "$(cat /tmp/elenchus-grounding-final-implementation-review.md)" \
  --model opus \
  --effort max \
  --allowedTools 'Read,Bash' \
  --max-turns 20 \
  --output-format json > /tmp/elenchus-grounding-final-implementation-review.json
```

## Acceptance Criteria

Functional:

- Numeric anchors bind to semantically relevant metric families, including after-number metric phrases.
- Negated/normal spans do not create false contradictions.
- True opposite-polarity contradictions remain detected.
- Strong grounded synthetic cases are not over-penalized by unrelated contradicted anchors.
- Specific unsupported synthetic cases remain constrained and cannot earn plain `proceed` through specificity alone.
- `OVERALL_WEIGHTS`, `ANCHOR_WEIGHTS`, `GROUNDING_SCORE_CAPS`, and recommendation floors are exported/test-frozen.
- Fallback/default grounding cannot produce plain `proceed` without explicit grounding evidence.
- v2 complete reports retain `subscores.contextGrounding`, `grounding`, `support.specificityMargin`, and `uncalibrated_internal_alpha`.
- v2 error reports keep `overallSignal: null`, `subscores: null`, `grounding: null`.
- Successful v1 response shape remains unchanged and excludes v2-only fields.
- Audit grounding payloads omit raw context, rationale, anchor text, `contextEvidence`, and `contradictionEvidence`.

Benchmark gates:

- weak false-proceed rate <= 0.10 (saved-plan overall)
- strong false-reconsider/escalate rate <= 0.17
- permissive weak rate <= 0.45
- strong/weak grounding separation >= 0.10
- shuffled-rationale context-grounding drop >= 0.20
- exploratory specific-but-unsupported zero proceed
- lockbox specific-but-unsupported zero proceed
- exploratory strong false-reconsider <= 0.17
- exploratory diagnostic-vs-strong grounding gap >= 0.20
- lockbox rank agreement >= 0.55, or report as validity gap/off-ramp if not met without tuning

Process:

- Opus plan review returns ACCEPT or ACCEPT_WITH_CHANGES after valid blockers incorporated.
- Opus final implementation review returns ACCEPT or ACCEPT_WITH_CHANGES with no blocking issues remaining.
- No raw lockbox context/rationale inspected before freeze.
- No post-lockbox tuning performed.
- No generated benchmark output staged.
- No push performed.

## Off-Ramp Rules

Stop and report a genuine blocker instead of continuing if any of these occur:

1. Passing saved-plan benchmark gates requires adding lockbox-shaped/fixture-shaped regexes, synonyms, thresholds, or weights after observing lockbox metrics.
2. General synthetic-testable fixes for numeric attribution and negation-aware classification do not recover strong-specific cases sufficiently, and further improvement would require raw lockbox/rationale inspection.
3. Opus plan review rejects the plan for a blocker that cannot be fixed without changing product scope or tuning against lockbox.
4. Opus final implementation review rejects the implementation for a blocker that would require overfitting or post-lockbox tuning to fix.
5. Tests/lint/audit reveal a root cause that requires a broader architecture change not covered by this plan.

If off-ramped, leave the working tree in its verified diagnostic state unless doing so would mix unrelated user work; do not commit failing benchmark claims. Final report must include which gate failed, parsed aggregate/split metrics, tests/lint status, why further tuning would violate blindness, exact files changed/left dirty, and what new plan/provider-judge/human-labeling work is needed.

## Product Framing Guardrails

Allowed:

- `contextGrounding` is a deterministic evidence-alignment proxy over supplied context only.
- It estimates whether load-bearing rationale anchors are present, absent, or contradicted in the supplied context.
- It is non-causal, non-authoritative, uncalibrated internal-alpha, and advisory.
- It can help identify specific-but-unsupported rationales as a diagnostic signal.

Forbidden / avoid:

- truth validator
- hidden chain-of-thought faithfulness detector
- general reasoning oracle
- production allow/deny gate
- calibrated production system
- safe-to-proceed guarantee
- proof of operational correctness

Elenchus remains a tribute to David Deutsch and *The Beginning of Infinity*; docs should continue to foreground hard-to-vary explanations, criticizability, error correction, and the independent/not-endorsed disclaimer.
