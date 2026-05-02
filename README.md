# Elenchus Validator

Elenchus is an internal-alpha service for evaluating **rationale-action specificity** in agent workflows. It estimates whether a stated rationale specifically supports a proposed action over typed near-neighbor alternatives.

It is not a truth oracle, generic reasoning oracle, autonomous allow/deny gate, or hidden chain-of-thought faithfulness detector. Until human-labeled calibration exists, all v2 outputs are explicitly `uncalibrated_internal_alpha`.

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
know truth or inspect hidden cognition. It simply tests whether an explanation
is specific enough to constrain the action it is supposed to justify.

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
    "policyAlignment": 0.96
  },
  "support": {
    "originalSupport": 0.67,
    "strongestAlternativeSupport": 0.18,
    "specificityMargin": 0.49,
    "strongestAlternativeId": "alt-1-increase_iops",
    "notes": ["Deterministic local support score; no provider calibration claim."]
  },
  "productSemantics": "Uncalibrated internal-alpha rationale-action specificity signal..."
}
```

Incomplete/error evaluations return `status: "error" | "timeout" | "aborted"` with `overallSignal: null`; v2 never uses numeric zero as a fake failure score.

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

Useful environment variables:

- `ELENCHUS_API_TOKEN`: bearer token for `/api/v2/evaluate`, `/api/v1/intercept`, and MCP endpoints; required in production unless explicitly disabled with `ELENCHUS_ALLOW_UNAUTHENTICATED=true`
- `ELENCHUS_BODY_LIMIT`: JSON body size limit, default `256kb`
- `ELENCHUS_AUDIT_DIR`: file-backed audit directory, default `.elenchus-audit`
- `ELENCHUS_AUDIT_RETENTION_DAYS`: retention metadata default, default `14`
- `ELENCHUS_USE_GEMINI_V2=true`: opt into Gemini support scoring for v2
- `GEMINI_API_KEY` or `API_KEY`: provider credential when Gemini is enabled, and for legacy v1

Without provider credentials, v2 uses deterministic local evaluation and test doubles.

## Seed Benchmark

Run the seed smoke benchmark:

```bash
npm run benchmark:seed
```

This is a fixture smoke test only. It is not human-labeled calibration and must not be represented as production validation.

## Security And Operations

- `/api/v2/evaluate`, legacy `/api/v1/intercept`, and MCP endpoints use bearer auth when `ELENCHUS_API_TOKEN` is configured; production fails closed if auth is missing.
- `/api/v2/evaluate` has request validation, body size limit, structured status/error reports, and file-backed audit logging.
- Audit payloads redact common credential fields and store request digests/hashes rather than raw context/rationale by default.
- `/api/health` reports only provider key presence, not key prefixes, suffixes, or lengths.
- `npm audit --omit=dev --json` currently reports 0 production vulnerabilities after targeted audit fix.

## Limitations

- No human-labeled calibration exists yet.
- Deterministic local scores are heuristics for internal-alpha development.
- The Gemini adapter is behind a provider abstraction but should not be described as independent multi-model validation.
- SRE policies are seed defaults, not a substitute for real runbooks or production approval policies.
