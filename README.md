# Elenchus Validator -- Socratic Interception Proxy

Autonomous middleware that validates agent-proposed actions through adversarial dialectic before allowing execution.

## How It Works

Every incoming action proposal is subjected to a Saboteur/Judge state machine that runs up to `MAX_DEPTH=2` rounds:

1. **Receive** -- The proxy accepts an action proposal with its context and reasoning.
2. **Saboteur Attack** -- An adversarial model generates the most plausible *alternative* action justified by the *same* reasoning. If the reasoning can support contradictory actions, it is "easy to vary." In round 2, the Saboteur receives a compressed summary of round 1 (the prior alternative, the Judge's assessment, and the concordance score) and is instructed to attack from a *different angle* than the previous round.
3. **Judge Verdict** -- An impartial judge evaluates whether the original reasoning contains hard-to-vary elements that the saboteur's alternative cannot match. The Judge returns both a verdict (ALLOW or DENY) and a concordance score (0--100).

**Loop termination logic**:

- If the Judge returns **DENY** at any concordance score, the loop breaks immediately. The action is **DENIED**.
- If the Judge returns **ALLOW** with concordance **>= 70**, the loop breaks. The action is **ALLOWED**.
- If the Judge returns **ALLOW** with concordance **< 70**, the Judge was not confident enough. The loop continues to the next round with the Saboteur receiving a summary of the prior round.
- If **MAX_DEPTH** is reached without a clear verdict, the system defaults to **DENY** (fail-closed).
- Any error or timeout at any stage defaults to **DENY**.

### Concordance Score

A score from 0--100 quantifying how well the reasoning survived scrutiny.

| Range | Meaning | Behavior |
|-------|---------|----------|
| 80--100 | Hard to vary. Saboteur alternatives clearly inferior. | ALLOW (loop breaks) |
| 70--79 | Reasoning held with some weaknesses. | ALLOW (loop breaks) |
| 60--69 | Notable weaknesses but not refuted. | Loop continues -- Judge not confident enough. If MAX_DEPTH reached, DENY. |
| 40--59 | Marginal. Original and alternative are close in plausibility. | Loop continues or DENY if Judge verdict is DENY. |
| 0--39 | Easy to vary. Saboteur produced compelling alternatives. | DENY (loop breaks) |

Note: any DENY verdict from the Judge breaks the loop immediately regardless of concordance score. The >= 70 threshold only applies to ALLOW verdicts.

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

All four fields (`traceId`, `context`, `proposedAction`, `reasoning`) are required. The server returns 400 with a specific error message if any are missing or the wrong type.

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

```json
{
  "status": "ok",
  "service": "elenchus-validator",
  "mode": "socratic-interception-proxy",
  "mcp": "active",
  "endpoints": {
    "intercept": "POST /api/v1/intercept",
    "mcpSse": "GET /mcp/sse",
    "mcpMessages": "POST /mcp/messages"
  },
  "env": {
    "hasApiKey": true,
    "maskedKey": "AIz...abc",
    "keyLength": 39,
    "nodeEnv": null
  }
}
```

### MCP Transport

An MCP server is exposed via SSE at `/mcp/sse` with message handling at `/mcp/messages`. Three tools are available:

- `intercept_action` -- Same fields as the REST endpoint. Runs the full Socratic gateway.
- `run_deutsch_probe` -- Evaluates a theory against David Deutsch's "Good Explanation" criteria (variability, reach, testability).
- `run_variability_attack` -- Attempts to sabotage an explanation by generating alternative mechanisms.

## Setup

**Prerequisites:** Node.js >= 18, npm

```bash
git clone <repo-url> && cd elenchus-validator
npm install
```

Create a `.env` file with your Gemini API key:

```
GEMINI_API_KEY=your-key-here
```

The server also accepts `API_KEY` as a fallback if `GEMINI_API_KEY` is not set.

Start the server:

```bash
npm run dev
```

The server runs on `http://localhost:3000`.

**Available scripts** (from `package.json`):

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run dev` | `tsx server.ts` | Development server with TypeScript execution |
| `npm start` | `tsx server.ts` | Start server |
| `npm run lint` | `tsc --noEmit` | Type checking without emit |
| `npm test` | `vitest run` | Run test suite |

## Architecture

The full architecture decision record is at [docs/ADR-001-Socratic-Interception.md](docs/ADR-001-Socratic-Interception.md). It covers the state machine design, interface definitions, concordance scoring semantics, context window management strategy, latency analysis, and worked execution traces for both ALLOW and DENY paths.

## Testing

Tests use Vitest (`npm test`). Three cases:

1. **Hallucination (DENY)** -- Submits an action with logically disconnected reasoning (weather patterns justifying a stock purchase). Expects DENY with concordance below 50. Requires `GEMINI_API_KEY`.
2. **Robust action (ALLOW)** -- Submits a position reduction backed by specific risk thresholds, delta limits, and volatility regime rules. Expects ALLOW with concordance above 60. Requires `GEMINI_API_KEY`.
3. **Deadlock / circuit breaker (DENY)** -- Mocks the Gemini API to return perpetually inconclusive verdicts (ALLOW at concordance 50, below the 70 threshold). Verifies the system runs exactly 2 rounds, makes exactly 4 API calls (2 saboteur + 2 judge), and fails closed with DENY and a "max depth reached" verdict. Fully mocked, no API key needed.

Tests 1 and 2 are skipped automatically when no API key is present (`GEMINI_API_KEY` or `API_KEY`).

## Constants

Defined in `src/services/interceptor.ts`:

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_DEPTH` | 2 | Maximum Saboteur/Judge rounds before fail-closed DENY |
| `PER_CALL_TIMEOUT_MS` | 5000 | Timeout per individual Gemini API call |
| `GATEWAY_TIMEOUT_MS` | 12000 | Total timeout for the entire interception pipeline |
| `MODEL` | `gemini-3-flash-preview` | Gemini model used for both Saboteur and Judge |
