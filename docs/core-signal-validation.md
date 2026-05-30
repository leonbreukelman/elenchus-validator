# Core Signal Validation

This phase narrows Elenchus back to one composable signal:

"How hard-to-vary and load-bearing is this rationale for the proposed action?"

The validation runner added here does not add a sidecar, routing layer, prompt system, or new scoring infrastructure. It wraps the current v2 evaluator and emits compact rows that can be compared against human labels.

## Run the validation experiment

Use anonymized SRE incident data only. The runner writes raw rationale-derived anchors and evidence snippets so humans can inspect the signal; do not point it at sensitive raw incidents unless they have already been anonymized.

Command:

```bash
node --import tsx src/evaluation/runSreSignalValidation.ts <cases.json> [output-dir]
```

Example smoke run:

```bash
node --import tsx src/evaluation/runSreSignalValidation.ts \
  benchmark/fixtures/sre/sre-signal-validation-sample.json \
  benchmark-output/sre-signal-validation/sample-run
```

Outputs:

- `result.json`: compact machine-readable signal output.
- `comparison.csv`: one row per case with human labels beside the system signal.
- stdout: small terminal table with id, human label, recommendation, margin, specificity, grounding, and failed-anchor count.

The included sample fixture is synthetic schema-smoke data. It proves the runner works; it is not validation evidence.

## Input schema

The input can be either a JSON array or an object with a `cases` array.

Minimal case:

```json
{
  "id": "incident-2026-001",
  "domain": "sre",
  "context": "Anonymized incident context.",
  "proposedAction": {
    "type": "rollback_deployment",
    "target": "checkout-api",
    "riskLevel": "high",
    "parameters": { "deployment": "2026.05.03.7" }
  },
  "rationale": "The rationale to evaluate.",
  "human_label": "strong_specific",
  "human_score": 0.9,
  "human_notes": ["Why the human labeled it this way."],
  "source": "anonymized_internal_sre",
  "split": "exploratory"
}
```

Accepted aliases:

- `proposed_action` or `proposedAction`
- `human_label`, `humanLabel`, or `label`
- `human_score` or `humanScore`
- `human_notes` or `humanNotes`

Recommended human labels:

- `strong_specific`
- `vague`
- `multi_action_support`
- `specific_but_unsupported`
- `grounded_action_mismatch`
- `policy_violation`
- `adversarial_polished_nonspecific`

## Minimal useful signal shape

Another framework should not need the full Elenchus report. The smallest useful optional dimension is this per-case object:

```json
{
  "id": "incident-2026-001",
  "status": "complete",
  "calibration": "uncalibrated_internal_alpha",
  "action_type": "rollback_deployment",
  "human_label": "strong_specific",
  "overall_signal": 0.74,
  "specificity_margin": 0.42,
  "rationale_specificity": 0.81,
  "subscores": {
    "rationale_specificity": 0.81,
    "action_coupling": 0.72,
    "alternative_resistance": 0.69,
    "policy_alignment": 0.96,
    "context_grounding": 0.78
  },
  "rationale_specificity_features": {
    "numeric_thresholds": 3,
    "causal_connectors": 2,
    "domain_terms": 4,
    "action_terms": 1,
    "evidence_markers": 2,
    "hedge_terms": 0
  },
  "load_bearing_anchors": [
    {
      "id": "anchor-1",
      "kind": "metric_state",
      "status": "present",
      "text": "p95 latency rose to 1800ms",
      "context_evidence": "Payments API p95 latency rose to 1800ms",
      "contradiction_evidence": null,
      "weight": 1.2,
      "notes": ["matched metric state"]
    }
  ],
  "grounding_summary": {
    "present": 2,
    "absent": 1,
    "contradicted": 0,
    "load_bearing": 3
  },
  "critique_notes": ["Strongest near-neighbor alternative remains somewhat supported."],
  "blocked_uses": ["production_allow_deny", "machine_actionable_consumption"]
}
```

Consumption guidance:

- Treat this as an explanation-quality dimension only.
- Do not treat `recommendation` or `overall_signal` as action correctness or safety.
- Inspect `specificity_margin` together with `rationale_specificity` and load-bearing anchor statuses. A detailed fabricated rationale can have high specificity and margin while grounding reveals absent or contradicted anchors.
- Preserve `calibration: uncalibrated_internal_alpha` until there is enough independently labeled data to justify stronger claims.

## Comparing against human labels

Use `comparison.csv` for first-pass review. Suggested workflow:

1. Start with 20-50 anonymized real SRE cases.
2. Include a balanced set of strong, vague, multi-action, unsupported-specific, and action-mismatch examples.
3. Ask humans to label explanation/action quality only, not whether the action was actually safe or correct.
4. Run the validation script.
5. Sort or pivot by `human_label` and inspect:
   - `specificity_margin`
   - `rationale_specificity`
   - `context_grounding`
   - `load_bearing_absent + load_bearing_contradicted`
   - `critique_notes`
6. Look for directional separation, not production thresholds.
7. Pay special attention to `specific_but_unsupported`: high margin plus contradicted/absent anchors is a useful diagnostic; high margin with no grounding warning is a fundamental problem.

## Current validation-readiness observation

Two non-real-data checks have been run:

1. The tiny synthetic smoke fixture produced the expected broad pattern:
   - strong-specific sample: high margin and high rationale specificity;
   - vague sample: low margin and low rationale specificity;
   - unsupported-specific sample: high margin/specificity but weak grounding and contradicted/absent load-bearing anchors.

2. Projecting the compact output over the existing 42-case synthetic SRE benchmark showed a more important warning:
   - `strong_specific` mean `specificity_margin`: 0.2233
   - `vague` mean `specificity_margin`: 0.3033
   - `specific_but_unsupported` mean `specificity_margin`: 0.3833
   - `policy_violation` mean `specificity_margin`: 0.4367
   - `strong_specific` mean `rationale_specificity`: 0.8467
   - `specific_but_unsupported` mean `context_grounding`: 0.2372

Interpretation: the current `specificity_margin` by itself is not a useful core signal. It anti-separates on the synthetic projection and over-rewards some weak/policy/unsupported cases. The broader compact vector is still worth one disciplined real-data validation pass because `rationale_specificity` and load-bearing anchor grounding expose useful diagnostics, especially for unsupported-specific cases. If real human-labeled data confirms the synthetic margin anti-separation, the next phase should fundamentally repair or replace the support/margin scorer rather than add sidecars, routes, prompts, or platform surface.

## Sidecar assessment and decision

Reviewed scope:

- `src/sidecar/`
- `examples/sidecar/`
- `test/sidecar/`
- `docs/plans/2026-05-03-hermes-action-review-sidecar-plan.md`
- sidecar-related README/package script changes

Assessment:

The sidecar work is coherent as a possible future integration surface, but it does not align with this phase's narrow goal. It adds a Hermes-specific product surface, CLI behavior, sanitized report schema, generic action rules, examples, and tests. Those are infrastructure and integration concerns, not evidence that the core explanation-quality signal works on real SRE rationales.

Decision for now:

- Pause all sidecar work.
- Do not merge sidecar paths into the core validation branch/mainline for this phase.
- If it is worth preserving, keep or move it to a separate sidecar branch for later review.
- Validation-only work should exclude these paths unless the explicit next mandate revives the sidecar:
  - `src/sidecar/`
  - `examples/sidecar/`
  - `test/sidecar/`
  - `docs/plans/2026-05-03-hermes-action-review-sidecar-plan.md`
  - package scripts `review:action` and `demo:sidecar`

Clear recommendation:

Continue only with real-data signal validation next. Do not build more platform surface until the compact signal rows demonstrate that humans find the signal useful and that it separates strong hard-to-vary rationales from weak, generic, unsupported, or action-mismatched rationales.
