# Elenchus Context Grounding Implementation Plan

> **For Hermes:** This plan is for a fresh implementation session. Use `disciplined-project-delivery`, `test-driven-development`, and pre-commit review. This planning session must not implement production code.

**Goal:** Add a deterministic rationale-context grounding / evidence-alignment proxy so Elenchus can identify whether load-bearing rationale anchors are present, absent, or contradicted in the supplied context before issuing high-confidence advisory recommendations.

**Architecture:** Add a pure deterministic grounding module that extracts load-bearing rationale anchors, classifies them against the supplied context, exposes `subscores.contextGrounding` and a grounding assessment in v2 reports, and constrains recommendations when grounded support is too weak. Keep `specificityMargin` as a secondary diagnostic until margin is rebuilt on top of better grounding and neighbor coverage.

**Tech Stack:** TypeScript, Vitest, existing deterministic v2 evaluator, existing SRE benchmark harness.

---

## Status

Date: 2026-05-02
Plan status: final improved planning artifact after Opus 4.7 max-effort adversarial review
Calibration target: `uncalibrated_internal_alpha`
Repository baseline inspected: `/home/leonb/projects/elenchus-validator`, branch `main`, HEAD `827ac52`, remote `git@github.com:leonbreukelman/elenchus-validator.git`, clean before this plan file and ignored generated benchmark output.

## Adversarial Review Result Incorporated

Initial Opus 4.7 max-effort verdict: `ACCEPT_WITH_CHANGES`.
Post-incorporation Opus 4.7 max-effort verification verdict: `ACCEPT`.

Blocking feedback incorporated into this final plan:

- Added lockbox blindness / leakage discipline: rule derivation and unit tests must not use raw lockbox case text; lockbox cases are only inspected after rules and thresholds are frozen.
- Made benchmark acceptance split-aware instead of mixing exploratory and lockbox cases.
- Reframed deterministic grounding scope so the plan does not force case-specific temporal/role inference or benchmark memorization.
- Added audit privacy regression tests and restricted audit payload grounding fields to summaries/hashes, not raw anchor text or context evidence.
- Added lexical-copy / context-copy adversarial tests.
- Froze weighting and recommendation thresholds as priors, not post-benchmark tuning knobs.
- Added v1 compatibility guard tests.
- Added shuffled-rationale grounding-drop metrics and stronger caveat assertions.
- Added provider-judge off-ramp conditions if deterministic grounding requires hand-coded fixture rules.

## Goal

Implement the next most valuable internal-alpha evaluator improvement:

> Given context, proposed action, and stated rationale, add a deterministic proxy signal for whether the rationale's load-bearing anchors are supported by the supplied context.

The improvement should reduce over-rewarding of rationales that are specific and action-like but unsupported, fabricated, or contradicted by the context, while preserving the narrow product framing around rationale-action specificity and contrastive support.

## Non-goals / Framing Guardrails

Elenchus must remain a signal, not an oracle.

Non-goals:

- Do not claim objective truth validation.
- Do not claim hidden chain-of-thought faithfulness detection.
- Do not claim general reasoning verification.
- Do not turn v2 into a production autonomous allow/deny gate.
- Do not claim calibrated production readiness.
- Do not add a provider-based judge for this iteration unless the deterministic plan hits the off-ramp below and a new plan/review approves it.
- Do not tune against lockbox cases or edit lockbox fixture text to improve metrics.
- Do not remove `specificityMargin`; keep it as a secondary diagnostic.
- Do not make the SRE policy overlay a general policy-compliance system.

Approved framing language:

> Elenchus estimates rationale-action specificity and related internal-alpha signals. The context-grounding subscore is a deterministic proxy for whether load-bearing rationale anchors are present, absent, or contradicted in the supplied context. It does not establish that the context is true, that the action is operationally correct, or that hidden model cognition was faithful.

## Current Failure Being Addressed

The current deterministic evaluator is mostly lexical and context-blind after request parsing:

- `src/evaluation/providers.ts` deterministic support scoring checks action terms in the rationale.
- `src/evaluation/toulmin.ts` rewards numbers, domain terms, evidence markers, and causal connectors without checking whether those anchors appear in context.
- `src/domain/sre.ts` policy checks concatenate context and rationale, so rationale-only claims can satisfy some evidence phrases. This plan does not rebuild policy, but grounding must reduce the effect of that laundering.
- `src/evaluation/report.ts` combines specificity, action coupling, alternative resistance, and policy alignment without a grounding term.

Latest `npm run benchmark:sre` baseline observed during planning:

- 42 synthetic SRE cases, all complete.
- Strong/weak overall signal separation: 0.1427.
- Strong/weak specificity-margin separation: -0.0711, failed threshold `>= 0.10`.
- Core weak signal separation: 0.1549.
- Diagnostic mean signal for specific-but-unsupported/action-mismatched cases: 0.6194.
- `specific_but_unsupported` mean signal: 0.7174.
- `strong_specific` mean signal: 0.7379.
- Some unsupported rationales got `proceed`.
- False-proceed weak rate: 0.0556.
- Permissive weak rate: 0.5556.
- Policy violation detection: 0.8333, but phrase-matching is brittle.
- Overall rank agreement: 0.8207.
- Lockbox rank agreement: 0.5882.
- Expected band match: 0.6429.
- Shuffled-rationale mean: 0.5261.
- Shuffled-rationale drop: 0.0895.

Worst disagreements are dominated by detailed unsupported claims. The plan attacks that false-positive cluster without broadening product claims.

## Why This Is The Next Most Valuable Improvement

A prior max-effort Opus review rejected making contrastive margin primary now because the current deterministic scorer is context-blind and lexical. The current benchmark confirms that `specific_but_unsupported` cases are over-rewarded and can receive `proceed` even when the rationale is unsupported by context.

Grounding is therefore the best immediate improvement because it addresses the highest-severity known false-positive cluster and prepares the ground for a later rebuilt margin. Contrastive support is not meaningful if the rationale's load-bearing evidence anchors are not first checked against the supplied context.

## Decision To Defer Provider Judging

Do not add provider-based grounding judging in this implementation because:

- The repo currently has a deterministic local path that keeps tests repeatable and avoids extra latency/cost.
- No human-labeled calibration set exists to justify provider-score thresholds.
- The requested next step is explicitly a deterministic grounding/evidence-alignment proxy.
- A provider judge would introduce evaluator independence, prompt-injection, model-version, and budget issues that need their own plan.

Provider judging should be reconsidered if, during implementation, the deterministic grounder cannot reduce unsupported-specific false positives without hand-coding fixture-specific rules, or after a human-labeled SRE calibration set exists.

## Lockbox And Leakage Discipline

The benchmark has exploratory and lockbox splits. This plan must not convert the lockbox into a tuning set.

Implementation rules:

1. Before grounding rules are frozen, the implementer may inspect source code, tests, docs, benchmark schema, and aggregate metrics.
2. Before grounding rules are frozen, the implementer must not read raw `context` or `rationale` text for lockbox fixture cases.
3. Lockbox case IDs to withhold until after rule freeze: `sre-bench-020`, `sre-bench-024`, and `sre-bench-028`. Prefer withholding all raw lockbox `context`/`rationale` text, not only these IDs.
4. Unit tests must use fresh inline examples authored for the tests, not copied or paraphrased from lockbox fixture text.
5. Grounding thresholds and weights must be frozen before the first post-implementation benchmark run.
6. After lockbox benchmark results are observed, do not tune grounding rules, synonym tables, weights, or recommendation floors to improve lockbox results. If lockbox exposes failure, report it and either accept the limitation or write a new reviewed plan.
7. The implementation final report must include a lockbox-process disclosure: when rules were frozen, whether raw lockbox text was read before then, and whether any post-lockbox tuning occurred. This disclosure is governance context, not proof of held-out validity.

## Architecture Approach

### Core design

Create a pure deterministic module:

- `src/evaluation/grounding.ts`

Expose:

- `extractGroundingAnchors(rationale: string, action?: TypedAction): GroundingAnchor[]`
- `classifyGroundingAnchors(context: string, anchors: GroundingAnchor[]): GroundingAnchor[]`
- `assessContextGrounding(request: EvaluationRequestV2): ContextGroundingAssessment`

Evaluator flow:

1. Extract Toulmin/specificity from rationale.
2. Generate near-neighbor alternatives.
3. Assess support via existing provider.
4. Evaluate SRE policy overlay.
5. Assess context grounding with deterministic local code.
6. Build subscores including `contextGrounding`.
7. Build report including grounding assessment.
8. Compute overall signal with grounding weight.
9. Apply recommendation constraints from grounding and policy blockers.

### Grounding scope

The deterministic grounder should catch these general classes:

- Exact or normalized presence of load-bearing numeric/entity/metric/mechanism anchors.
- Explicit negation of the same anchor family in context.
- Metric-state numeric incompatibility for the same metric family when both values are visible.
- Absence of rationale-specific load-bearing anchors in the supplied context.

The deterministic grounder is not expected to fully solve:

- Temporal-state inference that requires world knowledge beyond visible anchors.
- Role/assignment inference unless expressed through general positive/negative assignment language.
- Multi-sentence causal entailment.
- Paraphrases outside a small documented SRE synonym table.
- Real-world truth beyond the supplied context.

If acceptance requires hand-coding unsupported fixture cases outside the scoped classes above, stop and document the off-ramp to a provider-judge or human-labeling plan instead of overfitting.

### Anchor classes

Extract only load-bearing anchors from the rationale, not every token. Initial deterministic classes:

1. `numeric`
   - Counts, percentages, durations, latency values, capacity values, version-like numeric identifiers when paired with nearby metric/entity/action words.

2. `entity`
   - Incident-specific identifiers, service names, regions, relation/table names, deploy/release identifiers, named logs/tools.

3. `metric_state`
   - Metric plus state/trend claim, such as saturation, normality, regression, increase/decrease, stability, or threshold crossing.

4. `mechanism`
   - Causal/runbook mechanism phrases that make the rationale load-bearing, such as resource contention, release correlation, capacity bottleneck, local process degradation, dependency failure, or approval/assignment state.

Do not derive synonym tables by scanning lockbox fixture prose. Use small domain-general SRE synonyms already justified by source/docs and exploratory examples, and document each synonym family in `grounding.ts` comments.

### Type shape

```ts
export type GroundingAnchorKind = "numeric" | "entity" | "metric_state" | "mechanism";
export type GroundingAnchorStatus = "present" | "absent" | "contradicted";

export interface GroundingAnchor {
  id: string;
  kind: GroundingAnchorKind;
  text: string;
  normalizedText: string;
  loadBearing: boolean;
  status: GroundingAnchorStatus;
  contextEvidence: string | null;
  contradictionEvidence: string | null;
  weight: number;
  notes: string[];
}

export interface ContextGroundingSummary {
  present: number;
  absent: number;
  contradicted: number;
  loadBearing: number;
}

export interface ContextGroundingAssessment {
  score: number;
  anchors: GroundingAnchor[];
  summary: ContextGroundingSummary;
  notes: string[];
}
```

### Classification rules

Classify `present` when:

- Exact normalized phrase appears in context, or
- Numeric value/unit appears near matching metric/entity terms in context, or
- A documented domain synonym maps to a context phrase in a way that does not require knowing the benchmark label.

Classify `contradicted` when:

- Context explicitly negates the same anchor family that the rationale asserts.
- Context explicitly asserts the opposite polarity for the same anchor family.
- Rationale and context provide incompatible numeric states for the same metric family.

Classify `absent` when:

- A load-bearing anchor from the rationale cannot be found in context and no contradiction rule fires.

Prefer conservative `absent` over invented semantic inference. Do not classify broader operational truth.

### Scoring rules

Compute `ContextGroundingAssessment.score` from load-bearing anchors only:

- `present`: 1.0
- `absent`: 0.25
- `contradicted`: 0.0
- Weighted mean by anchor weight.
- If no load-bearing anchors are extracted, score `0.45` with a note that the rationale provides no checkable context anchors.
- If the rationale has load-bearing anchors but context is empty or effectively anchorless, cap score at `0.25`.
- If any high-weight contradicted anchor exists, cap score at `0.35`.
- If at least half of load-bearing weight is absent, cap score at `0.50`.
- Clamp to `[0, 1]` and round to 4 decimals.

### Frozen priors

These priors must be frozen before the first post-implementation benchmark run:

Anchor weights:

- `numeric`: 1.0
- `entity`: 0.7
- `metric_state`: 1.2
- `mechanism`: 1.2

Overall weights:

- `rationaleSpecificity`: 0.23
- `actionCoupling`: 0.22
- `alternativeResistance`: 0.20
- `policyAlignment`: 0.15
- `contextGrounding`: 0.20

Recommendation grounding floors:

- Policy blockers still force `escalate`.
- `overallSignal === null` still returns `abort_signal_only`.
- Any load-bearing contradiction caps the recommendation at `reconsider`.
- `contextGrounding < 0.40` caps the recommendation at `reconsider`.
- `0.40 <= contextGrounding < 0.60` caps the recommendation at `proceed_with_caveats`.
- `contextGrounding >= 0.60` uses existing overall-signal thresholds.

If implementation changes any frozen prior after observing benchmark results, stop and run another adversarial plan review before committing.

### Confidence

Update report confidence so low grounding does not coexist with high confidence solely because margin/policy are high. A simple acceptable change is to incorporate `contextGrounding` and anchor coverage into the existing confidence calculation. Add tests that contradicted grounding lowers confidence relative to a strong grounded case.

### Audit privacy

Do not write raw grounding text evidence into audit logs. Audit payload may include only:

- grounding score
- grounding summary counts
- anchor IDs
- anchor kinds
- anchor statuses
- anchor weights
- anchor text hashes if needed

Audit payload must not include:

- raw `GroundingAnchor.text`
- raw `normalizedText`
- raw `contextEvidence`
- raw `contradictionEvidence`
- raw request context
- raw rationale

## Target Result Contract

A complete v2 report should include:

```json
{
  "subscores": {
    "rationaleSpecificity": 0.88,
    "actionCoupling": 0.82,
    "alternativeResistance": 0.74,
    "policyAlignment": 0.9,
    "contextGrounding": 0.86
  },
  "grounding": {
    "score": 0.86,
    "anchors": [
      {
        "id": "anchor-1",
        "kind": "numeric",
        "text": "load-bearing rationale phrase",
        "normalizedText": "normalized load-bearing rationale phrase",
        "loadBearing": true,
        "status": "present",
        "contextEvidence": "matching supplied-context snippet",
        "contradictionEvidence": null,
        "weight": 1,
        "notes": []
      }
    ],
    "summary": {
      "present": 4,
      "absent": 0,
      "contradicted": 0,
      "loadBearing": 4
    },
    "notes": [
      "Deterministic context-grounding proxy over supplied context only; not objective truth validation."
    ]
  }
}
```

Error/incomplete reports should keep `overallSignal: null`, `subscores: null`, and `grounding: null`.

## Type/API Changes

Modify `src/evaluation/types.ts`:

- Add grounding union types and interfaces.
- Add `contextGrounding: number` to `EvaluationSubscores` for complete reports.
- Add `grounding: ContextGroundingAssessment | null` to `EvaluationReportV2`.

Modify `src/evaluation/report.ts`:

- Add grounding to `buildReport` input.
- Include grounding in returned complete reports.
- Add `contextGrounding` weight to `overallSignal`.
- Update recommendation logic to accept grounding constraints.
- Add grounding weaknesses for absent/contradicted anchors.
- Update `PRODUCT_SEMANTICS` to mention the context-grounding proxy while preserving non-oracle caveats.
- Add `grounding: null` in `buildErrorReport`.
- Update confidence to reflect grounding.

Modify `src/evaluation/evaluator.ts`:

- Call `assessContextGrounding(request)`.
- Include `contextGrounding: grounding.score` in subscores.
- Pass grounding into `buildReport`.
- Update audit-safe payload with sanitized grounding summary only.

Do not change the v1 endpoint response shape.

## Benchmark Changes

Modify `src/evaluation/sreBenchmark.ts`:

- Extend `LabelMetrics` with `meanContextGrounding`.
- Extend headline metrics with:
  - `meanContextGrounding`
  - `strongWeakGroundingSeparation`
  - `diagnosticMeanContextGrounding`
  - `specificButUnsupportedMeanContextGrounding`
  - `groundingFailureRateDiagnostic` where failure means any absent or contradicted load-bearing anchor.
  - `contradictedAnchorRateDiagnostic`
  - `shuffledMeanContextGrounding`
  - `shuffledContextGroundingDropFromOriginal`
- Add split-aware grounding metrics for exploratory vs lockbox.
- Add threshold checks for grounding-specific internal-alpha reference points.
- Render grounding metrics in Markdown.
- Keep leakage test: evaluator request must still contain only `traceId`, `domain`, `context`, `proposedAction`, `rationale`, and `metadata`.

Do not modify benchmark labels or lockbox fixtures to make this iteration look better. Unit tests should use inline cases.

## Strict TDD Task List

Every behavior change must start with a failing test and record red/green evidence in the final implementation report.

### Task 1: Add grounding type contract tests

**Objective:** Define desired complete-report shape before production types change.

**Files:**
- Modify test first: `test/evaluation/v2-types-and-heuristics.test.ts`
- Modify production after RED: `src/evaluation/types.ts`, `src/evaluation/report.ts`

**RED:** Add a test expecting `buildReport` to include `subscores.contextGrounding` and `grounding` with caveat notes.

**Run:**

```bash
npx vitest run test/evaluation/v2-types-and-heuristics.test.ts --runInBand
```

**Expected RED:** Type/runtime failure because `contextGrounding` and `grounding` do not exist.

**GREEN:** Add types and minimal report-builder wiring.

### Task 2: Add error-report grounding null test

**Objective:** Preserve status-safe semantics.

**Files:**
- Modify test first: `test/evaluation/v2-types-and-heuristics.test.ts`
- Modify production after RED: `src/evaluation/report.ts`

**RED:** `buildErrorReport` returns `overallSignal: null`, `subscores: null`, and `grounding: null`.

**GREEN:** Add `grounding: null` to error reports.

### Task 3: Create grounding present-anchor tests

**Objective:** Prove strong-specific inline SRE rationales extract load-bearing anchors and classify them present.

**Files:**
- Create test first: `test/evaluation/grounding.test.ts`
- Create production after RED: `src/evaluation/grounding.ts`

**RED:** Fresh inline incident context/rationale, not copied from lockbox, returns score `>= 0.80`, at least one numeric anchor, at least one mechanism anchor, and no absent/contradicted anchors.

**GREEN:** Implement minimal extraction/classification for present anchors.

### Task 4: Add explicit-negation contradiction tests

**Objective:** Catch a general contradiction class without copying fixture text.

**Files:**
- Modify test first: `test/evaluation/grounding.test.ts`
- Modify production after RED: `src/evaluation/grounding.ts`

**RED:** Fresh inline context explicitly negates an asserted resource state; rationale asserts that state as load-bearing. Expect at least one `contradicted` anchor and score `< 0.40`.

**GREEN:** Add generalized negation/polarity detection for SRE resource-state families.

### Task 5: Add release-correlation contradiction tests

**Objective:** Catch unsupported rollback-style rationales with a general rule.

**Files:**
- Modify test first: `test/evaluation/grounding.test.ts`
- Modify production after RED: `src/evaluation/grounding.ts`

**RED:** Fresh inline context explicitly negates a claimed release/deploy correlation using wording not copied from the fixture. Rationale asserts a release-caused regression. Expect contradicted release/metric anchor and score `< 0.45`.

**GREEN:** Add general release/deploy event negation and entity handling.

### Task 6: Add metric-state numeric mismatch tests

**Objective:** Catch metric fabrication without phrase overfitting.

**Files:**
- Modify test first: `test/evaluation/grounding.test.ts`
- Modify production after RED: `src/evaluation/grounding.ts`

**RED:** Context and rationale give incompatible values for the same metric family. Expect contradicted `metric_state` or numeric anchor and score `< 0.50`.

**GREEN:** Add metric-value extraction for a small documented SRE metric family table.

### Task 7: Add absent-anchor tests

**Objective:** Penalize unsupported details even when no explicit contradiction phrase exists.

**Files:**
- Modify test first: `test/evaluation/grounding.test.ts`
- Modify production after RED: `src/evaluation/grounding.ts`

**RED:** Rationale names a load-bearing entity/version/metric not found in context. Expect `absent` anchors and score capped at `<= 0.50`.

**GREEN:** Add conservative absent classification and scoring cap.

### Task 8: Add empty-context anchored-rationale test

**Objective:** Prevent empty or anchorless context from receiving the no-anchor floor.

**Files:**
- Modify test first: `test/evaluation/grounding.test.ts`
- Modify production after RED: `src/evaluation/grounding.ts`

**RED:** Rationale has load-bearing anchors, but context has no corresponding anchors. Expect score `<= 0.25`.

**GREEN:** Add empty/anchorless-context cap.

### Task 9: Add lexical-copy adversarial test

**Objective:** Do not let verbatim context copying inflate grounding when the load-bearing mechanism is fabricated or unsupported.

**Files:**
- Modify test first: `test/evaluation/grounding.test.ts`
- Modify production after RED: `src/evaluation/grounding.ts`

**RED:** Rationale copies several context phrases verbatim but adds an unsupported load-bearing mechanism/action justification. Expect that the unsupported mechanism is `absent` or `contradicted`, and grounding does not exceed `0.65`.

**GREEN:** Ensure extracted load-bearing mechanism anchors count materially in scoring.

### Task 10: Prove grounded action mismatch remains distinct from grounding

**Objective:** Preserve narrow semantics: grounding is not action correctness.

**Files:**
- Modify test first: `test/evaluation/grounding.test.ts`

**RED:** Context and rationale support a neighbor action while the proposed action is different. Expect context grounding high; action mismatch must be handled by action coupling / alternative resistance / recommendation logic.

**GREEN:** Adjust only if the grounder wrongly penalizes grounded facts because they support a neighbor action.

### Task 11: Freeze grounding priors tests

**Objective:** Make weights/floors explicit priors rather than silent tuning knobs.

**Files:**
- Modify test first: `test/evaluation/grounding.test.ts` or `test/evaluation/v2-types-and-heuristics.test.ts`
- Modify production after RED: `src/evaluation/grounding.ts`, `src/evaluation/report.ts`

**RED:** Assert exported constants for anchor weights and recommendation grounding floors match this plan.

**GREEN:** Export constants and use them in the implementation.

### Task 12: Wire grounding into evaluator and recommendation gating

**Objective:** Prevent unsupported/contradicted rationales from receiving `proceed` while preserving strong cases.

**Files:**
- Modify test first: `test/evaluation/v2-types-and-heuristics.test.ts`
- Modify production after RED: `src/evaluation/evaluator.ts`, `src/evaluation/report.ts`

**RED cycle A:** Unsupported inline rationale with contradicted grounding returns `recommendation !== "proceed"`, `subscores.contextGrounding < 0.40`, and `topWeaknesses` mentions context grounding.

**RED cycle B:** Strong inline rationale remains `proceed` or `proceed_with_caveats` with `subscores.contextGrounding >= 0.75`.

**GREEN:** Wire `assessContextGrounding`, update overall weights, confidence, and recommendation constraints.

### Task 13: Add audit privacy regression test

**Objective:** Preserve audit redaction when grounding evidence exists.

**Files:**
- Modify test first: `test/evaluation/audit.test.ts`
- Modify production after RED: `src/evaluation/evaluator.ts`

**RED:** Evaluate a request with a distinctive context phrase and distinctive rationale anchor that produce absent/contradicted grounding. Read the audit file and assert it does not contain raw context, raw rationale, raw anchor text, `contextEvidence`, or `contradictionEvidence`; assert it does contain grounding score/summary/status metadata.

**GREEN:** Sanitize grounding data before adding it to `auditSafePayload`.

### Task 14: Update HTTP route and v1 compatibility tests

**Objective:** Ensure API responses include additive v2 grounding fields and v1 remains unchanged.

**Files:**
- Modify test first: `test/http/v2-route.test.ts`

**RED cycle A:** Valid `/api/v2/evaluate` response includes `body.subscores.contextGrounding` and `body.grounding.score`.

**RED cycle B:** Valid or stubbed `/api/v1/intercept` response does not include `grounding`, `contextGrounding`, `subscores`, or other v2 report fields. If credentials make a full v1 call impractical, assert this through the existing v1 route/auth-compatible test harness or a service-level test.

**GREEN:** v2 should pass after evaluator/report wiring; adjust only v1 test harness if needed.

### Task 15: Add benchmark grounding metric tests

**Objective:** Make benchmark expose grounding behavior and split-aware leakage risk.

**Files:**
- Modify test first: `test/evaluation/sre-benchmark.test.ts`
- Modify production after RED: `src/evaluation/sreBenchmark.ts`

**RED tests:**

- `computeSreBenchmarkMetrics` computes mean context grounding, strong/weak grounding separation, diagnostic grounding failure rate, and shuffled grounding drop.
- Metrics are reported separately for exploratory and lockbox splits.
- Markdown summary includes `context-grounding`, `uncalibrated_internal_alpha`, and signal-not-oracle caveats.
- Markdown summary must not contain forbidden overclaims such as `truth oracle`, `verifies truth`, `faithfulness detector`, `safe to proceed`, or `production gate`.

**GREEN:** Extend metrics and renderer.

### Task 16: Run exploratory benchmark first, freeze, then inspect lockbox

**Objective:** Avoid post-hoc lockbox tuning.

**Procedure:**

1. Before running full benchmark after implementation, record that grounding rules, constants, and tests are frozen.
2. Run `npm run benchmark:sre`.
3. Inspect aggregate summary and split metrics.
4. Do not tune rules after inspecting lockbox. If lockbox fails, report the failure and remaining validity gap.

### Task 17: Documentation updates

**Objective:** Update product/API docs without overclaiming.

**Files:**
- Modify: `README.md`
- Modify: `docs/production-readiness.md`
- Modify: `docs/ADR-001-Socratic-Interception.md`

**Content:** Add `contextGrounding` to sample v2 response and limitations. Replace broad wording touched nearby with rationale-action specificity / signal-not-oracle language. Preserve David Deutsch tribute and independent/not-endorsed disclaimer.

### Task 18: Full verification and final Opus review

**Commands:**

```bash
npm test
npm run lint
npm run benchmark:sre
npm audit --omit=dev --json
```

Then run Opus 4.7 max-effort read-only final implementation review per the implementation-session prompt.

### Task 19: Commit readiness after review fixes

**Objective:** Leave branch PR-ready without pushing.

**Commands:**

```bash
git status --short
git diff -- README.md docs/production-readiness.md docs/ADR-001-Socratic-Interception.md src/evaluation/types.ts src/evaluation/grounding.ts src/evaluation/evaluator.ts src/evaluation/report.ts src/evaluation/sreBenchmark.ts test/evaluation/grounding.test.ts test/evaluation/v2-types-and-heuristics.test.ts test/evaluation/sre-benchmark.test.ts test/evaluation/audit.test.ts test/http/v2-route.test.ts
git diff --check
git add README.md docs/production-readiness.md docs/ADR-001-Socratic-Interception.md src/evaluation/types.ts src/evaluation/grounding.ts src/evaluation/evaluator.ts src/evaluation/report.ts src/evaluation/sreBenchmark.ts test/evaluation/grounding.test.ts test/evaluation/v2-types-and-heuristics.test.ts test/evaluation/sre-benchmark.test.ts test/evaluation/audit.test.ts test/http/v2-route.test.ts
git diff --cached --check
git commit -m "Add context grounding signal for rationale support"
```

Do not stage `benchmark-output/`. Do not push.

## Exact Files Likely To Change

Production/source:

- Create: `src/evaluation/grounding.ts`
- Modify: `src/evaluation/types.ts`
- Modify: `src/evaluation/evaluator.ts`
- Modify: `src/evaluation/report.ts`
- Modify: `src/evaluation/sreBenchmark.ts`
- Possibly modify: `src/domain/sre.ts` only if tests prove policy laundering blocks acceptance. If touched, keep it a separate TDD cycle and add policy tests.

Tests:

- Create: `test/evaluation/grounding.test.ts`
- Modify: `test/evaluation/v2-types-and-heuristics.test.ts`
- Modify: `test/evaluation/sre-benchmark.test.ts`
- Modify: `test/evaluation/audit.test.ts`
- Modify: `test/http/v2-route.test.ts`
- Possibly modify: `test/domain/sre-policy.test.ts` only if `src/domain/sre.ts` changes.

Docs:

- Modify: `README.md`
- Modify: `docs/production-readiness.md`
- Modify: `docs/ADR-001-Socratic-Interception.md`
- This saved plan: `docs/plans/2026-05-02-elenchus-context-grounding-plan.md`

Do not modify:

- `benchmark/fixtures/sre/sre-benchmark-cases.json` unless a test reveals a schema error. Do not tune fixture prose for metric wins.
- `benchmark-output/` except ignored generated outputs.

## Tests To Write First

Minimum tests:

1. `test/evaluation/grounding.test.ts`
   - `scores_present_load_bearing_anchors_high_for_fresh_strong_case`
   - `marks_explicitly_negated_claim_family_contradicted`
   - `marks_release_correlation_claim_contradicted_when_context_negates_event`
   - `marks_metric_state_contradicted_when_same_metric_has_incompatible_value`
   - `marks_unseen_specific_entities_absent_without_claiming_truth_validation`
   - `keeps_grounding_low_when_context_has_no_matching_anchors`
   - `does_not_reward_verbatim_context_copy_with_fabricated_load_bearing_mechanism`
   - `keeps_grounded_action_mismatch_grounding_high_when_facts_are_present`
   - `freezes_grounding_weights_and_recommendation_floors`

2. `test/evaluation/v2-types-and-heuristics.test.ts`
   - `builds_complete_reports_with_context_grounding_contract`
   - `builds_error_reports_with_null_grounding_and_no_fake_grounding_score`
   - `deterministic_evaluator_caps_recommendation_for_contradicted_grounding`
   - `deterministic_evaluator_does_not_over_penalize_strong_grounded_rationale`
   - `contradicted_grounding_lowers_confidence_relative_to_grounded_case`

3. `test/evaluation/audit.test.ts`
   - `audit_payload_does_not_leak_grounding_text_or_context_evidence`

4. `test/evaluation/sre-benchmark.test.ts`
   - `computes_context_grounding_metrics_and_diagnostic_failure_rates`
   - `computes_shuffled_rationale_grounding_drop`
   - `reports_grounding_metrics_by_split_without_label_leakage`
   - `renders_context_grounding_metrics_with_signal_not_oracle_caveats`

5. `test/http/v2-route.test.ts`
   - `returns_context_grounding_fields_for_valid_sre_evaluations`
   - `v1_intercept_response_does_not_include_grounding_fields`

## Verification Commands

Run targeted commands during TDD cycles:

```bash
npx vitest run test/evaluation/grounding.test.ts --runInBand
npx vitest run test/evaluation/v2-types-and-heuristics.test.ts --runInBand
npx vitest run test/evaluation/audit.test.ts --runInBand
npx vitest run test/evaluation/sre-benchmark.test.ts --runInBand
npx vitest run test/http/v2-route.test.ts --runInBand
```

Run final verification:

```bash
npm test
npm run lint
npm run benchmark:sre
npm audit --omit=dev --json
```

## Acceptance Metrics

All are internal-alpha directional checks, not production validation.

Functional acceptance:

- Complete v2 reports include `subscores.contextGrounding` and `grounding` assessment.
- Error/aborted reports keep `overallSignal: null`, `subscores: null`, `grounding: null`.
- Strong-specific unit cases have `contextGrounding >= 0.75` and no contradictory anchors.
- Contradicted unsupported unit cases have `contextGrounding < 0.40` and at least one contradicted load-bearing anchor.
- Absent unsupported unit cases have `contextGrounding <= 0.50`.
- Empty/anchorless-context anchored rationales have `contextGrounding <= 0.25`.
- Context-copy adversarial cases with fabricated load-bearing mechanisms have `contextGrounding <= 0.65`.
- Grounded action-mismatch unit cases can have high context grounding; action mismatch must be handled by action coupling / alternative resistance, not by pretending grounded facts are false.
- Audit logs do not contain raw context, rationale, anchor text, context evidence, or contradiction evidence.
- v1 response shape does not include grounding fields.

Benchmark acceptance against existing 42 synthetic cases, reported split-aware:

Exploratory strict checks:

- Exploratory `specific_but_unsupported` cases receive zero `proceed` recommendations.
- Exploratory mean `specific_but_unsupported` overall signal is at least 0.10 below exploratory mean `strong_specific` overall signal.
- Exploratory mean diagnostic context grounding is at least 0.20 below exploratory mean strong-specific context grounding.
- Exploratory weak false-proceed rate remains `<= 0.10`.
- Exploratory strong false-reconsider/escalate rate remains `<= 0.17`.

Lockbox falsification checks:

- Lockbox `specific_but_unsupported` cases receive zero `proceed` recommendations, reported separately.
- Lockbox context-grounding behavior must be reported without post-hoc tuning. If it fails, do not tune rules; document as a validity gap.
- Lockbox unsupported grounding should not look implausibly better than exploratory unsupported grounding. If lockbox unsupported mean grounding is more than 0.05 higher than exploratory unsupported mean grounding, treat it as a leakage/variance warning requiring explanation.
- Lockbox rank agreement should not degrade below 0.55. If it does, report the tradeoff instead of hiding it.

Overall checks:

- Mean diagnostic context grounding is materially below mean strong-specific context grounding.
- Weak false-proceed rate remains `<= 0.10`.
- Strong false-reconsider/escalate rate remains `<= 0.17`.
- Permissive weak rate improves from baseline 0.5556 toward `<= 0.45` without broad over-penalization.
- Overall rank agreement remains `>= 0.70`.
- Shuffled-rationale context-grounding drop is `>= 0.20`.
- Calibration caveat remains present in all reports and benchmark summary.
- `npm test`, `npm run lint`, `npm run benchmark:sre`, and `npm audit --omit=dev --json` pass or are fully triaged.

If lockbox fails while exploratory passes, the implementation may still be useful but must be reported as unvalidated and must not be tuned against lockbox in the same implementation session.

## Rejection Criteria

Reject or rework the implementation if any of these occur:

- It claims or implies objective truth validation, hidden cognition verification, or production allow/deny authority.
- It removes or hides `specificityMargin` instead of keeping it as a secondary diagnostic.
- It relies on benchmark labels, expected bands, notes, or other label-side fixture fields during evaluation.
- It reads raw lockbox context/rationale before grounding rules and thresholds are frozen.
- It edits benchmark lockbox cases or fixture rationale wording primarily to improve metrics.
- It changes frozen weights/floors after seeing benchmark results without a new adversarial plan review.
- It adds external provider calls, new runtime dependencies, embeddings, or model judging for this iteration without hitting the documented off-ramp and getting a new reviewed plan.
- It reduces strong-specific cases to mostly `reconsider`/`escalate`.
- It leaves exploratory `specific_but_unsupported` rationales receiving `proceed` due to high lexical specificity.
- It makes grounded action-mismatch facts look ungrounded merely because they support a neighbor action.
- It leaks raw context/rationale/grounding evidence into audit logs.
- It breaks v1 compatibility or status-safe v2 error semantics.
- It commits generated `benchmark-output/` files.

## Backward Compatibility Strategy

- v1 `/api/v1/intercept` response remains unchanged.
- v2 complete reports add fields but do not remove existing fields.
- Existing v2 `subscores` fields remain with the same names.
- `specificityMargin` remains in `support`.
- Error reports preserve `overallSignal: null` and `subscores: null`; add `grounding: null` explicitly.
- Calibration remains `uncalibrated_internal_alpha`.
- Product semantics remain caveated.
- Audit logs stay hash/summary based and do not store raw context, rationale, or grounding snippets.

## Product Framing Language

Use language like:

> `contextGrounding` is a deterministic internal-alpha proxy that checks whether the rationale's load-bearing numeric, entity, metric-state, and mechanism anchors are present, absent, or contradicted in the supplied context. It strengthens the rationale-action specificity signal by penalizing rationales that are specific but unsupported by the provided context. It does not validate the real-world truth of the context, determine the operationally optimal action, inspect hidden chain-of-thought, or authorize autonomous production execution.

Avoid:

- `truth score`
- `verifies rationale correctness`
- `detects hallucinations` without qualification
- `faithfulness detector`
- `safe to proceed`
- `production gate`

## Remaining Failure Modes

- Lexical and regex grounding remains brittle and will miss paraphrases.
- Deterministic contradiction rules can produce false positives for nuanced context.
- Numeric metric-state extraction can misfire when the same metric appears multiple times with different values.
- The grounder checks only supplied context, not real systems or external truth.
- The current SRE fixtures are synthetic and author-written, not human-labeled calibration.
- Lockbox cases reduce leakage risk but do not establish production transfer.
- Existing policy checks remain seed heuristics and may still be phrase-matching brittle.
- Near-neighbor generation remains shallow; margin remains secondary.
- Provider-backed support scoring is not independently calibrated.
- Grounding can be high for a rationale that supports a different action; action coupling and alternative resistance still need future improvement.
- Attackers can copy context phrases into unsupported rationales; this plan adds a regression test but not robust entailment.
- Human labeling remains a separate high-value workstream and is not replaced by this deterministic improvement.

## Commit/PR Readiness Checklist

Before commit in the implementation session:

- [ ] Repo state inspected before edits.
- [ ] Plan read and followed, or deviations documented.
- [ ] Lockbox blindness discipline followed and attested.
- [ ] Every behavior change used RED-GREEN-REFACTOR.
- [ ] Targeted tests show red/green evidence.
- [ ] `npm test` passed.
- [ ] `npm run lint` passed.
- [ ] `npm run benchmark:sre` passed and generated output left ignored/uncommitted.
- [ ] Benchmark metrics reported split-aware, including lockbox gaps and shuffled grounding drop.
- [ ] `npm audit --omit=dev --json` passed or findings triaged.
- [ ] Opus 4.7 max-effort final review completed read-only.
- [ ] Valid blocking review feedback incorporated and verification rerun.
- [ ] Product docs preserve narrow framing and tribute/independent disclaimer.
- [ ] Git diff inspected.
- [ ] Explicit pathspecs staged only.
- [ ] `git diff --cached --check` passed.
- [ ] Commit created with a clear message.
- [ ] No push performed without explicit authorization.
