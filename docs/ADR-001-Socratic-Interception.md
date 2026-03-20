# ADR-001: Socratic Interception Proxy Architecture

## Status

Proposed

## Context

The elenchus-validator system currently operates as a React UI testing harness backed by an Express server. It exposes two Gemini-powered epistemic tools via the Model Context Protocol (MCP over SSE):

- **Deutsch Probe** -- evaluates an explanation against David Deutsch's "Good Explanation" criteria (variability, reach, testability), returning a structured `ProbeResult` with a score and verdict.
- **Variability Attack** -- acts as an "Explanation Saboteur," generating alternative explanations to test whether a theory is hard to vary.

The server (`server.ts`) bundles Vite middleware for development and serves a static SPA in production. MCP sessions are managed via SSE transport with in-memory session maps. The validator service (`src/services/validator.ts`) defines domain types (`Theory`, `ProbeResult`, `AttackResult`, `ValidationReport`) and a concordance score (0-100) that measures agreement between probe judgment and attack outcomes.

This architecture was built for interactive, browser-based exploration of epistemic quality. The new requirement is fundamentally different: the system must function as **autonomous middleware** in an agent swarm's execution path, intercepting proposed actions, subjecting them to adversarial scrutiny, and returning synchronous ALLOW/DENY verdicts. There is no human in the loop. The React frontend, Vite bundling, MCP/SSE transport, and browser-oriented design are all liabilities in this context.

The refactoring replaces the UI-driven architecture with a headless HTTP interception proxy that enforces a Socratic interrogation state machine on every inbound action proposal.

## Decision

### State Machine

The proxy enforces a rigid synchronous loop on every incoming interception request. No action passes through without surviving adversarial scrutiny.

```
                    +--------------------+
                    | Receive Proposal   |
                    | POST /api/v1/      |
                    | intercept          |
                    +--------+-----------+
                             |
                             v
                    +--------+-----------+
               +--->| Saboteur Attack    |
               |    | Generate plausible |
               |    | alternative action |
               |    +--------+-----------+
               |             |
               |             v
               |    +--------+-----------+
               |    | Target Defense     |
               |    | Evaluate original  |
               |    | vs. saboteur's     |
               |    | alternative        |
               |    +--------+-----------+
               |             |
               |             v
               |    +--------+-----------+
               |    | Judge Verdict      |
               |    +--------+-----------+
               |             |
               |     +-------+-------+
               |     |               |
               |  Defense holds   Saboteur wins
               |  (iteration < 2) or equally plausible
               |     |               |
               +-----+               v
             (next iteration)     +--+--+
                                  | DENY |
                                  +------+

          If defense holds after
          final iteration:
                    +-------+
                    | ALLOW |
                    +-------+
```

**Steps:**

1. **Receive Proposal** -- Accept an `InterceptionRequest` via `POST /api/v1/intercept`. Validate required fields. Assign processing timestamp.

2. **Saboteur Attack** -- Using the same information available to the proposing agent, generate a highly plausible alternative action that could achieve the same stated goal. The saboteur's prompt is adversarial: it is instructed to find the most credible alternative, not a strawman.

3. **Target Defense** -- Evaluate the original proposed action's reasoning against the saboteur's alternative. Does the original reasoning contain specifics that the saboteur cannot replicate? Are there structural features of the argument that make it hard to vary?

4. **Judge Verdict** -- If the saboteur's alternative is equally or more plausible than the original, the original action's reasoning is "easy to vary" and the verdict is **DENY**. If the defense holds (the original reasoning contains hard-to-vary elements the saboteur cannot match), proceed to next iteration or issue **ALLOW**.

**Loop constraints:**

- `MAX_DEPTH = 2` iterations of Attack/Defense.
- If the saboteur cannot break the reasoning in 2 rounds, the action is ALLOWED.
- Circuit breaker: if the loop exhausts without a clear verdict (timeout, malformed response, API error), default is **DENY**. Fail closed.

### Interface Definitions

```typescript
interface InterceptionRequest {
  traceId: string;        // Unique identifier from the calling agent swarm
  context: string;        // Environmental context: market state, system state, etc.
  proposedAction: object; // The action the agent wants to execute
  reasoning: string;      // The agent's stated justification for this action
}

interface InterceptionResult {
  actionState: 'ALLOW' | 'DENY';
  concordanceScore: number;  // 0-100, quantifies how well the reasoning survived scrutiny
  terminalLog: string[];     // Ordered log of each state machine step for auditability
}
```

**`concordanceScore` semantics:**

| Range | Interpretation |
|-------|---------------|
| 80-100 | Reasoning is hard to vary. Saboteur alternatives were clearly inferior. |
| 60-79 | Reasoning held but with notable weaknesses. Saboteur found partial openings. |
| 40-59 | Marginal. Reasoning and saboteur alternative were close in plausibility. |
| 0-39 | Reasoning is easy to vary. Saboteur produced equally or more compelling alternatives. |

The ALLOW/DENY threshold is at concordance >= 60. Below 60 is DENY regardless of individual round outcomes.

### Context Window Management Strategy

Gemini Flash provides a ~1M token context window, so raw token limits are not the binding constraint. The real concern is **prompt quality degradation**: overstuffed prompts cause the model to lose focus, weight irrelevant details, and produce lower-quality adversarial reasoning.

**Strategy: Compressed Round Digests**

Before feeding prior Attack/Defense rounds into the next iteration, compress them into structured digests:

```typescript
interface RoundDigest {
  round: number;
  saboteurClaim: string;    // 1-2 sentence summary of the alternative proposed
  defenseRebuttal: string;  // 1-2 sentence summary of why original holds
  judgeAssessment: string;  // 1 sentence: who was stronger and why
}
```

Each digest is ~100-150 tokens, compared to ~800-1200 tokens for the raw Attack/Defense exchange.

**Token budget analysis per prompt:**

| Component | Estimated Tokens |
|-----------|-----------------|
| System prompt (role, instructions) | ~400 |
| InterceptionRequest.context | ~300-800 |
| InterceptionRequest.proposedAction | ~200-500 |
| InterceptionRequest.reasoning | ~200-400 |
| Prior round digests (MAX_DEPTH-1 = 1 digest) | ~150 |
| Response schema / formatting instructions | ~200 |
| **Total (worst case, round 2)** | **~2,250** |

At MAX_DEPTH=2, the maximum prompt size is well under 4K tokens even with generous context fields. This keeps each call in the optimal performance range for Gemini Flash, where the model's attention is concentrated and output quality is highest.

**Guardrails:**

- If `InterceptionRequest.context` exceeds 1500 tokens, truncate to the most recent state summary and log a warning.
- If `InterceptionRequest.reasoning` exceeds 800 tokens, summarize before injection.
- Each Gemini response is validated against the expected schema before proceeding. Malformed responses trigger a retry (1 attempt) before circuit-breaking to DENY.

### Latency Analysis

Each state machine step requires exactly one Gemini Flash API call. The latency profile depends on the path through the state machine.

**Per-call characteristics:**

- Model: `gemini-3-flash` (or `gemini-3-flash-preview` during development)
- Expected latency per call: ~2-2.5 seconds (Gemini Flash with structured output, sub-4K prompt)
- Per-call timeout: 5 seconds (hard cutoff, treats timeout as circuit-breaker trigger)

**Path analysis:**

| Path | Calls | Estimated Latency | Description |
|------|-------|-------------------|-------------|
| Fast DENY (round 1) | 2 | ~4-5s | Saboteur breaks reasoning immediately, Judge issues DENY |
| Fast ALLOW (round 1) | 2 | ~4-5s | Defense holds strongly, Judge issues ALLOW with high concordance |
| Full loop DENY | 4 | ~8-10s | Two rounds of Attack/Defense, saboteur wins on round 2 |
| Full loop ALLOW | 4 | ~8-10s | Two rounds of Attack/Defense, defense survives both |
| Circuit breaker | 1-4 | varies | API error or timeout mid-loop, defaults to DENY |

**Timeout architecture:**

- Per-call timeout: 5 seconds
- Hard gateway timeout: 12 seconds (the calling agent's HTTP client should enforce this)
- Target TTFA (Time To First Action): <10 seconds for the common path

If the calling agent swarm cannot tolerate 10 seconds of synchronous latency, the interception should be made asynchronous with a callback pattern. This ADR assumes the swarm can wait.

### Mock Execution Traces

#### Trace A: ALLOW Path

An agent in a trading swarm proposes to reduce position size based on volatility analysis. The reasoning is specific and structurally hard to vary.

**Step 1: Receive Proposal**

```json
{
  "traceId": "swarm-7f3a-0042",
  "context": "BTC/USDT on Binance. Current price: $67,240. 24h volume: $28.3B. ATR(14): 2,847. Position: 0.5 BTC long, entry $66,100. Unrealized PnL: +$570. Portfolio heat: 34% of risk budget consumed.",
  "proposedAction": {
    "type": "REDUCE_POSITION",
    "instrument": "BTC/USDT",
    "quantity": 0.2,
    "orderType": "LIMIT",
    "limitPrice": 67300,
    "timeInForce": "GTC"
  },
  "reasoning": "ATR(14) expanded 38% over the past 3 sessions (from 2,063 to 2,847), indicating regime shift to higher volatility. Current position consumes 34% of risk budget at original stop distance. Reducing by 0.2 BTC brings risk budget consumption to ~22%, maintaining the same stop distance without tightening it into noise. The 38% ATR expansion exceeds the 25% threshold defined in the volatility regime rules."
}
```

**Step 2: Saboteur Attack (Round 1)**

The saboteur generates a plausible alternative action:

```json
{
  "terminalLog": "[SABOTEUR R1] Alternative: HOLD position and tighten stop to $66,400 instead of reducing. Rationale: The +$570 unrealized gain provides buffer. Tightening the stop achieves risk reduction without sacrificing upside exposure. The ATR expansion could signal a breakout continuation, not just noise increase. A trailing stop at 1.2x ATR below current price ($67,240 - $3,416 = $63,824) would protect gains while maintaining full position."
}
```

**Step 3: Target Defense (Round 1)**

```json
{
  "terminalLog": "[DEFENSE R1] The saboteur's stop-tightening alternative conflates two distinct risk measures. Tightening the stop changes the risk-per-trade but does NOT reduce portfolio heat (34% of total risk budget). The original reasoning specifically addresses portfolio-level risk budget consumption, not individual trade risk. Additionally, tightening stops during ATR expansion increases the probability of being stopped out by noise -- the original reasoning explicitly avoids this by maintaining stop distance and reducing size instead. The 25% ATR threshold is a pre-defined rule, not a discretionary judgment, making the trigger mechanism hard to vary."
}
```

**Step 4: Judge Verdict (Round 1)**

```json
{
  "terminalLog": "[JUDGE R1] Defense holds. The original reasoning distinguishes portfolio heat from trade risk -- a structural feature the saboteur's alternative ignores. The pre-defined 25% ATR threshold makes the trigger non-arbitrary. Concordance: 82. Verdict: ALLOW."
}
```

**Final InterceptionResult:**

```json
{
  "actionState": "ALLOW",
  "concordanceScore": 82,
  "terminalLog": [
    "[RECEIVE] traceId=swarm-7f3a-0042 | action=REDUCE_POSITION BTC/USDT 0.2 | timestamp=2026-03-19T14:22:07Z",
    "[SABOTEUR R1] Alternative: HOLD position and tighten stop to $66,400. Rationale: unrealized gain provides buffer, ATR expansion may signal breakout continuation, trailing stop achieves risk reduction without sacrificing upside.",
    "[DEFENSE R1] Saboteur conflates trade risk with portfolio heat. Original addresses portfolio-level risk budget (34%). Tightening stops during ATR expansion increases noise stop-outs. 25% ATR threshold is pre-defined rule, not discretionary.",
    "[JUDGE R1] Defense holds. Portfolio heat vs. trade risk distinction is structural. Pre-defined threshold is non-arbitrary. Concordance: 82.",
    "[VERDICT] ALLOW | concordance=82 | rounds=1 | elapsed=4.3s"
  ]
}
```

---

#### Trace B: DENY Path

An agent proposes to add to a losing position based on vague mean-reversion logic. The reasoning is easy to vary.

**Step 1: Receive Proposal**

```json
{
  "traceId": "swarm-7f3a-0089",
  "context": "ETH/USDT on Binance. Current price: $3,410. 24h volume: $12.1B. Position: 2.0 ETH long, entry $3,580. Unrealized PnL: -$340. Portfolio heat: 41% of risk budget consumed.",
  "proposedAction": {
    "type": "ADD_TO_POSITION",
    "instrument": "ETH/USDT",
    "quantity": 1.0,
    "orderType": "MARKET",
    "timeInForce": "IOC"
  },
  "reasoning": "ETH is trading 4.7% below recent high of $3,580. Historical mean-reversion tendency suggests price will recover to the $3,550-$3,600 range. Adding 1.0 ETH at $3,410 lowers average entry to $3,523, improving breakeven by $57. The risk/reward is favorable because the downside from here is limited given strong support at $3,300."
}
```

**Step 2: Saboteur Attack (Round 1)**

```json
{
  "terminalLog": "[SABOTEUR R1] Alternative: ADD 1.0 ETH because ETH is trading near the 50-day moving average, which historically acts as a magnet. Average entry improvement to $3,523 means only a 3.3% recovery is needed to breakeven instead of 5%. The 50-day MA confluence makes this a higher-probability entry than the original. -- NOTE: This alternative uses completely different reasoning (MA confluence vs. mean-reversion from highs) but arrives at the IDENTICAL action with equal or greater plausibility. The original reasoning is easy to vary."
}
```

**Step 3: Target Defense (Round 1)**

```json
{
  "terminalLog": "[DEFENSE R1] The original reasoning cites 'historical mean-reversion tendency' without specifying the lookback period, statistical significance, or which mean is being reverted to. The 4.7% decline from recent high is an arbitrary anchor -- any price is 'below recent high' in a downtrend. The claimed 'strong support at $3,300' is asserted without evidence (no volume profile, no historical test count). The reasoning contains no structural features that the saboteur cannot replicate with different numbers."
}
```

**Step 4: Judge Verdict (Round 1)**

```json
{
  "terminalLog": "[JUDGE R1] Saboteur wins. The saboteur produced an equally plausible justification for the same action using entirely different reasoning (MA confluence vs. mean-reversion). The original reasoning contains no hard-to-vary elements: no defined lookback, no statistical basis for mean-reversion claim, no evidence for support level. Additionally, the proposal increases portfolio heat from 41% to ~55% without addressing existing risk budget overallocation. Concordance: 23. Verdict: DENY."
}
```

**Final InterceptionResult:**

```json
{
  "actionState": "DENY",
  "concordanceScore": 23,
  "terminalLog": [
    "[RECEIVE] traceId=swarm-7f3a-0089 | action=ADD_TO_POSITION ETH/USDT 1.0 | timestamp=2026-03-19T14:25:41Z",
    "[SABOTEUR R1] Alternative: ADD 1.0 ETH based on 50-day MA confluence instead of mean-reversion from highs. Identical action, different reasoning, equal plausibility. Original reasoning is easy to vary.",
    "[DEFENSE R1] Original cites 'historical mean-reversion' without lookback period or statistical basis. '4.7% below recent high' is arbitrary anchor. 'Strong support at $3,300' asserted without evidence. No structural features resist variation.",
    "[JUDGE R1] Saboteur wins. Equally plausible alternative reasoning produced trivially. No hard-to-vary elements in original. Portfolio heat increase from 41% to ~55% unaddressed. Concordance: 23.",
    "[VERDICT] DENY | concordance=23 | rounds=1 | elapsed=4.1s"
  ]
}
```

## Consequences

### Enables

- **Autonomous validation of agent actions without human intervention.** The Socratic interception loop replaces manual review with adversarial machine scrutiny. Actions with hard-to-vary reasoning pass; actions with easy-to-vary reasoning are blocked.
- **Headless deployment as middleware in agent pipelines.** The system becomes a single HTTP endpoint that any agent swarm can call synchronously. No browser, no UI server, no SSE session management.
- **Quantified confidence via concordance scoring.** Every verdict carries a 0-100 concordance score, enabling downstream systems to make graduated decisions (e.g., allow high-concordance actions immediately, route marginal scores to human review queues).
- **Auditable decision trail.** The `terminalLog` array provides a complete, ordered record of every step in the interrogation -- who said what, why the verdict was reached. This is machine-readable and archivable.
- **Deterministic latency envelope.** MAX_DEPTH=2 and per-call timeouts bound the worst-case latency to ~12 seconds. The calling swarm can set expectations accordingly.

### Gives Up

- **Interactive UI for manual theory testing.** The React frontend, Vite dev server, and browser-based exploration interface are removed entirely. There is no way to manually submit theories and visually inspect probe/attack results.
- **Visual feedback and charting.** Score visualizations, category comparisons, and real-time result rendering are eliminated. All output is structured JSON.
- **Direct browser-based access.** The system is no longer accessible via a web browser. Interaction requires HTTP client tooling or integration into an agent pipeline.
- **MCP protocol transport.** The SSE-based MCP server and session management layer are replaced by a simpler REST endpoint. MCP clients that previously connected to the validator will need to be updated.
- **Exploratory epistemic testing.** The curated `THEORIES` catalog (General Relativity, Astrology, Flat Earth, etc.) and the open-ended "evaluate any theory" interface are superseded by the narrower "evaluate this specific proposed action" interface. The system moves from general epistemology tool to purpose-built action gate.
