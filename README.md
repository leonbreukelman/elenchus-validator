# Elenchus Validator -- Socratic Interception Proxy

Autonomous middleware that evaluates reasoning quality of agent-proposed actions through adversarial dialectic.

## How It Works

Every incoming action proposal is subjected to a Saboteur/Judge state machine that runs up to `MAX_DEPTH=2` rounds to determine a reasoning quality score:

1. **Receive** -- The proxy accepts an action proposal with its context and reasoning.
2. **Saboteur Attack** -- An adversarial model generates the most plausible *alternative* action justified by the *same* reasoning. If the reasoning can support contradictory actions, it is "easy to vary." In round 2, the Saboteur receives a compressed summary of round 1 (the prior alternative and the Judge's assessment) and is instructed to attack from a *different angle* than the previous round.
3. **Judge Assessment** -- An impartial judge evaluates how well the original reasoning justifies the proposed action specifically, vs how well it justifies the saboteur's alternative. The Judge returns a quality assessment and a score (0-100).

**Loop termination logic**:

- The loop breaks early if a high-confidence result is reached (score >= 80 or score <= 30).
- Otherwise, the loop continues to `MAX_DEPTH` (2 rounds) to refine the assessment.
- The system returns the score from the final round or the early-exit round.
- Any error or timeout returns the last successfully calculated score (or 0 if none).

## Reasoning Quality Score

A score from 0-100 quantifying how "hard to vary" the reasoning is.

| Range | Quality | Interpretation |
|-------|---------|----------------|
| 80-100 | Exceptional | Hard to vary. Original reasoning is clearly superior to saboteur alternatives. |
| 60-79 | Good | Reasoning holds but with minor weaknesses. |
| 40-59 | Marginal | Original reasoning and alternative are close in plausibility. |
| 0-39 | Poor | Easy to vary. Saboteur produced compelling alternatives. |

## API

### POST /api/v1/intercept

Submit an action for Socratic interception and scoring.

**Request:**

```json
{
  "traceId": "swarm-7f3a-0042",
  "context": "BTC/USDT on Binance. Price: $67,240. ATR(14): 2,847. Portfolio heat: 34%.",
  "proposedAction": {
    "type": "REDUCE_POSITION",
    "instrument": "BTC/USDT",
    "quantity": 0.2
  },
  "reasoning": "ATR(14) expanded 38% over 3 sessions, exceeding the 25% volatility regime threshold. Reducing by 0.2 BTC brings risk budget from 34% to 22%."
}
```

**Response:**

```json
{
  "score": 82,
  "terminalLog": [
    "[RECEIVE] traceId=swarm-7f3a-0042 | action=REDUCE_POSITION | timestamp=...",
    "[SABOTEUR R1] Alternative: ...",
    "[JUDGE R1] Assessment: Hard to vary. Score: 82. ...",
    "[RESULT] score=82 | rounds=1 | elapsed=4.3s"
  ]
}
```

### GET /api/health

Returns service status and active endpoints.

### MCP Transport

An MCP server is exposed via SSE at `/mcp/sse`.

- `intercept_action` -- Returns reasoning quality score (0-100).
- `run_deutsch_probe` -- Evaluates a theory against David Deutsch's "Good Explanation" criteria.
- `run_variability_attack` -- Attempts to sabotage an explanation by generating alternatives.

## Setup

Create a `.env` file with your Gemini API key:

```
GEMINI_API_KEY=your-key-here
```

Start the server:

```bash
npm run dev
```

## Constants

Defined in `src/services/interceptor.ts`:

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_DEPTH` | 2 | Maximum Saboteur/Judge rounds |
| `PER_CALL_TIMEOUT_MS` | 30000 | Timeout per individual Gemini API call (30s) |
| `GATEWAY_TIMEOUT_MS` | 90000 | Total timeout for the entire pipeline (90s) |
| `MODEL` | `gemini-3-flash-preview` | Gemini model used for scrutiny |

## Testing

Tests use Vitest (`npm test`). Functional tests mock the API to verify scoring logic and round convergence.
