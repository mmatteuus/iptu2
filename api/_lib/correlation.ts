import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const HEADER_NAME = "x-correlation-id";

export function ensureCorrelationId(req: VercelRequest, res: VercelResponse): string {
  const rawHeader = req.headers[HEADER_NAME];
  const id = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const correlationId = typeof id === "string" && id.trim().length > 0 ? id : crypto.randomUUID();

  res.setHeader(HEADER_NAME, correlationId);
  return correlationId;
}

