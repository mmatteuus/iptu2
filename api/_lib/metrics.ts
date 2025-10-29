import { logWarn } from "./logger";

type MetricEntry = {
  total: number;
  errors: number;
  durations: number[];
  lastAlarm?: number;
};

const MAX_SAMPLES = 200;
const ALARM_COOLDOWN_MS = 5 * 60_000;

const metrics = new Map<string, MetricEntry>();

function calculateP95(samples: number[]) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length));
  return sorted[index];
}

export function recordMetric(route: string, durationMs: number, ok: boolean) {
  const entry = metrics.get(route) ?? { total: 0, errors: 0, durations: [] };
  entry.total += 1;
  if (!ok) entry.errors += 1;
  entry.durations.push(durationMs);
  if (entry.durations.length > MAX_SAMPLES) entry.durations.splice(0, entry.durations.length - MAX_SAMPLES);
  metrics.set(route, entry);

  const errorRate = entry.total > 0 ? entry.errors / entry.total : 0;
  const p95 = calculateP95(entry.durations);
  const now = Date.now();

  const shouldWarnError = errorRate >= 0.02;
  const shouldWarnLatency = p95 > 2000;
  const lastAlarm = entry.lastAlarm ?? 0;
  const cooldownExpired = now - lastAlarm > ALARM_COOLDOWN_MS;

  if ((shouldWarnError || shouldWarnLatency) && cooldownExpired) {
    const reasons = [];
    if (shouldWarnError) reasons.push(`erro ${(errorRate * 100).toFixed(2)}%`);
    if (shouldWarnLatency) reasons.push(`p95 ${p95.toFixed(0)}ms`);
    logWarn("[metrics] alerta", { route, reasons });
    entry.lastAlarm = now;
  }
}

export function getMetricsSnapshot() {
  return Array.from(metrics.entries()).map(([route, entry]) => {
    const p95 = calculateP95(entry.durations);
    return {
      route,
      total: entry.total,
      errors: entry.errors,
      errorRate: entry.total > 0 ? entry.errors / entry.total : 0,
      p95
    };
  });
}

