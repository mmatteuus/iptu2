import process from "node:process";

const SENSITIVE_KEYWORDS = [
  "cpf",
  "cnpj",
  "document",
  "documento",
  "doc",
  "inscricao",
  "inscrição",
  "cci",
  "ccp",
  "duam",
  "token",
  "authorization",
  "password",
  "senha",
  "secret",
  "bearer"
];

type LogLevel = "info" | "warn" | "error" | "debug";

function hasSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEYWORDS.some((item) => normalized.includes(item));
}

function maskDigits(value: string): string {
  return value.replace(/\d/g, "*");
}

function maskDocumentsInString(value: string): string {
  return value.replace(/\b\d{5,}\b/g, (match) => maskDigits(match));
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (typeof value === "string") {
    return hasSensitiveKey(key) ? maskDigits(value) : maskDocumentsInString(value);
  }

  if (typeof value === "number") {
    return hasSensitiveKey(key) ? maskDigits(String(value)) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(`${key}[${index}]`, item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitizeValue(k, v)])
    );
  }

  return value;
}

function sanitizeMeta(meta?: Record<string, unknown>) {
  if (!meta) return undefined;
  return Object.fromEntries(Object.entries(meta).map(([key, value]) => [key, sanitizeValue(key, value)]));
}

function writeLog(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const sanitizedMeta = sanitizeMeta(meta);
  const entry: Record<string, unknown> = {
    level,
    message,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? "development"
  };

  if (sanitizedMeta && Object.keys(sanitizedMeta).length > 0) {
    entry.meta = sanitizedMeta;
  }

  const output = JSON.stringify(entry);

  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export function logInfo(message: string, meta?: Record<string, unknown>) {
  writeLog("info", message, meta);
}

export function logWarn(message: string, meta?: Record<string, unknown>) {
  writeLog("warn", message, meta);
}

export function logError(message: string, meta?: Record<string, unknown>) {
  writeLog("error", message, meta);
}

export function logDebug(message: string, meta?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  writeLog("debug", message, meta);
}

