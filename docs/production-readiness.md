# Production Readiness Notes

Status: internal alpha, uncalibrated.

## Product Semantics

Elenchus v2 reports a rationale-action specificity signal: whether the stated rationale supports the proposed action more specifically than typed near-neighbor alternatives. It does not verify objective truth, hidden model cognition, or chain-of-thought faithfulness.

## Implemented Controls

- Versioned `/api/v2/evaluate` route with `status`, `recommendation`, `calibration`, subscores, support margin, policy findings, provider metadata, and audit reference.
- Bearer auth through `ELENCHUS_API_TOKEN`; production fails closed when the token is not configured unless `ELENCHUS_ALLOW_UNAUTHENTICATED=true` is deliberately set.
- JSON body limit through `ELENCHUS_BODY_LIMIT`, default `256kb`.
- Deterministic local provider for development and tests when external credentials are unavailable.
- Gemini support scorer adapter behind an explicit provider interface and `ELENCHUS_USE_GEMINI_V2=true`.
- File-backed audit logging with credential redaction, trace-id filename sanitization, 0600 file mode, request digests/hashes instead of raw context/rationale, and retention metadata.
- Health endpoint no longer discloses key shape.
- SRE policy overlay for terminate idle sessions, rollback deployment, increase IOPS/restart/scale-style actions, and human escalation.

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

- V2 scores are uncalibrated heuristics.
- Seed benchmark fixtures are smoke tests only.
- SRE domain policies are defaults and may not match local operational policy.
- V1 remains available for compatibility and still returns legacy score-like error semantics, but it is covered by the same bearer-auth middleware as v2/MCP.
