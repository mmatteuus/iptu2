import { getProdataToken, invalidateProdataToken } from "../_auth";
import { logDebug, logWarn } from "./logger";

const API_BASE = (process.env.PRODATA_API_BASE ?? "https://araguaina.prodataweb.inf.br/sigintegracaorest").replace(
  /\/$/,
  ""
);

type ProdataInit = RequestInit & {
  correlationId?: string;
};

function buildUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

async function performFetch(path: string, init: ProdataInit, forceRefresh: boolean) {
  const correlationId = init.correlationId;
  const token = await getProdataToken({ forceRefresh, correlationId });
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  return fetch(buildUrl(path), {
    ...init,
    headers
  });
}

export async function prodataFetch(path: string, init: ProdataInit = {}) {
  try {
    let response = await performFetch(path, init, false);
    if (response.status === 401) {
      logWarn("[prodataFetch] token expirado, tentando renovar", { correlationId: init.correlationId });
      invalidateProdataToken();
      response = await performFetch(path, init, true);
    }
    return response;
  } catch (error) {
    invalidateProdataToken();
    logDebug("[prodataFetch] erro na chamada", { correlationId: init.correlationId });
    throw error;
  }
}

export async function prodataJson<T = unknown>(path: string, init: ProdataInit = {}): Promise<T> {
  const response = await prodataFetch(path, init);
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson && text ? JSON.parse(text) : text;

  if (!response.ok) {
    const error = new Error(`Falha na API Prodata (${response.status})`);
    (error as Error & { payload?: unknown }).payload = payload;
    throw error;
  }

  return payload as T;
}
