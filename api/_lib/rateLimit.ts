import type { VercelRequest, VercelResponse } from "@vercel/node";

type WindowCounter = {
  count: number;
  expiresAt: number;
};

type RateLimitConfig = {
  name: string;
  limit: number;
  windowMs: number;
  header?: string;
};

const store = new Map<string, WindowCounter>();

const IP_LIMIT: RateLimitConfig = {
  name: "ip",
  limit: Number(process.env.RATE_LIMIT_IP) || 60,
  windowMs: Number(process.env.RATE_LIMIT_IP_WINDOW_MS) || 60_000
};

const CRITICAL_LIMIT: RateLimitConfig = {
  name: "critical",
  limit: Number(process.env.RATE_LIMIT_CRITICAL) || 10,
  windowMs: Number(process.env.RATE_LIMIT_CRITICAL_WINDOW_MS) || 60_000
};

function getClientIp(req: VercelRequest) {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded)) return forwarded[0] ?? req.socket.remoteAddress ?? "unknown";
  return (forwarded ?? req.socket.remoteAddress ?? "unknown").split(",")[0].trim();
}

function getSessionId(req: VercelRequest) {
  const raw = req.headers["x-session-id"];
  return Array.isArray(raw) ? raw[0] : raw;
}

function registerHit(key: string, config: RateLimitConfig) {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.expiresAt <= now) {
    const fresh: WindowCounter = {
      count: 1,
      expiresAt: now + config.windowMs
    };
    store.set(key, fresh);
    return { allowed: true, remaining: config.limit - 1, reset: fresh.expiresAt };
  }

  existing.count += 1;
  store.set(key, existing);

  const remaining = config.limit - existing.count;
  return { allowed: existing.count <= config.limit, remaining, reset: existing.expiresAt };
}

type RateLimitOptions = {
  route: string;
  critical?: boolean;
};

export function enforceRateLimit(req: VercelRequest, res: VercelResponse, options: RateLimitOptions) {
  const ip = getClientIp(req);

  const ipResult = registerHit(`ip:${ip}`, IP_LIMIT);

  if (!ipResult.allowed) {
    res.setHeader("Retry-After", Math.ceil((ipResult.reset - Date.now()) / 1000));
    return { allowed: false, reason: "RATE_LIMIT_IP" as const };
  }

  if (options.critical) {
    const sessionId = getSessionId(req) ?? ip;
    const criticalKey = `critical:${options.route}:${sessionId}`;
    const criticalResult = registerHit(criticalKey, CRITICAL_LIMIT);
    if (!criticalResult.allowed) {
      res.setHeader("Retry-After", Math.ceil((criticalResult.reset - Date.now()) / 1000));
      return { allowed: false, reason: "RATE_LIMIT_CRITICAL" as const };
    }
  }

  return { allowed: true } as const;
}

