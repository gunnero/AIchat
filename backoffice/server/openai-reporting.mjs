import { z } from "zod";

// Reporting credentials are used only for these fixed, read-only endpoints.
const base = "https://api.openai.com/v1/organization/";
const count = z.number().int().nonnegative().safe();
const project = z
  .string()
  .regex(/^proj_[A-Za-z0-9_-]{3,100}$/)
  .nullable()
  .optional();
const costs = z.object({
  object: z.literal("organization.costs.result"),
  project_id: project,
  amount: z.object({ currency: z.literal("usd"), value: z.number().finite() }),
});
const usage = z.object({
  object: z.literal("organization.usage.completions.result"),
  project_id: project,
  input_tokens: count,
  output_tokens: count,
  num_model_requests: count,
});
export class ReportingError extends Error {
  constructor(code) {
    super("OpenAI reporting unavailable");
    this.code = code;
  }
}
function units(value) {
  const [, sign, whole, fraction = "", exponent = "0"] =
    /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));
  let n = BigInt(whole + fraction),
    shift = 12 + Number(exponent) - fraction.length;
  if (shift >= 0) n *= 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    n = (n + divisor / 2n) / divisor;
  }
  return sign ? -n : n;
}
function dollars(value) {
  const sign = value < 0n ? "-" : "",
    n = value < 0n ? -value : value;
  const fraction = (n % 1000000000000n)
    .toString()
    .padStart(12, "0")
    .replace(/0+$/, "");
  return (
    sign + (n / 1000000000000n).toString() + (fraction ? "." + fraction : "")
  );
}
async function readPage(response) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new ReportingError(
      response.status === 401
        ? "invalid"
        : response.status === 403
          ? "restricted"
          : response.status === 429
            ? "rate_limited"
            : "unavailable",
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ReportingError("invalid_report");
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4 * 1024 * 1024) throw new ReportingError("report_too_large");
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function readOpenAIReport(apiKey, start, end, fetcher = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  timeout.unref?.();
  const projects = new Map(),
    days = new Map();
  const empty = () => ({
    cost: 0n,
    inputTokens: 0,
    outputTokens: 0,
    requests: 0,
  });
  const total = empty();
  let records = 0;
  async function collect(path, schema) {
    let cursor;
    const cursors = new Set(),
      buckets = new Set();
    for (let page = 0; page < 12; page++) {
      const url = new URL(base + path);
      url.search = new URLSearchParams({
        start_time: String(start),
        end_time: String(end),
        bucket_width: "1d",
        limit: "31",
        "group_by[]": "project_id",
        ...(cursor ? { page: cursor } : {}),
      }).toString();
      const response = await fetcher(url.href, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        redirect: "error",
        signal: controller.signal,
      });
      const data = z
        .object({
          object: z.literal("page"),
          has_more: z.boolean(),
          next_page: z.string().max(2000).nullable().optional(),
          data: z
            .array(
              z.object({
                start_time: count,
                end_time: count,
                results: z.array(schema),
              }),
            )
            .max(31),
        })
        .parse(await readPage(response));
      for (const bucket of data.data) {
        if (
          bucket.start_time < start ||
          bucket.start_time >= end ||
          bucket.end_time <= bucket.start_time ||
          buckets.has(bucket.start_time)
        )
          throw new ReportingError("invalid_report");
        buckets.add(bucket.start_time);
        const day = new Date(bucket.start_time * 1000)
          .toISOString()
          .slice(0, 10);
        for (const result of bucket.results) {
          if (++records > 50000) throw new ReportingError("report_too_large");
          const key = result.project_id || null;
          if (!projects.has(key)) projects.set(key, empty());
          if (!days.has(day)) days.set(day, empty());
          for (const row of [total, projects.get(key), days.get(day)]) {
            if (path === "costs") row.cost += units(result.amount.value);
            else {
              row.inputTokens += result.input_tokens;
              row.outputTokens += result.output_tokens;
              row.requests += result.num_model_requests;
              if (
                ![
                  row.inputTokens,
                  row.outputTokens,
                  row.requests,
                  row.inputTokens + row.outputTokens,
                ].every(Number.isSafeInteger)
              )
                throw new ReportingError("report_too_large");
            }
          }
        }
      }
      if (!data.has_more) return;
      if (!data.next_page || cursors.has(data.next_page))
        throw new ReportingError("invalid_report");
      cursors.add(data.next_page);
      cursor = data.next_page;
    }
    throw new ReportingError("report_too_large");
  }
  try {
    await Promise.all([
      collect("costs", costs),
      collect("usage/completions", usage),
    ]);
    const dto = (row) => ({
      costUsd: dollars(row.cost),
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      requests: row.requests,
    });
    return {
      start,
      end,
      currency: "usd",
      totals: dto(total),
      projects: [...projects].map(([projectRef, row]) => ({
        projectRef,
        ...dto(row),
      })),
      days: [...days]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, row]) => ({ day, ...dto(row) })),
    };
  } catch (error) {
    controller.abort();
    throw error instanceof ReportingError
      ? error
      : new ReportingError("unavailable");
  } finally {
    clearTimeout(timeout);
  }
}
