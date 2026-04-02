# Elenchus Validator -- Socratic Interception Proxy

Autonomous middleware that evaluates reasoning quality of agent-proposed actions through adversarial dialectic.

## How It Works

Every incoming action proposal is subjected to a Saboteur/Judge state machine that runs up to `MAX_DEPTH=2` rounds to determine a reasoning quality score:

1. **Receive** -- The proxy accepts an action proposal with its context and reasoning.
2. **Saboteur Attack** -- An adversarial model generates the most plausible *alternative* action justified by the *same* reasoning. If the reasoning can support contradictory actions, it is "easy to vary."
3. **Judge Assessment** -- An impartial judge evaluates how well the original reasoning justifies the proposed action specifically, vs how well it justifies the saboteur's alternative. The Judge returns a quality assessment and a score (0-100).

**Loop termination logic**:
- The loop breaks early if a high-confidence result is reached (score >= 80 or score <= 30).
- Otherwise, the loop continues to `MAX_DEPTH` (2 rounds) to refine the assessment.
- The system returns the score from the final round or the early-exit round.

## Reasoning Quality Score

| Range | Quality | Interpretation |
|-------|---------|----------------|
| 80-100 | Exceptional | **Hard to vary.** Original reasoning is uniquely suited to the action. |
| 60-79 | Good | Reasoning holds but with minor weaknesses or alternatives. |
| 40-59 | Marginal | Original reasoning and alternative are close in plausibility. |
| 0-39 | Poor | **Easy to vary.** The same logic justifies contradictory actions. |

## Examples

### 1. SRE / Systems Engineering (Score: 94 - Exceptional)
*Reasoning identifies a structural, non-arbitrary link between cause and effect.*

*   **Context**: Postgres DB showing high I/O wait. `pg_stat_activity` shows 12 sessions in `idle in transaction` for >30m.
*   **Proposed Action**: `TERMINATE_IDLE_SESSIONS`
*   **Reasoning**: "These sessions hold row-level locks on `audit_logs`, blocking the `VACUUM` process. This causes 'table bloat' where the DB scans excess dead tuples, saturating disk I/O. Terminating them releases locks and allows `VACUUM` to recover the structural root cause."
*   **Saboteur's Attack**: "I propose `UPGRADE_STORAGE_IOPS`. Rationale: Increasing disk throughput will allow the DB to handle the scans more efficiently without interrupting sessions."
*   **Judge's Assessment**: **Score: 94**. The reasoning is hard to vary. It identifies a specific mechanical failure (VACUUM blockage) unique to the database architecture. The alternative is structurally inferior because it treats a symptom (disk speed) rather than the causal mechanism.

### 2. Medical Diagnostic (Score: 35 - Poor)
*Reasoning that justifies multiple contradictory actions equally well.*

*   **Context**: Chest CT shows 12mm sub-solid nodule. No previous imaging available.
*   **Proposed Action**: `SCHEDULE_BIOPSY`
*   **Reasoning**: "The nodule is 12mm, exceeding the 6mm threshold for clinical concern. Its density suggests it should be biopsied immediately to rule out malignancy."
*   **Saboteur's Attack**: "I propose `SCHEDULE_FOLLOW_UP_CT` (3 months). Rationale: Without prior imaging, a sub-solid nodule could be transient inflammation. A follow-up is the safer path to confirm persistence before an invasive biopsy."
*   **Judge's Assessment**: **Score: 35**. The reasoning is easy to vary. It ignores the standard clinical alternative of transient inflammation, which is equally justified by a single scan. The logic doesn't explain why a biopsy is specifically superior to a follow-up.

## API

### POST /api/v1/intercept

**Request:**

```json
{
  "traceId": "sre-monitor-001",
  "context": "Postgres DB showing high I/O wait. 12 idle sessions in audit_logs.",
  "proposedAction": {"type": "TERMINATE_IDLE_SESSIONS", "max_idle_age": "10m"},
  "reasoning": "Idle transactions are blocking VACUUM on audit_logs, causing table bloat and I/O saturation. Terminating them is required to release locks."
}
```

**Response:**

```json
{
  "score": 94,
  "terminalLog": [
    "[RECEIVE] traceId=sre-monitor-001 | action=TERMINATE_IDLE_SESSIONS | timestamp=...",
    "[SABOTEUR R1] Alternative: ...",
    "[JUDGE R1] Assessment: Hard to vary. Score: 94. ...",
    "[RESULT] score=94 | rounds=1 | elapsed=4.2s"
  ]
}
```

## Setup

Create a `.env` file with your Gemini API key: `GEMINI_API_KEY=your-key-here`

Start the server: `npm run dev`

## Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_DEPTH` | 2 | Maximum Saboteur/Judge rounds |
| `PER_CALL_TIMEOUT_MS` | 30000 | Timeout per individual LLM call |
| `GATEWAY_TIMEOUT_MS` | 90000 | Total timeout for the pipeline |
