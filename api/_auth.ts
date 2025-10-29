import process from "node:process";
import { logDebug, logError, logInfo } from "./_lib/logger";

type TokenCache = {
  token?: string;
  expiresAt?: number; // absolute timestamp in ms
  refreshing?: Promise<string>;
};

const cache: TokenCache = {};

const API_BASE = (process.env.PRODATA_API_BASE ?? "https://araguaina.prodataweb.inf.br/sigintegracaorest").replace(
  /\/$/,
  ""
);

const AUTH_USER = process.env.PRODATA_USER;
const AUTH_PASSWORD = process.env.PRODATA_PASSWORD;

const REFRESH_THRESHOLD_MS = 60_000;
const DEFAULT_TTL_MS = 15 * 60_000;

type AuthResponse = {
  token?: string;
  accessToken?: string;
  access_token?: string;
  bearer?: string;
  expiresIn?: number | string;
  expires_in?: number | string;
  expiresAt?: number | string;
  dados?: {
    token?: string;
    expiresIn?: number | string;
  };
};

function resolveToken(response: AuthResponse) {
  const token =
    response.token ??
    response.accessToken ??
    response.access_token ??
    response.bearer ??
    response.dados?.token;

  if (!token) {
    throw new Error("Resposta de autenticacao sem token");
  }

  const expiresRaw =
    response.expiresIn ?? response.expires_in ?? response.expiresAt ?? response.dados?.expiresIn;

  const expiresInMs =
    typeof expiresRaw === "string"
      ? Number(expiresRaw) * 1000
      : typeof expiresRaw === "number"
        ? expiresRaw * 1000
        : undefined;

  const ttlMs = expiresInMs && expiresInMs > REFRESH_THRESHOLD_MS ? expiresInMs : DEFAULT_TTL_MS;

  return { token, ttlMs };
}

async function requestToken(correlationId?: string) {
  if (!AUTH_USER || !AUTH_PASSWORD) {
    throw new Error("Credenciais PRODATA_USER/PRODATA_PASSWORD nao configuradas.");
  }

  const endpoint = `${API_BASE}/autenticacao`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ usuario: AUTH_USER, senha: AUTH_PASSWORD })
  });

  if (!response.ok) {
    const text = await response.text();
    logError("[auth] falha ao autenticar", { status: response.status, correlationId });
    throw new Error(`Falha ao autenticar na API Prodata (${response.status}): ${text}`);
  }

  const data = (await response.json()) as AuthResponse;
  const { token, ttlMs } = resolveToken(data);

  logInfo("[auth] token renovado", { correlationId, ttlMs });
  return { token, ttlMs };
}

function isTokenValid() {
  if (!cache.token || !cache.expiresAt) return false;
  return cache.expiresAt - REFRESH_THRESHOLD_MS > Date.now();
}

export function invalidateProdataToken() {
  cache.token = undefined;
  cache.expiresAt = undefined;
  cache.refreshing = undefined;
}

export function hasProdataCredentials() {
  return Boolean(AUTH_USER && AUTH_PASSWORD);
}

export async function getProdataToken(options?: { forceRefresh?: boolean; correlationId?: string }) {
  const forceRefresh = options?.forceRefresh ?? false;
  const correlationId = options?.correlationId;

  if (!forceRefresh && isTokenValid()) {
    logDebug("[auth] token em cache valido", { correlationId });
    return cache.token as string;
  }

  if (!forceRefresh && cache.refreshing) {
    logDebug("[auth] aguardando renovacao em andamento", { correlationId });
    return cache.refreshing;
  }

  const refreshPromise = requestToken(correlationId)
    .then(({ token, ttlMs }) => {
      cache.token = token;
      cache.expiresAt = Date.now() + ttlMs;
      cache.refreshing = undefined;
      return token;
    })
    .catch((error) => {
      cache.refreshing = undefined;
      throw error;
    });

  cache.refreshing = refreshPromise;
  return refreshPromise;
}
