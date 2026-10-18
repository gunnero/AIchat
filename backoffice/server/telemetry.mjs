import { writeFile, rename } from "node:fs/promises";
import { join } from "node:path";

const bounds = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000, Infinity];
export function createTelemetry(now = Date.now) {
  const buckets = new Map();
  const prune = () => {
    const cutoff = Math.floor(now() / 60000) - 14;
    for (const minute of buckets.keys())
      if (minute < cutoff) buckets.delete(minute);
  };
  return {
    record(status, duration) {
      prune();
      const minute = Math.floor(now() / 60000);
      const b = buckets.get(minute) || {
        requests: 0,
        serverErrors: 0,
        limited: 0,
        histogram: bounds.map(() => 0),
      };
      b.requests++;
      if (status >= 500) b.serverErrors++;
      if (status === 429) b.limited++;
      b.histogram[bounds.findIndex((limit) => duration <= limit)]++;
      buckets.set(minute, b);
    },
    snapshot() {
      prune();
      const sum = {
        requests: 0,
        serverErrors: 0,
        limited: 0,
        histogram: bounds.map(() => 0),
      };
      for (const b of buckets.values()) {
        for (const k of ["requests", "serverErrors", "limited"]) sum[k] += b[k];
        b.histogram.forEach((n, i) => (sum.histogram[i] += n));
      }
      const quantile = (q) => {
        if (!sum.requests) return null;
        let count = 0;
        const i = sum.histogram.findIndex((n) => {
          count += n;
          return count >= Math.ceil(sum.requests * q);
        });
        return Number.isFinite(bounds[i]) ? bounds[i] : null;
      };
      return {
        version: 1,
        updatedAt: now(),
        windowMinutes: 15,
        requests: sum.requests,
        serverErrors: sum.serverErrors,
        limited: sum.limited,
        p50UpperBoundMs: quantile(0.5),
        p95UpperBoundMs: quantile(0.95),
      };
    },
  };
}
export async function writeTelemetry(state, metrics) {
  const path = join(state, "metrics.json");
  await writeFile(path + ".next", JSON.stringify(metrics.snapshot()) + "\n", {
    mode: 0o600,
  });
  await rename(path + ".next", path);
}
