import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileAuditLogger, redactSecrets } from "../../src/evaluation/audit.js";
import { evaluateRequestV2 } from "../../src/evaluation/evaluator.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("audit logging", () => {
  it("redacts common credential material and records replay metadata", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "elenchus-audit-"));
    const logger = new FileAuditLogger({ directory: tempDir, retentionDays: 14 });

    const ref = await logger.write({
      traceId: "audit-redaction-001",
      stage: "request",
      replay: { evaluatorVersion: "v2-alpha", provider: "deterministic-local" },
      payload: {
        headers: { authorization: "Bearer secret-token" },
        env: "GEMINI_API_KEY=abc123",
      },
    });

    const contents = await readFile(ref.path, "utf8");
    expect(contents).toContain("audit-redaction-001");
    expect(contents).toContain("deterministic-local");
    expect(contents).not.toContain("secret-token");
    expect(contents).not.toContain("abc123");
    expect(contents).toContain("[REDACTED]");
  });

  it("redacts nested API key fields", () => {
    expect(redactSecrets({ apiKey: "abc", nested: { token: "def" } })).toEqual({
      apiKey: "[REDACTED]",
      nested: { token: "[REDACTED]" },
    });
  });

  it("does not store raw request context or rationale in evaluator audit payloads", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "elenchus-audit-"));
    const logger = new FileAuditLogger({ directory: tempDir, retentionDays: 14 });
    const rawContext = "customer-prod database incident with sensitive table audit_logs";
    const rawRationale = "Because the sensitive sessions block VACUUM, terminate only sessions older than 30 minutes.";

    const report = await evaluateRequestV2(
      {
        traceId: "audit-safe-request",
        domain: "sre",
        context: rawContext,
        proposedAction: { type: "TERMINATE_IDLE_SESSIONS", target: "postgres", riskLevel: "medium" },
        rationale: rawRationale,
      },
      { auditLogger: logger }
    );

    const contents = await readFile(report.auditRef!, "utf8");
    expect(contents).not.toContain(rawContext);
    expect(contents).not.toContain(rawRationale);
    expect(contents).toContain("requestDigest");
    expect(contents).toContain("contextHash");
    expect(contents).toContain("rationaleHash");
  });

  it("keeps trace IDs inside the audit directory and writes private files", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "elenchus-audit-"));
    const logger = new FileAuditLogger({ directory: tempDir, retentionDays: 14 });

    const ref = await logger.write({
      traceId: "../../escape/trace",
      stage: "request",
      replay: { evaluatorVersion: "v2-alpha", provider: "deterministic-local" },
      payload: { safe: true },
    });

    expect(ref.path.startsWith(tempDir)).toBe(true);
    expect(ref.path).not.toContain("..");
    const mode = (await stat(ref.path)).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
