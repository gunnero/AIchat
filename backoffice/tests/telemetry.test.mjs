import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createTelemetry } from "../server/telemetry.mjs";
import { buildServer } from "../server/app.mjs";

test("operational metrics expire old buckets and report bounded latency quantiles", () => {
  let now = 100000000;
  const metrics = createTelemetry(() => now);
  metrics.record(200, 20);
  metrics.record(503, 350);
  metrics.record(429, 90);
  assert.deepEqual(metrics.snapshot(), {
    version: 1,
    updatedAt: now,
    windowMinutes: 15,
    requests: 3,
    serverErrors: 1,
    limited: 1,
    p50UpperBoundMs: 100,
    p95UpperBoundMs: 500,
  });
  now += 16 * 60000;
  assert.equal(metrics.snapshot().requests, 0);
  assert.equal(metrics.snapshot().p95UpperBoundMs, null);
});
test("real request telemetry records no URL, query, body, identifier or header", async (t) => {
  const telemetry = createTelemetry();
  const app = await buildServer({
    vaultKey: randomBytes(32),
    origin: "https://synthetic.example.test",
    telemetry,
  });
  t.after(() => app.close());
  await app.inject({
    url: "/api/customer/projects?search=PRIVATE_CANARY",
    headers: { "x-synthetic-private": "PRIVATE_CANARY" },
  });
  await app.inject({ url: "/PRIVATE_CANARY" });
  const result = telemetry.snapshot();
  assert.equal(result.requests, 2);
  assert.equal(result.serverErrors, 0);
  assert.ok(!JSON.stringify(result).includes("PRIVATE_CANARY"));
  assert.deepEqual(
    Object.keys(result).sort(),
    [
      "version",
      "updatedAt",
      "windowMinutes",
      "requests",
      "serverErrors",
      "limited",
      "p50UpperBoundMs",
      "p95UpperBoundMs",
    ].sort(),
  );
});
