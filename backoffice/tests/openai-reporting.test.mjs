import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readOpenAIReport,
  ReportingError,
} from "../server/openai-reporting.mjs";
const key = "sk-admin-synthetic-reporting-test-never-live";
const start = Date.UTC(2026, 9, 1) / 1000,
  end = start + 2 * 86400;
const cost = (value, project_id = "proj_synthetic") => ({
  object: "organization.costs.result",
  project_id,
  amount: { currency: "usd", value },
});
const usage = (project_id = "proj_synthetic") => ({
  object: "organization.usage.completions.result",
  project_id,
  input_tokens: 2000,
  output_tokens: 600,
  input_cached_tokens: 500,
  num_model_requests: 3,
});
const page = (results, day = start, more = false, cursor = null) => ({
  object: "page",
  data: [{ object: "bucket", start_time: day, end_time: day + 86400, results }],
  has_more: more,
  next_page: cursor,
});
const response = (value) =>
  new Response(JSON.stringify(value), { status: 200 });

test("OpenAI reporting follows fixed GET endpoints and complete pagination, includes unallocated charges/credits and counts cached tokens once", async () => {
  const calls = [];
  const report = await readOpenAIReport(
    key,
    start,
    end,
    async (url, options) => {
      calls.push(new URL(url));
      const u = new URL(url);
      assert.equal(u.origin, "https://api.openai.com");
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "error");
      assert.deepEqual(options.headers, { Authorization: "Bearer " + key });
      assert.equal(u.searchParams.get("group_by[]"), "project_id");
      assert.equal(u.searchParams.get("end_time"), String(end));
      if (u.pathname.endsWith("/completions")) return response(page([usage()]));
      return response(
        u.searchParams.has("page")
          ? page([cost(-0.01, null)], start + 86400)
          : page([cost(0.1), cost(0.2)], start, true, "next-page"),
      );
    },
  );
  assert.equal(calls.length, 3);
  assert.deepEqual(report.totals, {
    costUsd: "0.29",
    inputTokens: 2000,
    outputTokens: 600,
    requests: 3,
  });
  assert.equal(
    report.projects.find((p) => p.projectRef === null).costUsd,
    "-0.01",
  );
  assert.equal(
    report.projects.find((p) => p.projectRef === "proj_synthetic").costUsd,
    "0.3",
  );
  assert.equal(report.days.length, 2);
});

for (const [status, code] of [
  [401, "invalid"],
  [403, "restricted"],
  [429, "rate_limited"],
  [500, "unavailable"],
])
  test(`OpenAI reporting suppresses provider error bodies (${status})`, async () => {
    let cancelled = 0;
    await assert.rejects(
      readOpenAIReport(key, start, end, async () => ({
        ok: false,
        status,
        body: {
          cancel: async () => {
            cancelled++;
          },
          getReader: () => {
            throw new Error("Private provider body must not be read");
          },
        },
      })),
      (e) =>
        e instanceof ReportingError &&
        e.code === code &&
        !e.message.includes(key),
    );
    assert.ok(cancelled > 0);
  });

test("OpenAI reporting rejects incomplete pages, cursor loops, unknown currency, invalid project IDs and unsafe counters without returning partial totals", async () => {
  for (const broken of [
    { ...page([cost(1)], start, true), next_page: null },
    { ...page([cost(1)], start, true), next_page: "loop" },
    page([{ ...cost(1), amount: { currency: "eur", value: 1 } }]),
    page([cost(1, key)]),
    page([cost(1)], start - 86400),
  ])
    await assert.rejects(
      readOpenAIReport(key, start, end, async (url) =>
        response(url.includes("/completions") ? page([]) : broken),
      ),
      ReportingError,
    );
  await assert.rejects(
    readOpenAIReport(key, start, end, async (url) =>
      response(
        url.includes("/completions")
          ? page([
              {
                ...usage(),
                input_tokens: Number.MAX_SAFE_INTEGER,
                output_tokens: 1,
              },
            ])
          : page([]),
      ),
    ),
    ReportingError,
  );
});

test("OpenAI reporting bounds response size and suppresses network/JSON failures", async () => {
  for (const fetcher of [
    async () => {
      throw new Error("sensitive upstream detail " + key);
    },
    async () => new Response("not json"),
    async () => new Response(" ".repeat(4 * 1024 * 1024 + 1)),
  ])
    await assert.rejects(
      readOpenAIReport(key, start, end, fetcher),
      (e) => e instanceof ReportingError && !e.message.includes(key),
    );
});

test("OpenAI reporting preserves sub-cent values without binary floating-point accumulation", async () => {
  const report = await readOpenAIReport(key, start, end, async (url) =>
    response(
      page(
        url.includes("/completions") ? [] : [cost(0.0000001), cost(0.0000002)],
      ),
    ),
  );
  assert.equal(report.totals.costUsd, "0.0000003");
});
