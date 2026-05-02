# Elenchus Productization Project Brief

Date: 2026-05-01
Repo: /home/leonb/projects/elenchus-validator
Plan: docs/plans/2026-05-01-elenchus-productization-refactor.md

## Product Thesis

Elenchus should not be positioned as an oracle that verifies hidden LLM reasoning or objective truth. It should be positioned as a calibrated, adversarial signal that measures whether an agent's stated rationale specifically supports its proposed action over typed near-neighbor alternatives.

Preferred internal language:
- rationale-action specificity
- rationale-action coupling
- rationale specificity margin
- hard-to-vary signal, when carefully defined

Avoid overclaiming:
- generic reasoning quality oracle
- truth validator
- hidden chain-of-thought faithfulness detector
- autonomous allow/deny gate

## First Product Wedge

SRE / incident-response pre-execution rationale checks.

Why:
- actions are typed and machine-executable
- runbooks and policies can be represented symbolically
- feedback loops are short
- guardrails around AI-driven operations are valuable
- lower regulatory drag than medical/legal/finance

## Current Repo Baseline

Verified commands on 2026-05-01:
- `npm test`: passed, 3 passed, 2 skipped
- `npm run lint`: passed
- `npm audit --omit=dev --json`: reports critical/high production advisories requiring triage

Known current risks:
- v1 encodes errors/aborts as score-like values
- one Gemini preview model currently acts as both saboteur and judge
- API lacks auth/rate/body/budget controls
- MCP endpoints are not hardened
- health/logging leaks API-key shape
- no benchmark calibration exists yet

## Autonomous Execution Contract

Implementation should proceed milestone-by-milestone using the plan. Each behavior change must follow strict TDD:
1. Write failing test.
2. Verify failure for the expected reason.
3. Implement minimal code.
4. Verify targeted pass.
5. Run relevant regression checks.
6. Update progress artifact.

Interruption resilience:
- maintain `docs/plans/2026-05-01-elenchus-productization-progress.md`
- record current task, last green tests, files touched, open failures, next exact step
- classify unexpected dirty files before editing
- never commit/push/deploy without explicit user authorization

## What Is Needed From User For Full Production Delivery

Required before final production-ready claims:
1. Deployment target: local service, Docker/VPS, Cloudflare, Kubernetes, etc.
2. Auth preference if bearer-token default is not acceptable.
3. Approved LLM providers/models and budget ceilings for multi-model judging.
4. Real or representative SRE runbooks/action schemas/policies.
5. Human-labeled benchmark data or permission to create/label a seed calibration set.
6. First integration target: MÆI, MCP client, CI/CD, standalone API, etc.
7. Authorization policy for commits, pushes, and deployments.

Without human-labeled calibration, deliverable status should be called internal alpha / uncalibrated prototype signal, not production-validated reasoning score.
