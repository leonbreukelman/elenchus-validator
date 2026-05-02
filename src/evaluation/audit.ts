import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256Hex } from "../util/hash.js";

const SECRET_KEY_PATTERN=/(auth|authorization|api[_-]?key|secret|token|password|passwd|credential)/i;
const SECRET_ASSIGNMENT_PATTERN=/\b([A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Z0-9_]*)\s*=\s*[^\s,;]+/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;

export interface AuditEvent {
  traceId: string;
  stage: string;
  replay: {
    evaluatorVersion: string;
    provider: string;
    model?: string;
  };
  payload: unknown;
}

export interface AuditWriteRef {
  path: string;
  sha256: string;
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(BEARER_PATTERN, "Bearer [REDACTED]").replace(SECRET_ASSIGNMENT_PATTERN, "$1=[REDACTED]");
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactSecrets(nested),
      ])
    );
  }
  return value;
}

export function safeAuditTraceId(traceId: string): string {
  const safe = traceId
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
  return safe.length > 0 ? safe : "trace";
}

export class FileAuditLogger {
  private readonly directory: string;
  private readonly retentionDays: number;

  constructor(options: { directory?: string; retentionDays?: number } = {}) {
    this.directory = options.directory ?? process.env.ELENCHUS_AUDIT_DIR ?? ".elenchus-audit";
    this.retentionDays = options.retentionDays ?? Number(process.env.ELENCHUS_AUDIT_RETENTION_DAYS ?? 14);
  }

  async write(event: AuditEvent): Promise<AuditWriteRef> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const redacted = {
      ...event,
      traceId: safeAuditTraceId(event.traceId),
      originalTraceIdHash: sha256Hex(event.traceId),
      retentionDays: this.retentionDays,
      writtenAt: new Date().toISOString(),
      payload: redactSecrets(event.payload),
    };
    const line = `${JSON.stringify(redacted)}\n`;
    const filename = `${safeAuditTraceId(event.traceId)}-${Date.now()}-${randomUUID().slice(0, 8)}.jsonl`;
    const path = join(this.directory, filename);
    await writeFile(path, line, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return { path, sha256: sha256Hex(line) };
  }
}
