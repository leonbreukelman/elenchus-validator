import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

function unauthenticatedDevelopmentAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ELENCHUS_ALLOW_UNAUTHENTICATED === "true";
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function requireBearerToken(req: Request, res: Response, next: NextFunction): void {
  const configured = process.env.ELENCHUS_API_TOKEN;
  if (!configured) {
    if (unauthenticatedDevelopmentAllowed()) {
      next();
      return;
    }
    res.status(503).json({ error: "auth_not_configured" });
    return;
  }

  const header = req.header("authorization") ?? "";
  const expected = `Bearer ${configured}`;
  if (!safeEqual(header, expected)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}
