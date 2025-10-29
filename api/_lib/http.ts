import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ensureCorrelationId } from "./correlation";
import { recordMetric } from "./metrics";
import { enforceRateLimit } from "./rateLimit";
import { logError, logInfo, logWarn } from "./logger";

type HandlerContext = {
  req: VercelRequest;
  res: VercelResponse;
  correlationId: string;
};

type ApiHandler = (ctx: HandlerContext) => Promise<void>;

type HandlerOptions = {
  route: string;
  methods: Array<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">;
  critical?: boolean;
};

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173"];

function normalizeOrigins(raw: string | undefined) {
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const ALLOWED_ORIGINS = normalizeOrigins(process.env.API_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS);

function originAllowed(origin: string | undefined) {
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

function applyCors(req: VercelRequest, res: VercelResponse) {
  const originHeader = req.headers.origin as string | undefined;

  if (originHeader && originAllowed(originHeader)) {
    res.setHeader("Access-Control-Allow-Origin", originHeader);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-session-id,x-correlation-id");
}

function methodAllowed(req: VercelRequest, methods: HandlerOptions["methods"]) {
  return req.method ? methods.includes(req.method as HandlerOptions["methods"][number]) : false;
}

export function createHandler(options: HandlerOptions, handler: ApiHandler) {
  return async function wrappedHandler(req: VercelRequest, res: VercelResponse) {
    applyCors(req, res);

    const correlationId = ensureCorrelationId(req, res);
    const route = options.route;

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    if (!methodAllowed(req, options.methods)) {
      res.setHeader("Allow", options.methods.join(","));
      res.status(405).json({ message: "Metodo nao suportado", correlationId });
      recordMetric(route, 0, false);
      return;
    }

    const originHeader = req.headers.origin as string | undefined;
    if (originHeader && !originAllowed(originHeader)) {
      logWarn("[cors] origem bloqueada", { correlationId, originHeader });
      res.status(403).json({ message: "Origem nao autorizada", correlationId });
      recordMetric(route, 0, false);
      return;
    }

    const rateResult = enforceRateLimit(req, res, { route, critical: options.critical });
    if (!rateResult.allowed) {
      logWarn("[rate-limit] bloqueio aplicado", { correlationId, route, reason: rateResult.reason });
      res.status(429).json({ message: "Muitas requisicoes. Aguarde e tente novamente.", correlationId });
      recordMetric(route, 0, false);
      return;
    }

    const start = Date.now();
    try {
      await handler({ req, res, correlationId });
      const duration = Date.now() - start;
      recordMetric(route, duration, res.statusCode < 400);
      logInfo("[api] requisicao finalizada", { correlationId, route, statusCode: res.statusCode, duration });
    } catch (error) {
      const duration = Date.now() - start;
      recordMetric(route, duration, false);
      logError("[api] erro inesperado", { correlationId, route, error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ message: "Erro interno. Tente novamente mais tarde.", correlationId });
    }
  };
}

export async function readJsonBody<T = unknown>(req: VercelRequest): Promise<T> {
  const raw = req.body;
  if (typeof raw === "object" && raw !== null) return raw as T;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return JSON.parse(raw) as T;
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.length === 0) return {} as T;
  return JSON.parse(buffer.toString("utf-8")) as T;
}
