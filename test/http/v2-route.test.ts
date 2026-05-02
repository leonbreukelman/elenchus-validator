import { Readable, Writable } from "node:stream";
import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../server.js";

afterEach(async () => {
  delete process.env.ELENCHUS_API_TOKEN;
  delete process.env.NODE_ENV;
  delete process.env.ELENCHUS_ALLOW_UNAUTHENTICATED;
});

async function request(path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  const app = createApp();
  const fakeSocket = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  }) as any;
  fakeSocket.cork = () => undefined;
  fakeSocket.uncork = () => undefined;
  fakeSocket.destroy = () => undefined;

  const req = new Readable({
    read() {
      this.push(init.body ?? null);
      if (init.body) this.push(null);
    },
  }) as any;
  req.url = path;
  req.method = init.method ?? "GET";
  req.headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
  if (init.body) req.headers["content-length"] = Buffer.byteLength(init.body).toString();
  req.connection = fakeSocket;
  req.socket = fakeSocket;

  let body = "";
  const res = new http.ServerResponse(req) as any;
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  res.write = (chunk: unknown, encoding?: BufferEncoding, callback?: () => void) => {
    if (chunk) body += Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
    return originalWrite(chunk, encoding, callback);
  };
  res.end = (chunk?: unknown, encoding?: BufferEncoding, callback?: () => void) => {
    if (chunk) body += Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
    return originalEnd(chunk, encoding, callback);
  };
  res.assignSocket(fakeSocket);
  const finished = new Promise<void>((resolve, reject) => {
    res.on("finish", resolve);
    res.on("error", reject);
  });

  await new Promise<void>((resolve, reject) => {
    (app as any).handle(req, res, (error: unknown) => (error ? reject(error) : resolve()));
    res.on("finish", resolve);
  });
  await finished;

  return {
    status: res.statusCode as number,
    json: async () => JSON.parse(body),
  };
}

describe("/api/v2/evaluate", () => {
  it("fails closed in production when bearer auth is not configured", async () => {
    process.env.NODE_ENV = "production";

    const response = await request("/api/v2/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "auth_not_configured" });
  });

  it("requires bearer auth when ELENCHUS_API_TOKEN is configured", async () => {
    process.env.ELENCHUS_API_TOKEN = "local-test-token";

    const response = await request("/api/v2/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
  });

  it("returns status-safe v2 reports for valid SRE evaluations", async () => {
    process.env.ELENCHUS_API_TOKEN = "local-test-token";

    const response = await request("/api/v2/evaluate", {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        traceId: "route-v2-001",
        domain: "sre",
        context: "Postgres has 95% I/O wait and idle in transaction sessions blocking VACUUM.",
        proposedAction: {
          type: "terminate_idle_sessions",
          target: "postgres",
          parameters: { maxIdleAgeMinutes: 30 },
          riskLevel: "medium",
        },
        rationale:
          "Because idle in transaction sessions older than 30 minutes are holding locks and blocking VACUUM, terminating those sessions releases the locks and targets the cause of I/O saturation.",
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("complete");
    expect(body.overallSignal).toEqual(expect.any(Number));
    expect(body.calibration).toBe("uncalibrated_internal_alpha");
    expect(body).not.toHaveProperty("score");
  });

  it("requires bearer auth for the legacy v1 cost-incurring endpoint when configured", async () => {
    process.env.ELENCHUS_API_TOKEN="***";

    const response = await request("/api/v1/intercept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
  });

  it("rejects malformed bodies without calling a provider", async () => {
    const response = await request("/api/v2/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ traceId: "bad" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      status: "error",
      overallSignal: null,
    });
  });
});
