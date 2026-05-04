# Production Readiness Notes

Status: internal alpha, uncalibrated.

## Product Semantics

Elenchus v2 reports a rationale-action specificity signal: whether the stated rationale supports the proposed action more specifically than typed near-neighbor alternatives. It also reports `contextGrounding`, a deterministic evidence-alignment proxy that checks whether load-bearing rationale anchors are present, absent, or contradicted in the supplied context. It does not verify objective truth, hidden model cognition, or chain-of-thought faithfulness, and it is not a production allow/deny gate.

## Implemented Controls

- Versioned `/api/v2/evaluate` route with `status`, advisory `recommendation`, `calibration`, subscores, `contextGrounding`, support margin, grounding assessment, policy findings, provider metadata, audit reference, and explicit `readiness` metadata.
- Bearer auth through `ELENCHUS_API_TOKEN`; production fails closed when the token is not configured unless `ELENCHUS_ALLOW_UNAUTHENTICATED=true` is deliberately set.
- JSON body limit through `ELENCHUS_BODY_LIMIT`, default `256kb`.
- Deterministic local provider for development and tests when external credentials are unavailable.
- Gemini support scorer adapter behind an explicit provider interface and `ELENCHUS_USE_GEMINI_V2=true`.
- File-backed audit logging with credential redaction, trace-id filename sanitization, 0600 file mode, request digests/hashes instead of raw context/rationale, retention metadata, and safe grounding summaries that omit raw anchor text, `contextEvidence`, and `contradictionEvidence`.
- Health endpoint no longer discloses key shape.
- SRE policy overlay for terminate idle sessions, rollback deployment, increase IOPS/restart/scale-style actions, and human escalation.
- V2 readiness/advisory contract: current reports set `operatingMode: internal_alpha_advisory`, `productionDecisionUse: not_validated_for_allow_deny`, and `operatorReviewRequired: true`; `reviewNeeded` and reason codes are structured advisory hygiene, not calibrated production abstention.
- Support-margin reliability metadata keeps `support.specificityMargin` backward compatible while marking it unreliable as production evidence until contrastive/human-labeled calibration work exists.
- SRE benchmark governance output now includes evaluator/version fingerprints, fixture hashes, Wilson/bootstrap-style uncertainty summaries, recommendation confusion matrices, review-needed/operator-review rates, failure taxonomies, and threshold-governance metadata without exposing raw fixture prose.

## Dependency Audit

Command:

```bash
npm audit --omit=dev --json
```

Current result after `npm audit fix --omit=dev`: 0 production vulnerabilities. This updated `package-lock.json`; rerun the audit before any public deployment.

## Deployment Notes

The service is locally runnable with `npm run dev`. A production deployment should provide:

- TLS termination and trusted reverse proxy configuration.
- `ELENCHUS_API_TOKEN` or a stronger organization auth layer; do not deploy public production with unauthenticated mode enabled.
- Provider credentials only through a secret manager.
- Persistent audit volume or central log sink with retention enforcement.
- Rate limiting and budget enforcement at the edge or API gateway.
- Real SRE runbooks and human-labeled calibration fixtures before product claims.

## Remaining Risks

- V2 scores and grounding metrics are uncalibrated heuristics.
- Context grounding is non-causal and non-authoritative; it cannot prove operational correctness or replace operator review.
- Seed benchmark fixtures are smoke tests only.
- `readiness.reviewNeeded` is not a calibrated selective-prediction guarantee; it is an internal-alpha review queue signal.
- `support.specificityMargin` remains an exploratory diagnostic and should not be used as production gating evidence.
- SRE domain policies are defaults and may not match local operational policy.
- V1 remains available for compatibility and still returns legacy score-like error semantics, but it is covered by the same bearer-auth middleware as v2/MCP.

## 2026-05-03 Context-Grounding Remediation Off-Ramp

The context-grounding remediation improved aggregate benchmark behavior but did not satisfy every saved-plan acceptance gate. Latest aggregate/split benchmark run (`npm run benchmark:sre`, 42 complete cases) produced:

- Mean overall signal: 0.5962.
- Mean context grounding: 0.5102.
- Strong/weak overall separation: 0.1541.
- Strong/weak grounding separation: 0.2152.
- Weak false-proceed rate: 0.
- Permissive weak rate: 0.3333.
- Strong false-reconsider rate: 0.3333, above the saved-plan gate `<= 0.17`.
- Exploratory strong false-reconsider rate: 0.4, above the saved-plan gate `<= 0.17`.
- Exploratory diagnostic-vs-strong grounding gap: 0.1716, below the saved-plan gate `>= 0.20`.
- Lockbox unsupported-grounding leakage warning: 0.0681 above exploratory unsupported mean grounding, above the saved-plan warning threshold `<= 0.05`.
- Strong/weak specificity-margin separation remains -0.0711; this is a pre-existing deferred margin diagnostic, not evidence of production calibration.

Split-aware notes from the same run:

- Exploratory split: 32 cases, mean overall signal 0.6028, mean context grounding 0.5233, rank agreement 0.8571, zero `specific_but_unsupported` proceed recommendations.
- Lockbox split: 10 cases, mean overall signal 0.5752, mean context grounding 0.4683, rank agreement 0.5882, zero `specific_but_unsupported` proceed recommendations.

Per the saved lockbox discipline, these failures should not be tuned away by editing grounding synonyms, regex weights, recommendation floors, benchmark thresholds, or lockbox fixture text after observing lockbox aggregate/split metrics. Synthetic tests authored with label-category knowledge can still partially converge with lockbox idioms, so benchmark gains remain smoke/regression evidence rather than validity proof. Further remediation requires a new reviewed plan, likely involving span-/family-aware polarity extraction, provider-judge design, or human-labeled calibration rather than additional post-hoc deterministic tuning.

Current benchmark governance intentionally avoids automatic lockbox attestation. A run may record an operator-supplied lockbox-process attestation only when that process was explicitly supplied and verified for that run; otherwise generated output records `attestationSource: "not_recorded"` and treats lockbox split metrics as advisory governance signals, not certified held-out validation or autonomous approval. Generated benchmark output remains ignored and must not be committed.
