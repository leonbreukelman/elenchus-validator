# Elenchus Validator -- Socratic Interception Proxy

Autonomous middleware that validates agent-proposed actions through adversarial dialectic before allowing execution.

## How It Works

Every incoming action proposal is subjected to a Saboteur/Judge state machine:

1. **Receive** -- The proxy accepts an action proposal with its context and reasoning.
2. **Saboteur Attack** -- An adversarial model generates the most plausible *alternative* action justified by the *same* reasoning. If the reasoning can support contradictory actions, it is "easy to vary."
3. **Judge Verdict** -- An impartial judge evaluates whether the original reasoning contains hard-to-vary elements that the saboteur's alternative cannot match.

The loop runs up to `MAX_DEPTH=2` rounds. If the saboteur breaks the reasoning at any point, the action is **DENIED**. If the defense survives all rounds with sufficient concordance, the action is **ALLOWED**. Any error, timeout, or ambiguous outcome defaults to **DENY** (fail-closed circuit breaker).

A **concordance score** (0--100) quantifies how well the reasoning survived scrutiny:

| Range | Meaning |
|-------|---------|
| 80--100 | Hard to vary. Saboteur alternatives clearly inferior. |
| 60--79 | Held, but with notable weaknesses. |
| 40--59 | Marginal. Original and alternative are close in plausibility. |
| 0--39 | Easy to vary. DENY regardless. |

The ALLOW threshold is concordance >= 60.

## API

### POST /api/v1/intercept

Submit an action for Socratic interception.

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
  "actionState": "ALLOW",
  "concordanceScore": 82,
  "terminalLog": [
    "[RECEIVE] traceId=swarm-7f3a-0042 | action=REDUCE_POSITION | timestamp=...",
    "[SABOTEUR R1] Alternative: ...",
    "[JUDGE R1] Verdict: ALLOW. Concordance: 82. ...",
    "[VERDICT] ALLOW | concordance=82 | rounds=1 | elapsed=4.3s"
  ]
}
```

**curl example:**

```bash
curl -X POST http://localhost:3000/api/v1/intercept \
  -H "Content-Type: application/json" \
  -d '{
    "traceId": "test-001",
    "context": "Flat market. VIX at 14.",
    "proposedAction": {"type": "BUY", "instrument": "AAPL", "quantity": 100},
    "reasoning": "RSI oversold at 28, price at support, earnings catalyst in 5 days."
  }'
```

### GET /api/health

Returns service status, active endpoints, and API key configuration state.

### MCP Transport

An MCP server is exposed via SSE at `/mcp/sse`. The `intercept_action` tool accepts the same fields as the REST endpoint and runs the same Socratic gateway.

## Setup

**Prerequisites:** Node.js >= 18, npm

```bash
git clone <repo-url> && cd elenchus-validator
npm install
```

Create a `.env.local` file with your Gemini API key:

```
GEMINI_API_KEY=your-key-here
```

Start the server:

```bash
npm run dev
```

The server runs on `http://localhost:3000`.

Run tests:

```bash
npm test
```

## Architecture

The full architecture decision record is at [docs/ADR-001-Socratic-Interception.md](docs/ADR-001-Socratic-Interception.md). It covers the state machine design, interface definitions, concordance scoring semantics, context window management, latency analysis, and worked execution traces for both ALLOW and DENY paths.

## Testing

Tests use Vitest (`npm test`). Three cases:

1. **Hallucination (DENY)** -- Submits an action with logically disconnected reasoning (weather patterns justifying a stock purchase). Expects DENY with concordance below 50. Requires `GEMINI_API_KEY`.
2. **Robust action (ALLOW)** -- Submits a position reduction backed by specific risk thresholds, delta limits, and volatility regime rules. Expects ALLOW with concordance above 60. Requires `GEMINI_API_KEY`.
3. **Deadlock / circuit breaker (DENY)** -- Mocks the Gemini API to return perpetually inconclusive verdicts. Verifies the system runs exactly 2 rounds, makes exactly 4 API calls, and fails closed with DENY. Fully mocked, no API key needed.
