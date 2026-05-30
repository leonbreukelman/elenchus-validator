# Hermes Action Review Sidecar Implementation Plan

> **For Hermes:** Use disciplined-project-delivery, test-driven-development, and review gates to implement this plan. Use Claude Code Opus max for adversarial plan review before implementation and for final read-only review after implementation.

**Goal:** Build a local Hermes/Elenchus sidecar that reviews proposed agent actions from a bounded context and rationale, emits an advisory terminal review card, writes sanitized JSON reports, and demonstrates safe human-in-the-loop use for Hermes-style workflows.

**Architecture:** Implement a small TypeScript sidecar module inside `elenchus-validator` that wraps the existing v2 evaluator. The sidecar normalizes Hermes-style action-review inputs into `EvaluationRequestV2`, adds generic-agent near-neighbor alternatives, evaluates rationale-action/context-grounding signals, applies sidecar-specific advisory findings, sanitizes raw context/rationale/evidence out of persisted outputs, and renders a concise terminal card. The MVP is CLI-first, not an automatic Hermes hook; it can later be wired into Hermes pre-tool/plugin hooks.

**Tech Stack:** TypeScript ES modules, Node/tsx, Vitest, existing deterministic Elenchus evaluator. No new runtime dependency for the MVP.

---

## Non-negotiable product semantics

- Advisory only: the sidecar must never claim to approve, certify, prove, or authorize an action.
- Human/operator review remains required for all sidecar outputs.
- Output must explicitly state `canAutonomouslyExecute: false` or equivalent.
- Default report output must not persist raw user context, raw rationale text, raw tool arguments, raw recipients, raw DOM/email/file snippets, raw grounding anchors, or raw evidence excerpts.
- Logs/reports may persist only allowlisted metadata, hashes, action type, risk level, sanitized parameter keys, recommendation, numeric signals explicitly labeled uncalibrated, advisory findings, and sanitized anchor statuses.
- Persist a hash of `proposedAction.target`, never the raw target. Redact parameter keys that look value-like (contain `@`, `/`, `\`, `:`, whitespace, or exceed 48 characters) as `[redacted_key]`; never persist parameter values.
- Sidecar finding messages MUST be static template strings. Any interpolation is limited to action type, sanitized parameter key names, severity, hashes, or anchor ids — never values from `context`, `rationale`, `target`, or `parameters`.
- Generated demo output must be ignored/untracked if under `sidecar-output/`.
- No Hermes config mutation, gateway restart, real email/calendar/browser/file side effects, commits, pushes, or deploys are part of this MVP.
- Sidecar MUST call `evaluateRequestV2` without an `auditLogger`; the sidecar owns persistence under `sidecar-output/` and must not create `.elenchus-audit/` files.
- Reuse `safeAuditTraceId`, `redactSecrets`, and `sha256Hex` rather than reimplementing trace/path sanitization or secret redaction.

## Sanitized output schema (frozen field allowlist)

`report.json` may contain only this allowlisted shape. Tests must assert key-set equality for top-level objects and selected nested objects, not just substring absence.

```json
{
  "schemaVersion": "hermes-action-review-v0-alpha-2026-05-03",
  "traceId": "safe trace id",
  "traceIdHash": "sha256",
  "createdAt": "ISO-8601",
  "request": {
    "domain": "generic",
    "contextHash": "sha256",
    "rationaleHash": "sha256",
    "contextSectionCount": 0,
    "metadataKeys": [],
    "rawContentPersisted": false
  },
  "action": {
    "type": "normalized_action_type",
    "targetHash": "sha256 or null",
    "riskLevel": "low|medium|high|critical|null",
    "parameterKeys": ["sanitized_key"],
    "expectedEffectHash": "sha256 or null"
  },
  "evaluation": {
    "status": "complete|error|...",
    "recommendation": "proceed|...",
    "effectiveRecommendation": "proceed_with_caveats|...",
    "overallSignal": 0.0,
    "confidence": 0.0,
    "calibration": "uncalibrated_internal_alpha",
    "genericDomainSignalUnreliable": true
  },
  "support": {
    "originalSupport": 0.0,
    "strongestAlternativeSupport": 0.0,
    "specificityMargin": 0.0,
    "strongestAlternativeId": "alt-id or null",
    "marginReliability": "unreliable_internal_alpha or null"
  },
  "grounding": {
    "score": 0.0,
    "summary": { "present": 0, "absent": 0, "contradicted": 0, "loadBearing": 0 },
    "anchors": [{ "id": "anchor-id", "kind": "entity", "status": "present", "loadBearing": true, "weight": 0.0, "textHash": "sha256" }]
  },
  "advisory": {
    "decision": "ready_for_operator_review|revise_or_gather_context|escalate_to_operator|evaluation_error",
    "humanReviewRequired": true,
    "canAutonomouslyExecute": false,
    "findings": [{ "code": "static_code", "severity": "info|warning|blocker", "message": "static message" }],
    "reasons": ["static_reason"],
    "nextSteps": ["static_next_step"]
  },
  "readiness": {
    "operatorReviewRequired": true,
    "productionDecisionUse": "not_validated_for_allow_deny",
    "reviewNeeded": true,
    "reviewReasons": [],
    "blockedUses": []
  }
}
```

Forbidden from persisted `report.json`, `card.txt`, and CLI/demo stdout by default: raw `context`, raw `rationale`, raw `proposedAction.target`, raw parameter values, raw recipients, raw file/doc URLs, raw `toulmin` text, raw `grounding.anchors[*].text`, raw `normalizedText`, raw `contextEvidence`, raw `contradictionEvidence`, raw provider/parser `errors`, and any raw evidence excerpts.

## Acceptance criteria

1. `npm run review:action -- examples/sidecar/share-file-edit-mismatch.json` prints a terminal review card and writes sanitized `report.json` plus `card.txt` under `sidecar-output/action-review/...`.
2. `npm run demo:sidecar` runs five local examples:
   - grounded low/medium-risk action still requiring operator review,
   - workspace/share permission mismatch or unsupported high-risk action,
   - memory/code action where more context or revision is recommended,
   - destructive action requiring escalation,
   - email action missing recipients.
3. The sidecar output includes:
   - trace id,
   - action type,
   - risk level,
   - evaluation status,
   - Elenchus recommendation,
   - advisory decision,
   - top reasons,
   - next steps,
   - readiness semantics,
   - report path.
4. The sidecar output always includes advisory-only semantics:
   - `humanReviewRequired: true`,
   - `canAutonomouslyExecute: false`,
   - blocked uses inherited or echoed from Elenchus readiness.
5. Tests prove the sanitized `report.json` field set equals the frozen allowlist AND that none of the raw fixture context, rationale, target, parameter values, recipients, or evidence phrases appear in `report.json`, `card.txt`, or stdout from `npm run review:action` / `npm run demo:sidecar`.
6. Tests prove generic-agent alternatives are domain-appropriate for representative action types such as `send_email`, `share_file`, `code_edit`, `add_memory`, and `mark_task_complete`, while existing SRE alternatives remain bit-for-bit compatible.
7. Tests prove sidecar advisory findings catch at least:
   - high/critical sensitive actions requiring review,
   - edit/share permission not grounded in context/rationale,
   - missing email recipients for send/reply actions,
   - destructive/irreversible actions such as delete/trash/reset/force-push,
   - generic-domain signal unreliability,
   - non-complete evaluator reports as non-actionable advisory errors.
8. Sidecar advisory decision is never `ready_for_operator_review` solely from fallback grounding or generic-domain substring overlap. Generic-domain `proceed` is capped to `proceed_with_caveats` in sidecar summaries and carries `generic_domain_signal_unreliable`.
9. Verification passes:
   - focused sidecar/generic tests,
   - `npm test`,
   - `npm run lint`,
   - `npm audit --omit=dev --json` with exit code 0 and zero high/critical production vulnerabilities,
   - `npm run demo:sidecar`,
   - generated-output secret/raw-fixture scan over `sidecar-output/` recursively.
10. Final read-only review finds no blockers around advisory semantics, sanitization, CLI usability, TypeScript correctness, or Hermes integration risk.

---

## Files to create or modify

Create:
- `src/sidecar/types.ts`
- `src/sidecar/actionReview.ts`
- `src/sidecar/format.ts`
- `src/sidecar/runActionReview.ts`
- `src/sidecar/demoActionReview.ts`
- `test/sidecar/parse-input.test.ts`
- `test/sidecar/advisory-rules.test.ts`
- `test/sidecar/sanitization.test.ts`
- `test/sidecar/format-and-cli.test.ts`
- `test/sidecar/fixtures.test.ts`
- `test/evaluation/generic-alternatives.test.ts`
- `examples/sidecar/grounded-code-action.json`
- `examples/sidecar/share-file-edit-mismatch.json`
- `examples/sidecar/memory-grounding-gap.json`
- `examples/sidecar/delete-file-destructive.json`
- `examples/sidecar/send-email-missing-recipients.json`

Modify:
- `.gitignore` — ignore `sidecar-output/`.
- `package.json` — add `review:action` and `demo:sidecar` scripts.
- `src/evaluation/saboteur.ts` — add generic-agent near-neighbor alternatives for common Hermes action types.
- `README.md` — add concise sidecar usage and advisory semantics section.

Do not modify:
- Hermes global config.
- Google Workspace credentials/config.
- Remote branches/PRs unless explicitly requested later.

---

## Task 1: Generic-agent near-neighbor alternatives

**Objective:** Make generic action reviews meaningful beyond SRE by generating domain-appropriate alternatives for common Hermes action types.

**Files:**
- Modify: `src/evaluation/saboteur.ts`
- Test: `test/evaluation/generic-alternatives.test.ts`

**Step 1: Write failing tests**

Add tests that call `generateNearNeighborAlternatives` with `domain: "generic"` for representative action types, plus a regression that SRE `terminate_idle_sessions` still yields `["increase_iops", "restart_service", "page_human"]`:
- `share_file` should include alternatives like `share_view_only`, `ask_permission_confirmation`, or `do_not_share`.
- `send_email` should include `draft_only` or `ask_recipient_confirmation`.
- `code_edit` should include `run_verification`, `read_more_context`, or `add_test_first`.
- `add_memory` should include `save_as_hypothesis` or `do_not_add_memory`.
- `mark_task_complete` should include `run_verification` or `keep_task_open`.

Run:
`CI=1 npm test -- test/evaluation/generic-alternatives.test.ts --reporter=verbose`

Expected RED:
The test file or expected alternatives do not exist yet.

**Step 2: Implement generic alternatives**

Add a `GENERIC_NEIGHBORS` record in `src/evaluation/saboteur.ts`, keyed by normalized action type. Keep SRE behavior unchanged. For `domain: "generic"`, use `GENERIC_NEIGHBORS[originalType] ?? GENERIC_DEFAULT_NEIGHBORS`. The generic default must be generic (`request_human_review`, `narrow_scope`, `do_nothing`) rather than SRE-flavored (`page_human`, `restart_service`).

**Step 3: Verify GREEN**

Run:
`CI=1 npm test -- test/evaluation/generic-alternatives.test.ts --reporter=verbose`

Expected:
New generic-neighbor tests pass.

---

## Task 2: Sidecar input parsing, advisory findings, and sanitized report model

**Objective:** Add pure sidecar functions for parsing input, evaluating an action, producing advisory decisions, and sanitizing persisted output.

**Files:**
- Create: `src/sidecar/types.ts`
- Create: `src/sidecar/actionReview.ts`
- Tests: `test/sidecar/parse-input.test.ts`, `test/sidecar/advisory-rules.test.ts`, `test/sidecar/sanitization.test.ts`

**Step 1: Write failing tests**

Add tests for:
- `parseHermesActionReviewInput` accepts a valid string context and assigns a trace id if omitted.
- It accepts context sections like `{ label, text }[]` and normalizes them into a bounded context string.
- It rejects missing/empty `context`, missing/empty `rationale`, and missing/empty `proposedAction.type`.
- `reviewHermesAction` always returns `humanReviewRequired: true` and `canAutonomouslyExecute: false`, including when Elenchus recommendation is `proceed`.
- A `share_file` action with `permission: "edit"` but context/rationale lacking edit-permission support returns an advisory finding such as `share_permission_not_grounded`.
- `send_email`/`reply_email` with no recipients returns an advisory blocker finding.
- Sanitized report output does not contain raw fixture context, raw rationale, raw recipient email, or raw evidence phrases.

Run focused tests and verify RED.

**Step 2: Implement types**

Define in `src/sidecar/types.ts`:
- `ContextSection`
- `HermesActionReviewInput`
- `ParsedHermesActionReview`
- `SidecarFinding`
- `SidecarAdvisoryDecision`
- `HermesActionReviewResult`
- `SanitizedEvaluationSummary`

**Step 3: Implement parser and evaluator wrapper**

In `src/sidecar/actionReview.ts`:
- `parseHermesActionReviewInput(value: unknown): ParsedHermesActionReview`
- `reviewHermesAction(input: HermesActionReviewInput): Promise<HermesActionReviewResult>`
- `sanitizeEvaluationReport(request, report, findings): SanitizedEvaluationSummary`
- helper functions for hashing, parameter-key extraction, and context normalization.

Use `evaluateRequestV2` with the deterministic provider by default and without `auditLogger`. Build the evaluator request as:
- `domain: input.domainHint ?? "generic"`
- normalized context string
- proposed action
- rationale
- metadata that marks source as `hermes-action-review-sidecar`.

**Step 4: Implement sidecar advisory rules**

Initial deterministic rules:
- Always add `generic_domain_signal_unreliable` for generic-domain evaluations; cap generic-domain `proceed` to sidecar `effectiveRecommendation: "proceed_with_caveats"`.
- Any `riskLevel` high or critical: warning `sensitive_action_requires_operator_review`.
- Any action type containing `send_email` or `reply_email` with no non-empty `parameters.recipients`: blocker `missing_recipients`.
- `share_file` / `grant_file_access` / `share_drive_file` with edit/write/owner permission requires edit/write/owner support in context or rationale; otherwise warning `share_permission_not_grounded`.
- Destructive/irreversible operations: `delete_file`, `delete_drive_file`, `trash_file`, `permanent_delete_*` -> blocker `irreversible_destructive_action_requires_explicit_confirmation`; `force_push`, `git_reset_hard`, `delete_branch` -> warning `repo_history_irreversible_change`; `revoke_access`, `remove_collaborator`, `change_owner` -> warning `permission_change_high_blast_radius`; `delete_memory` / `overwrite_memory` -> warning `memory_overwrite_loses_history`.
- Optional external-email heuristic when trusted self-domains are supplied in metadata: outside-domain recipients get warning `external_recipient_requires_review`, but raw domains/recipients are not persisted.
- Non-complete evaluation reports become advisory decision `evaluation_error` with no numeric signal treated as action support.
- Contradicted/weak grounding, fallback/no-anchor grounding, low overall signal, or generic-domain-only substring support returns `revise_or_gather_context`.
- Blocker findings return `escalate_to_operator`.
- Return `ready_for_operator_review` only when there are no blockers and positive evidence exists: at least one present load-bearing anchor or contextGrounding >= 0.6 plus specificityMargin > 0.2. Never return it solely from fallback grounding or generic substring overlap.
- Finding messages are static templates; never interpolate raw user content or parameter values.

Always set literal types:
- `humanReviewRequired: true`
- `canAutonomouslyExecute: false`

The TypeScript type for `canAutonomouslyExecute` must be the literal `false`, and tests must re-assert it after JSON stringify/parse.

**Step 5: Verify GREEN**

Run:
`CI=1 npm test -- test/sidecar/action-review.test.ts --reporter=verbose`

---

## Task 3: Terminal card formatting and CLI runner

**Objective:** Provide a usable local CLI that reads input JSON, runs the sidecar, writes sanitized output, and prints a human-readable card.

**Files:**
- Create: `src/sidecar/format.ts`
- Create: `src/sidecar/runActionReview.ts`
- Modify: `package.json`
- Modify: `.gitignore`
- Tests: `test/sidecar/format-and-cli.test.ts`, `test/sidecar/sanitization.test.ts`

**Step 1: Write failing tests**

Add tests for:
- `renderActionReviewCard(result, { reportPath })` contains advisory-only copy, action type, decision, reasons, and `DO NOT AUTO-EXECUTE` or equivalent.
- `writeActionReviewArtifacts(result, outputDir)` writes `report.json` and `card.txt` with sanitized JSON.
- Trace id `../../etc/passwd` cannot escape the output directory.
- Custom `--out` applies identical sanitization.
- CLI exit codes match the documented advisory decision mapping.

Run focused tests and verify RED.

**Step 2: Implement formatting**

In `src/sidecar/format.ts`:
- `renderActionReviewCard(result, options?)`
- `writeActionReviewArtifacts(result, outputDir)`

Card content should be terminal-friendly plain text.

**Step 3: Implement CLI**

In `src/sidecar/runActionReview.ts`:
- Accept positional input path or `--input <path>`.
- Accept optional `--out <dir>`.
- Read JSON file.
- Sanitize caller trace ids with `safeAuditTraceId` before path joining.
- Parse/review/write artifacts.
- Print card plus report/card paths.
- Exit-code contract: `0` only for `ready_for_operator_review`, `2` for `revise_or_gather_context`, `3` for `escalate_to_operator`, `4` for `evaluation_error`, and `1` only for malformed input or runtime errors. README must warn that exit codes are advisory convenience signals, not approval to execute.

Add scripts:
- `"review:action": "node --import tsx src/sidecar/runActionReview.ts"`

Update `.gitignore` with:
- `sidecar-output/`

**Step 4: Verify CLI locally**

Run:
`npm run review:action -- examples/sidecar/share-file-edit-mismatch.json`

Expected:
Terminal card printed, sanitized artifacts written under ignored `sidecar-output/action-review/...`.

---

## Task 4: Demo fixtures and demo runner

**Objective:** Deliver a self-contained demonstration showing how the sidecar works in a Hermes-like agentic workflow.

**Files:**
- Create: `src/sidecar/demoActionReview.ts`
- Create: `examples/sidecar/grounded-code-action.json`
- Create: `examples/sidecar/share-file-edit-mismatch.json`
- Create: `examples/sidecar/memory-grounding-gap.json`
- Modify: `package.json`
- Modify: `README.md`
- Tests: `test/sidecar/fixtures.test.ts` plus existing parser/advisory/format coverage

**Step 1: Write failing test or fixture assertions**

Add tests that load all `examples/sidecar/*.json`, parse them, run `reviewHermesAction`, and assert each returns advisory-only semantics.

Run focused tests and verify RED until examples exist.

**Step 2: Create fixtures**

Create five safe, synthetic fixtures:
1. `grounded-code-action.json`
   - Proposed action: `code_edit` or `modify_file`.
   - Context includes failing test output and file path evidence.
   - Rationale supports adding a regression test or small edit.
   - Expected sidecar decision: `ready_for_operator_review` or `revise_or_gather_context` depending signal, but never autonomous execute.
2. `share-file-edit-mismatch.json`
   - Proposed action: `share_file` with edit permission.
   - Context supports view-only sharing but not edit rights.
   - Expected advisory finding: `share_permission_not_grounded`.
3. `memory-grounding-gap.json`
   - Proposed action: `add_memory`.
   - Candidate memory/rationale overstates source excerpt.
   - Expected review reasons around grounding/revision.
4. `delete-file-destructive.json`
   - Proposed action: `delete_file`.
   - Synthetic target that looks path-like; expected raw target hash only and blocker finding.
5. `send-email-missing-recipients.json`
   - Proposed action: `send_email`.
   - No recipients; expected blocker finding and no raw draft/context in outputs.

Use no real emails, credentials, private docs, customer names, or personal secrets.

**Step 3: Implement demo runner**

In `src/sidecar/demoActionReview.ts`:
- Load the three fixtures.
- Run each through `reviewHermesAction`.
- Write outputs under `sidecar-output/demo/<timestamp>/<case>/`.
- Print a compact multi-case summary with report paths.

Add script:
- `"demo:sidecar": "node --import tsx src/sidecar/demoActionReview.ts"`

**Step 4: Update README**

Add a concise `Hermes action-review sidecar` section:
- purpose,
- advisory-only warning,
- CLI examples,
- demo command,
- output sanitization contract,
- known limitations of the deterministic generic-domain stack,
- suggested future Hermes plugin/hook integration.

README copy MUST NOT use promotional/approval words such as "approve", "authorize", "certify", "safe to execute", or "verified" for sidecar outputs.

---

## Task 5: Full verification, safety scan, and final review

**Objective:** Prove the sidecar works and did not regress existing evaluation behavior.

**Files:** all changed files.

**Step 1: Focused tests**

Run:
`CI=1 npm test -- test/sidecar/action-review.test.ts --reporter=verbose`

Expected: pass.

**Step 2: Full test/lint/audit**

Run:
- `npm test`
- `npm run lint`
- `npm audit --omit=dev --json`

Expected: all exit `0`.

**Step 3: Demo**

Run:
- `npm run demo:sidecar`
- `npm run review:action -- examples/sidecar/share-file-edit-mismatch.json`

Expected:
Artifacts under `sidecar-output/`, terminal card includes advisory-only semantics.

**Step 4: Sanitization/secret scan**

Run a Python scan over generated `sidecar-output/` and changed files to assert:
- no secret-like strings,
- no raw synthetic fixture context phrase that tests sanitization should exclude from `report.json`,
- no real-looking API keys/tokens.

**Step 5: Final read-only review**

Run Claude Code Opus max read-only review over the diff and generated demo output. Ask for blockers in:
- advisory-only semantics,
- sanitization/privacy,
- TypeScript correctness,
- CLI UX,
- Hermes integration risk,
- tests and demo adequacy.

Fix blockers, rerun tests/review if needed.

---

## Demonstration script for final handoff

After implementation, final user demonstration should include:

```bash
cd /home/leonb/projects/elenchus-validator
npm run demo:sidecar
npm run review:action -- examples/sidecar/share-file-edit-mismatch.json
```

Expected user-visible behavior:
- A grounded action can be considered ready for operator review but still not auto-executable.
- A share-file edit-permission mismatch is flagged as unsupported by context.
- A memory/code action with weak grounding recommends revision or more context.
- Report paths are printed and contain sanitized metadata rather than raw context/rationale/evidence.

## Future follow-up after MVP

- Add a Hermes plugin/pre-tool hook wrapper that calls this CLI for selected high-risk tool classes.
- Add Google Workspace-specific input builders that assemble thread/file/calendar context locally without exposing secrets in logs.
- Add browser-submit context builders from DOM snapshots.
- Add CMMC evidence-mapping domain pack once the CMMC repo dirty tree is partitioned.
