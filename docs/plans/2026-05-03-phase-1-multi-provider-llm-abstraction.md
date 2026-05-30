# Phase 1 Multi-Provider LLM Abstraction Implementation Plan

> **For Hermes:** Use subagent-driven-development skill for later broad slices if this expands beyond the initial provider foundation; implement each behavior slice with TDD.

**Goal:** Make Claude and Grok first-class evaluation providers, keep Gemini optional, and preserve deterministic fallback when no provider keys are configured.

**Architecture:** Introduce a `src/services/llm/` provider layer with separate adapters for Anthropic Claude, xAI Grok, Gemini, and deterministic local scoring. Keep the existing `EvaluationProvider` contract stable by re-exporting the new implementation from `src/evaluation/providers.ts`, so callers can migrate incrementally. Phase 1 only moves provider construction and adapter boundaries; shared judge/scorer extraction, prompt-directory rewrites, MCP routing, and response-shape cleanup remain explicit later phases.

**Tech Stack:** TypeScript, Vitest, `@anthropic-ai/sdk`, `openai` with `baseURL=https://api.x.ai/v1`, existing `@google/genai`, native AbortSignal forwarding.

---

## Acceptance Criteria

- `getDefaultProvider()` no longer treats Gemini as the only real LLM path.
- `ELENCHUS_LLM_PROVIDER=claude|grok|gemini|deterministic` is the primary provider selector.
- `ELENCHUS_PREFERRED_MODEL` can infer provider from model families such as `claude-4`, `grok-3`, or `gemini-*`.
- Automatic priority without explicit config is Claude first, then Grok, then Gemini, then deterministic.
- Deterministic mode still works with no keys and uses existing heuristic behavior.
- Existing imports from `src/evaluation/providers.ts` continue to work.
- Provider selection is covered by failing-first tests.
- No commits, pushes, deployments, or secret changes are performed without explicit authorization.

## Dirty-Tree Boundary

Pre-flight showed unrelated in-progress sidecar work already present on branch `feature/hermes-action-review-sidecar`:

- Modified: `.gitignore`, `README.md`, `package.json`, `src/evaluation/saboteur.ts`
- Untracked: `docs/plans/2026-05-03-hermes-action-review-sidecar-plan.md`, `examples/`, `src/sidecar/`, `test/evaluation/generic-alternatives.test.ts`, `test/sidecar/`

Phase 1 changes must avoid overwriting those edits. If `package.json` changes are needed for provider SDK dependencies, patch the existing file in place and call that out separately in the final status.

## Task 1: Provider Selection Tests

**Objective:** Freeze the new provider priority and environment semantics before production changes.

**Files:**
- Create: `test/services/llm/provider-selection.test.ts`
- Later create/modify: `src/services/llm/*`, `src/evaluation/providers.ts`

**Step 1: Write failing tests**

Cover:

- No provider keys returns deterministic local provider.
- `ANTHROPIC_API_KEY` selects Claude automatically.
- `XAI_API_KEY` selects Grok when Claude is unavailable.
- `GEMINI_API_KEY` selects Gemini only after Claude/Grok are unavailable.
- `ELENCHUS_LLM_PROVIDER=deterministic` forces deterministic even with keys.
- `ELENCHUS_LLM_PROVIDER=claude` with `ELENCHUS_PREFERRED_MODEL=claude-4` returns Claude metadata using that model.
- Conflicting explicit provider/model family config is rejected rather than silently misrouting.

**Step 2: Run RED**

Run: `npm test -- --run test/services/llm/provider-selection.test.ts`
Expected: FAIL because `src/services/llm/providers.js` does not exist yet.

## Task 2: Create `src/services/llm/` Foundation

**Objective:** Add the adapter folder and keep the existing evaluation provider contract stable.

**Files:**
- Create: `src/services/llm/types.ts`
- Create: `src/services/llm/support-assessment.ts`
- Create: `src/services/llm/deterministic.adapter.ts`
- Create: `src/services/llm/gemini.adapter.ts`
- Create: `src/services/llm/anthropic.adapter.ts`
- Create: `src/services/llm/xai.adapter.ts`
- Create: `src/services/llm/providers.ts`
- Create: `src/services/llm/index.ts`
- Modify: `src/evaluation/providers.ts`

**Step 1: Minimal implementation**

- Move deterministic support scoring into `deterministic.adapter.ts` unchanged.
- Move Gemini support scoring into `gemini.adapter.ts` unchanged except for using shared support-assessment parsing/validation.
- Add Claude adapter using Anthropic Messages tool-use JSON output.
- Add Grok adapter using OpenAI SDK with `baseURL=https://api.x.ai/v1` and JSON-schema response format.
- Re-export compatibility names from `src/evaluation/providers.ts`.

**Step 2: Run GREEN**

Run: `npm test -- --run test/services/llm/provider-selection.test.ts`
Expected: PASS.

## Task 3: Dependency Wiring

**Objective:** Add only the SDK dependencies required by Phase 1 adapters.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1: Install dependencies**

Run: `npm install @anthropic-ai/sdk openai`
Expected: dependencies added without removing existing dirty sidecar script changes.

**Step 2: Verify TypeScript**

Run: `npm run lint`
Expected: PASS or only reveal unrelated pre-existing dirty-tree issues that are documented separately.

## Task 4: Regression Verification

**Objective:** Make sure Phase 1 did not break the existing deterministic path.

**Files:**
- No new files expected.

**Step 1: Targeted existing tests**

Run: `npm test -- --run test/evaluation/v2-types-and-heuristics.test.ts`
Expected: PASS.

**Step 2: Inspect diff/status**

Run:

```bash
git diff -- src/services/llm src/evaluation/providers.ts test/services/llm/provider-selection.test.ts package.json package-lock.json docs/plans/2026-05-03-phase-1-multi-provider-llm-abstraction.md
git status --short
```

Expected: Phase 1 files are separated from unrelated sidecar edits.

## Deferred to Later Phases

- Phase 2: Extract `SupportScorer`/judge logic out of provider-specific classes and add optional LLM saboteur path.
- Phase 3: Move prompts into `prompts/`, rewrite Claude-first prompts with few-shot and chain-of-verification, route MCP tools through the abstraction, update README and `.env.example`, and add prompt/provider-switching tests.
- Phase 4: Improve deterministic-vs-LLM benchmark quality measurement and human-alignment notes.
