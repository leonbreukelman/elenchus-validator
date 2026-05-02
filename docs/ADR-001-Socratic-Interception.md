# ADR-001: Rationale-Action Specificity Architecture

## Status

Accepted (Updated 2026-05-01)

## Context

The elenchus-validator system was originally designed as a binary "gate" to ALLOW or DENY agent actions. This approach proved too rigid for complex agent swarms that require nuanced quality signals rather than hard blockages.

The system now functions as a **reasoning quality indicator**, providing a 0-100 score that quantifies how "hard to vary" an agent's reasoning is. This score enables calling swarms to make graduated decisions based on their own risk tolerance.

As of v2, the product framing is narrower and more honest: Elenchus is an uncalibrated internal-alpha **rationale-action specificity** signal. It estimates whether a stated rationale specifically supports the proposed action over typed near-neighbor alternatives. It is not a truth oracle, generic reasoning oracle, autonomous allow/deny gate, or hidden chain-of-thought faithfulness detector.

## Decision

### State Machine

The proxy enforces a synchronous loop on every incoming interception request to determine a quality score.

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
               |    | Judge Assessment   |
               |    | Evaluate original  |
               |    | vs. saboteur's     |
               |    | alternative        |
               |    +--------+-----------+
               |             |
               |             v
               |    +--------+-----------+
               |    | Final Score        |
               |    +--------+-----------+
               |             |
               |     +-------+-------+
               |     |               |
               |  Uncertain       High Confidence
               |  (31-79)         (<=30 or >=80)
               |     |               |
               +-----+               v
             (next iteration)     +--+--+
                                  | RESULT |
                                  +------+

          If uncertain after
          final iteration:
                    +-------+
                    | RESULT|
                    +-------+
```

**Steps:**

1. **Receive Proposal** -- Accept an 'InterceptionRequest' via 'POST /api/v1/intercept'.

2. **Saboteur Attack** -- Generate a highly plausible alternative action that could be justified by the same reasoning. Demonstrates if the reasoning is "easy to vary."

3. **Judge Assessment** -- Evaluate the original proposed action's reasoning against the saboteur's alternative. Does the original reasoning contain structural features or specific thresholds that make the proposed action the logical choice?

4. **Scoring** -- Provide a score from 0-100 based on the quality of the reasoning. Low scores (0-39) indicate easy-to-vary reasoning; high scores (80-100) indicate hard-to-vary, high-quality reasoning.

**Loop constraints:**

- 'MAX_DEPTH = 2' iterations of Attack/Assessment.
- Early exit on high-confidence results (score <= 30 or score >= 80).

### Interface Definitions

```typescript
interface InterceptionRequest {
  traceId: string;
  context: string;
  proposedAction: object;
  reasoning: string;
}

interface InterceptionResult {
  score: number;       // 0-100 quality indicator
  terminalLog: string[];
}
```

### V2 Interface

`POST /api/v2/evaluate` preserves v1 compatibility while adding status-safe reports:

- `status`: `complete`, `aborted`, `timeout`, `error`, or `skipped`
- `overallSignal`: numeric only for complete evaluations, otherwise `null`
- `recommendation`: advisory only
- `calibration`: currently always `uncalibrated_internal_alpha`
- `subscores`: rationale specificity, action coupling, alternative resistance, policy alignment
- `support`: original support, strongest alternative support, and specificity margin
- `providerMetadata`: separates deterministic/local and Gemini-backed scoring

The first domain pack is SRE / incident response.

**Score Interpretation:**

| Range | Quality | Interpretation |
|-------|---------|----------------|
| 80-100 | Exceptional | Hard to vary. Original reasoning is clearly superior. |
| 60-79 | Good | Reasoning holds but with minor weaknesses. |
| 40-59 | Marginal | Original reasoning and alternative are close in plausibility. |
| 0-39 | Poor | Easy to vary. Saboteur produced compelling alternatives. |

### Latency and Timeouts

To accommodate complex adversarial reasoning, timeouts have been increased:

- **Per-call timeout**: 30 seconds
- **Gateway timeout**: 90 seconds

## Consequences

### Enables
- Nuanced quality signaling for calling agent swarms.
- Graduated risk-based decision making.
- Improved auditability through detailed quality logs and scores.

### Gives Up
- Direct gating (ALLOW/DENY). The calling system must now interpret the score to make its own execution decisions.
