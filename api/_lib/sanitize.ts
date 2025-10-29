export function sanitizeDigits(value?: string | number | null) {
  if (value === undefined || value === null) return "";
  return value.toString().replace(/\D/g, "");
}

export function sanitizeString(value?: string | number | null) {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.toString().trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function pickFirstValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const raw = source[key];
    const result = sanitizeString(raw);
    if (result) return result;
  }
  return undefined;
}

export function ensureArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const container = value as Record<string, unknown>;
    for (const key of ["imoveis", "dados", "content", "lista", "items"]) {
      const maybe = container[key];
      if (Array.isArray(maybe)) return maybe;
    }
    return [container];
  }
  return [];
}

