# Elenchus Validator

Elenchus is an internal-alpha service for evaluating **rationale-action specificity** and related diagnostic signals in agent workflows. It estimates whether a stated rationale specifically supports a proposed action over typed near-neighbor alternatives, and whether load-bearing rationale anchors are grounded in the supplied context.

It is not a truth oracle, generic reasoning oracle, autonomous allow/deny gate, hidden chain-of-thought faithfulness detector, production safety system, or calibrated decision system. Until human-labeled calibration exists, all v2 outputs are explicitly `uncalibrated_internal_alpha`.

## In Tribute to David Deutsch

Elenchus Validator is named and built in the spirit of explanation.

This project is a tribute to David Deutsch and to *The Beginning of Infinity*,
a book whose central ideas continue to shape how I think about knowledge,
progress, error correction, and the difference between explanations that merely
sound plausible and explanations that actually constrain reality.

Deutsch describes good explanations as hard to vary: if you change the
explanation, it stops explaining the thing it was meant to explain.

Elenchus brings that question into LLM and agentic workflows:

> When an AI system gives a reason for an action, is that reason hard to vary?
> Or could it just as easily support a different action?

That is the heart of the validator. It is not an oracle. It does not claim to
know truth or inspect hidden cognition. It tests whether an explanation is
specific enough to constrain the action it is supposed to justify, and whether
its load-bearing claims are at least anchored in the supplied context.

The aspiration is modest but important: to help build AI systems that are more
criticizable, more accountable, and more committed to explanations that survive
attempted variation.

This project is independently created in admiration of David Deutsch's work and
is not affiliated with or endorsed by him.

## Current Product Wedge

The v2 internal-alpha path focuses on SRE / incident-response actions:

- terminate idle database sessions
- rollback deployment
- increase IOPS
- restart or scale service
- page a human/on-call owner

The service preserves the legacy v1 API while adding a status-safe v2 API.

## APIs

### `POST /api/v2/evaluate`

Optional auth: set `ELENCHUS_API_TOKEN`; callers must send `Authorization: Bearer <token>`.

Request:

```json
{
  "traceId": "sre-monitor-001",
  "domain": "sre",
  "context": "Postgres primary has 95% I/O wait. pg_stat_activity shows 12 idle in transaction sessions older than 30 minutes holding locks on audit_logs. VACUUM is blocked.",
  "proposedAction": {
    "type": "terminate_idle_sessions",
    "target": "postgres-primary",
    "parameters": { "maxIdleAgeMinutes": 30, "relation": "audit_logs" },
    "riskLevel": "medium"
  },
  "rationale": "Because 12 idle in transaction sessions older than 30 minutes are holding locks on audit_logs and blocking VACUUM, table bloat is driving the I/O spike. Terminating sessions older than 30 minutes releases the locks and addresses the specific cause rather than only adding capacity."
}
```

Response shape:

```json
{
  "traceId": "sre-monitor-001",
  "status": "complete",
  "recommendation": "proceed",
  "calibration": "uncalibrated_internal_alpha",
  "overallSignal": 0.82,
  "subscores": {
    "rationaleSpecificity": 0.88,
    "actionCoupling": 0.71,
    "alternativeResistance": 0.64,
    "policyAlignment": 0.96,
    "contextGrounding": 0.74
  },
  "grounding": {
    "score": 0.74,
    "summary": { "present": 4, "absent": 0, "contradicted": 0, "loadBearing": 4 },
    "anchors": [
      {
        "id": "anchor-1",
        "kind": "metric_state",
        "status": "present",
        "weight": 1.2,
        "loadBearing": true
      }
    ],
    "notes": ["Deterministic context-grounding proxy over supplied context only; not objective truth validation."]
  },
  "support": {
    "originalSupport": 0.67,
    "strongestAlternativeSupport": 0.18,
    "specificityMargin": 0.49,
    "strongestAlternativeId": "alt-1-increase_iops",
    "notes": ["Deterministic local support score; no provider calibration claim."],
    "marginReliability": {
      "state": "unreliable_internal_alpha",
      "reason": "benchmark_antiseparation",
      "message": "specificityMargin is an uncalibrated internal-alpha diagnostic and is currently not reliable as production evidence."
    }
  },
  "readiness": {
    "operatingMode": "internal_alpha_advisory",
    "productionDecisionUse": "not_validated_for_allow_deny",
    "operatorReviewRequired": true,
    "reviewNeeded": false,
    "reviewReasons": ["uncalibrated_internal_alpha", "specificity_margin_unreliable"],
    "blockedUses": [
      "production_allow_deny",
      "machine_actionable_consumption",
      "hidden_chain_of_thought_faithfulness",
      "objective_truth_validation"
    ]
  },
  "productSemantics": "Uncalibrated internal-alpha rationale-action specificity signal with deterministic context-grounding proxy..."
}
```

`contextGrounding` is a deterministic evidence-alignment proxy. The evaluator extracts load-bearing rationale anchors, classifies them as present, absent, or contradicted in the supplied context, and keeps `support.specificityMargin` available as a backward-compatible diagnostic. The `readiness` field is intentionally advisory: `operatorReviewRequired` is true for current v2 reports and `productionDecisionUse` is `not_validated_for_allow_deny`. The margin diagnostic is explicitly unreliable/experimental until rebuilt and calibrated against human labels. Elenchus does not prove the rationale is true, discover hidden model reasoning, or certify that the action is safe. Unsupported or contradicted specific rationales should lower confidence and prevent a plain `proceed` recommendation, but operators still need their own review, runbooks, and production approval policies.

The v2 audit path records only safe grounding metadata such as score, summary counts, anchor ids, kinds, statuses, weights, and load-bearing flags. It must not log raw context, raw rationale, raw anchor text, `contextEvidence`, or `contradictionEvidence`.

Incomplete/error evaluations return `status: "error" | "timeout" | "aborted"` with `overallSignal: null`, `subscores: null`, `support: null`, `grounding: null`, and `confidence: null`; v2 never uses numeric zero as a fake failure score.

### `POST /api/v1/intercept`

The v1 compatibility endpoint is preserved:

```json
{
  "traceId": "legacy-001",
  "context": "System context",
  "proposedAction": { "type": "BUY" },
  "reasoning": "Legacy rationale"
}
```

It returns the existing `{ "score": number, "terminalLog": string[] }` shape.

## Local Operation

Install dependencies and run checks:

```bash
npm test
npm run lint
```

Start the service:

```bash
npm run dev
```

## Hermes Action-Review Sidecar

The sidecar is a local CLI wrapper for Hermes-style agent workflows. It reviews a proposed action, bounded context, and public rationale, then prints a terminal review card and writes sanitized artifacts under `sidecar-output/`.

It is review-only. It does not perform the action, mutate Hermes config, send messages, share files, run browser submissions, change repos, or write durable memory. Every result keeps:

- `humanReviewRequired: true`
- `canAutonomouslyExecute: false`
- `productionDecisionUse: not_validated_for_allow_deny`

Run the multi-case local demo:

```bash
npm run demo:sidecar
```

Review a single fixture:

```bash
npm run review:action -- examples/sidecar/share-file-edit-mismatch.json
```

The CLI writes `report.json` and `card.txt`. By default those artifacts use a frozen sanitized schema: action type, risk level, hashes, sanitized parameter keys, advisory finding codes, numeric internal-alpha signals, and readiness metadata. They do not persist raw context, raw rationale, raw target, raw parameter values, raw recipients, raw anchor text, or raw evidence excerpts.

Advisory exit codes are convenience signals for shell demos, not permission for an agent to act:

- `0`: ready for operator review
- `2`: revise or gather more context
- `3`: escalate to operator
- `4`: evaluation error
- `1`: malformed input or runtime failure

Known generic-domain limitation: the deterministic grounding and support stack was originally built around SRE evidence patterns. Generic Hermes actions therefore carry `generic_domain_signal_unreliable`, and a generic-domain `proceed` recommendation is capped in the sidecar summary to `proceed_with_caveats`.

Future integration can call this CLI from a Hermes pre-tool hook for selected high-risk tool classes, but the MVP intentionally stays local and side-effect-free.

Useful environment variables:

- `ELENCHUS_API_TOKEN`: bearer token for `/api/v2/evaluate`, `/api/v1/intercept`, and MCP endpoints; required in production unless explicitly disabled with `ELENCHUS_ALLOW_UNAUTHENTICATED=true`
- `ELENCHUS_BODY_LIMIT`: JSON body size limit, default `256kb`
- `ELENCHUS_AUDIT_DIR`: file-backed audit directory, default `.elenchus-audit`
- `ELENCHUS_AUDIT_RETENTION_DAYS`: retention metadata default, default `14`
- `ELENCHUS_LLM_PROVIDER`: optional v2 support scorer (`deterministic`, `claude`, `grok`, or `gemini`); when unset, v2 auto-selects the first configured provider key in that order and otherwise falls back to deterministic local scoring
- `ELENCHUS_PREFERRED_MODEL`: optional model override; model family must match the selected provider when both are supplied
- `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`: Claude provider credential and optional model
- `XAI_API_KEY` / `XAI_MODEL`: Grok provider credential and optional model
- `GEMINI_API_KEY` or `API_KEY` / `GEMINI_MODEL`: Gemini provider credential and optional model; `API_KEY` is also used by legacy v1

Without provider credentials or an explicit provider override, v2 uses deterministic local evaluation. Invalid provider configuration returns a structured v2 error report with no numeric signal.

## Seed Benchmark

Run the SRE internal-alpha benchmark:

```bash
npm run benchmark:sre
```

This is a synthetic fixture benchmark and smoke/regression harness. Its JSON and Markdown summaries expose overall signal, `contextGrounding`, split-aware metrics, diagnostic grounding failures, shuffled-rationale grounding drops, confidence-interval/governance metadata, recommendation confusion matrices, review-needed/operator-review rates, failure taxonomies, evaluator fingerprints, and fixture SHA-256 hashes. It is not human-labeled calibration, not production validation, and not evidence that an action is safe without operator review.

## Security And Operations

- `/api/v2/evaluate`, legacy `/api/v1/intercept`, and MCP endpoints use bearer auth when `ELENCHUS_API_TOKEN` is configured; production fails closed if auth is missing.
- `/api/v2/evaluate` has request validation, body size limit, structured status/error reports, and file-backed audit logging.
- Audit payloads redact common credential fields and store request digests/hashes rather than raw context/rationale by default.
- Grounding audit payloads store safe anchor metadata only; they do not log raw context, raw rationale, raw anchor text, `contextEvidence`, or `contradictionEvidence`.
- `/api/health` reports only provider key presence, not key prefixes, suffixes, or lengths.
- `npm audit --omit=dev --json` currently reports 0 production vulnerabilities after targeted audit fix.

## Limitations

- No human-labeled calibration exists yet.
- Deterministic local scores and `contextGrounding` are heuristics for internal-alpha development.
- Context grounding is a non-causal, non-authoritative evidence-alignment proxy; it cannot prove truth, detect hidden reasoning faithfulness, or replace operator review.
- `readiness` and `reviewNeeded` are advisory hygiene fields, not calibrated production abstention or approval controls.
- `support.specificityMargin` is retained for diagnostics but is currently unreliable as production evidence.
- The Gemini adapter is behind a provider abstraction but should not be described as independent multi-model validation.
- SRE policies are seed defaults, not a substitute for real runbooks or production approval policies.
