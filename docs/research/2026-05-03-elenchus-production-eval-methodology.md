# Elenchus Production Evaluation Methodology Research

Date: 2026-05-03
Repository baseline: `/home/leonb/projects/elenchus-validator`, branch `main`, HEAD `9e24f13`.
Status: research note for an internal-alpha remediation plan. This note does not authorize production gating.

## Scope

This research note supports the next Elenchus production-readiness remediation for context-grounding and benchmark-validity gaps. The target product claim remains narrow:

> Elenchus estimates rationale-action specificity and related internal-alpha signals. `contextGrounding` is a deterministic evidence-alignment proxy over supplied context only. It is non-causal and non-authoritative; it cannot prove objective truth, hidden chain-of-thought faithfulness, operational correctness, or production allow/deny safety.

## Sources consulted

External web/research access was available through arXiv/public-page probes from this environment. Semantic Scholar search was attempted but returned HTTP 429, so this note relies on arXiv metadata/abstracts, direct public pages, repo references, and established evaluation practice.

1. Gu et al., "A Survey on LLM-as-a-Judge" (arXiv:2411.15594). Consulted for judge-task taxonomy, consistency/bias risks, and evaluation-design cautions.
2. Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena" (arXiv:2306.05685). Consulted for pairwise/open-ended judge practice and known judge bias/reliability concerns.
3. Liu et al., "G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment" (arXiv:2303.16634). Consulted for rubric/form-based LLM evaluation patterns and the need to benchmark against human judgments.
4. Es et al., "Ragas: Automated Evaluation of Retrieval Augmented Generation" (arXiv:2309.15217). Consulted for reference-free RAG metrics such as faithfulness/context relevance and their limits.
5. Saad-Falcon et al., "ARES: An Automated Evaluation Framework for Retrieval-Augmented Generation Systems" (arXiv:2311.09476). Consulted for RAG evaluation dimensions and synthetic/judge-assisted evaluation cautions.
6. Min et al., "FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation" (arXiv:2305.14251). Consulted for atomic claim decomposition and evidence-supported/unsupported classification.
7. Thorne et al., "FEVER: a large-scale dataset for Fact Extraction and VERification" (arXiv:1803.05355) plus FEVER shared-task metadata (arXiv:1811.10971). Consulted for claim-evidence verification with support/refute/not-enough-information labels.
8. Laban et al., "SummaC: Re-Visiting NLI-based Models for Inconsistency Detection in Summarization" (arXiv:2111.09525). Consulted for NLI-style source-consistency checks and failure modes.
9. DeYoung et al., "ERASER: A Benchmark to Evaluate Rationalized NLP Models" (arXiv:1911.03429). Consulted for evidence/rationale attribution and rationale evaluation.
10. Ribeiro et al., "Beyond Accuracy: Behavioral Testing of NLP models with CheckList" (arXiv:2005.04118). Consulted for capability-specific, behavior-driven tests rather than relying on aggregate accuracy alone.
11. Guo et al., "On Calibration of Modern Neural Networks" (arXiv:1706.04599). Consulted for reliability diagrams/ECE and post-hoc calibration framing.
12. Geifman and El-Yaniv, "Selective Classification for Deep Neural Networks" (arXiv:1705.08500). Consulted for abstention/risk-coverage concepts.
13. Angelopoulos and Bates, "A Gentle Introduction to Conformal Prediction and Distribution-Free Uncertainty Quantification" (arXiv:2107.07511). Consulted for prediction-set/coverage ideas and limits when data assumptions are unmet.
14. Turpin et al., "Language Models Don't Always Say What They Think: Unfaithful Explanations in Chain-of-Thought Prompting" (arXiv:2305.04388). Consulted for why stated rationales/CoT cannot be treated as faithful hidden cognition.
15. Lanham et al., "Measuring Faithfulness in Chain-of-Thought Reasoning" (arXiv:2307.13702). Consulted for faithfulness measurement caveats and the distinction between causal process and post-hoc explanation.
16. NIST AI Risk Management Framework public page. Consulted for governance, mapping/measuring/managing risk, monitoring, and risk communication.
17. OWASP Top 10 for Large Language Model Applications public page. Consulted for prompt injection, sensitive-information disclosure, and operational security framing.
18. Repo references loaded from `disciplined-project-delivery`: context-grounding validator lessons, rationale-action specificity benchmarking, Elenchus productization notes, adversarial product signal review, and public philosophical product positioning.

## Methodology summary

The research points to a layered evaluation architecture rather than another single heuristic score:

1. Decompose the rationale into checkable anchors/claims.
   - FActScore/FEVER-style methods treat long claims as atomic pieces that can be supported, refuted, or not found.
   - For Elenchus, the current deterministic anchors (`numeric`, `entity`, `metric_state`, `mechanism`) are a reasonable internal-alpha proxy, but they are not enough for production truth claims.

2. Require evidence attribution against supplied context.
   - RAGAS/ARES and attribution literature separate answer quality from retrieval/evidence support.
   - Elenchus should continue to say "supplied-context evidence alignment," not "truth" or "hallucination detection" without qualification.

3. Separate rationale-action coupling from context grounding.
   - A rationale may be grounded but support a different action. `contextGrounding` must not be used as action optimality.
   - `specificityMargin` remains an alternative-resistance diagnostic, but current metrics show it is not yet valid as a production margin.

4. Add uncertainty, abstention/review-needed, and reliability reporting.
   - Calibration literature says score bands require empirical calibration against held-out labels.
   - Selective prediction suggests production systems need explicit abstention/review channels when uncertainty/evidence is weak.
   - With only 42 synthetic cases, Elenchus can report confidence intervals and review-needed rates, but cannot claim production calibration.

5. Use split discipline and adversarial controls.
   - Exploratory cases may drive tests and root-cause fixes; lockbox cases should only falsify claims.
   - Shuffled rationale controls, per-label/split confusion, and worst-disagreement summaries are useful, but raw lockbox prose must remain blind during rule design.

6. Use LLM-as-judge only as a calibrated, versioned, auditable component after labels exist.
   - MT-Bench/G-Eval/LLM-as-judge work supports rubric or pairwise judging, but only with human-alignment evidence, bias controls, pinned models, repeatability checks, and prompt-injection defenses.
   - A runtime judge is not justified for this iteration because no human-labeled calibration/validation set exists.

7. Treat hidden chain-of-thought faithfulness as out of scope.
   - Turpin/Lanham-style work shows generated explanations can be post-hoc or unfaithful. Elenchus evaluates the supplied rationale as an artifact, not hidden cognition.

## Applicable approaches for the next remediation

Applicable now:

- General deterministic bug fixes that are synthetic-testable before any new benchmark run, especially family-local metric-state polarity/evidence extraction. Prior Opus review flagged clause-level polarity as a latent source of false contradictions; fixing it is a general methodology correction, not lockbox tuning.
- Advisory-mode output that makes operator review explicit and blocks consumers from treating `recommendation` as a production allow/deny verdict.
- Benchmark instrumentation: confidence intervals for rates/means, per-label and split confusion, review-needed/abstention rates, threshold-governance output, and failure taxonomy counts.
- Documentation that reframes `specificityMargin` as an exploratory diagnostic until rebuilt on calibrated contrastive evidence.
- Audit privacy checks that keep raw context/rationale/anchors/evidence out of logs and benchmark summaries.

Applicable later, after new data/process exists:

- Calibrated LLM/NLI judge path for claim-evidence alignment, with pinned model/version, prompt-injection defenses, repeated judgments, human-labeled calibration, and abstention thresholds.
- Span attribution with explicit evidence offsets/hashes so reviewers can audit evidence without storing raw sensitive prose.
- Human-labeled calibration corpus with train/validation/test/lockbox splits, inter-annotator agreement, and documented threshold governance.
- Domain-specific policy/rule engines for SRE runbook constraints, separated from rationale support.

## Rejected approaches and why

- Do not lower failing thresholds to claim success. This would hide validity gaps and violate prior plans.
- Do not add fixture- or lockbox-shaped regexes, synonyms, weights, recommendation floors, or prompt text after seeing lockbox metrics.
- Do not inspect raw lockbox context/rationale prose to diagnose the current failures.
- Do not replace deterministic grounding with an uncalibrated runtime LLM judge in this iteration. LLM-as-judge methods are promising but need calibration, reliability, and security work first.
- Do not convert `recommendation` into a production allow/deny gate. Current evidence is synthetic and uncalibrated.
- Do not claim hidden chain-of-thought faithfulness or objective truth validation.
- Do not store raw rationale/context/evidence in audit logs or generated benchmark artifacts intended for review.

## Current benchmark validity state, based only on aggregate/split/label metrics

Latest parsed output: `benchmark-output/sre/2026-05-03T18-58-08-837Z/result.json`.

Passing directional checks include zero weak false-proceed rate, zero specific-but-unsupported `proceed`, strong/weak grounding separation `0.2152 >= 0.10`, shuffled context-grounding drop `0.2083 >= 0.20`, lockbox rank agreement `0.5882 >= 0.55`, and overall rank agreement `0.8308`.

Remaining failures are material:

- `falseReconsiderRateStrong = 0.3333 > 0.17`.
- `exploratoryFalseReconsiderRateStrong = 0.4 > 0.17`.
- `exploratoryDiagnosticStrongGroundingGap = 0.1716 < 0.20`.
- `lockboxUnsupportedGroundingLeakageWarning = 0.0681 > 0.05`.
- `strongWeakMarginSeparation = -0.0711 < 0.10`.

These failures support an internal-alpha/advisory interpretation only. They do not support production gating.

## Recommended production-readiness architecture

### Current iteration: internal-alpha advisory hardening

- Keep deterministic `contextGrounding`, but fix only pre-benchmark, synthetic-testable general bugs.
- Add `advisory`/`readiness` metadata to v2 reports:
  - explicit operating mode: internal-alpha advisory only;
  - production decision use: not valid;
  - operator review required;
  - review-needed/reasons based on calibration, low confidence, weak grounding, contradictions, policy findings, and unreliable margin state;
  - no allow/deny guarantee.
- Add benchmark uncertainty and governance metrics:
  - Wilson intervals for rates;
  - bootstrap or normal intervals for means where appropriate;
  - per-label and split-specific confusion matrices;
  - review-needed/abstention rate by label and split;
  - failure taxonomy counts;
  - threshold checks with point estimate and interval context.
- Update docs/ADR to state that current outputs may inform review queues and regression testing, not autonomous production decisions.

### Future production advisory candidate

- Create an independently labeled calibration set with clear annotation instructions and inter-annotator agreement.
- Freeze train/validation/test/lockbox splits before evaluator changes.
- Calibrate thresholds and reliability curves per domain/action family.
- Add an optional calibrated judge/NLI/span-attribution path with pinned version metadata and repeated-judge variance.
- Maintain audit hashes/evidence IDs rather than raw sensitive prose.
- Monitor distribution drift, review-needed rates, score distributions, disagreement rates, latency, failures, and security events.

### Production gate is not supported yet

A production allow/deny gate would require evidence not present here: independently labeled outcomes, calibrated error rates, reliable abstention, domain policy proof, operational rollback/monitoring, adversarial robustness, and governance for threshold changes. Until then, Elenchus should remain internal-alpha or, after more validation, production-advisory-only.

## How this methodology avoids oracle/truth-validator claims

- It names the evaluated artifact: the supplied rationale text and proposed action.
- It constrains grounding to supplied context; it does not assert the context is true.
- It keeps action correctness and operational optimality separate from evidence alignment.
- It makes uncertainty and review-required status first-class instead of hiding uncertainty behind a numeric score.
- It explicitly rejects hidden chain-of-thought faithfulness claims.

## How this methodology avoids lockbox overfitting

- The plan must be written before production code changes.
- Raw lockbox context/rationale prose remains unread.
- Only aggregate/split/label metrics may be used from existing benchmark outputs.
- Rule changes must be justified by synthetic unit tests and prior review, not by observed lockbox failures.
- Post-implementation lockbox failures trigger documentation/off-ramp or a new reviewed plan, not same-session regex/threshold tuning.

## Recommended next implementation

Proceed with a hybrid internal-alpha remediation:

1. Fix family-local metric-state polarity/evidence extraction with fresh synthetic tests.
2. Add v2 advisory/readiness metadata and review-needed reasons.
3. Add benchmark confidence intervals, confusion matrices, review-needed rates, and threshold-governance output.
4. Reframe `specificityMargin` as an exploratory diagnostic and document production blockers.
5. Run the benchmark once after rules/tests/constants freeze; do not tune after observing lockbox/split results.

If the remaining benchmark gates still fail, treat that as a documented internal-alpha off-ramp rather than weakening thresholds or tuning to the lockbox.
