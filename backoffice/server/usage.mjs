import { z } from "zod";
import { seal, unseal } from "./security.mjs";
import { asyncTransaction as transaction } from "./database.mjs";
import { readOpenAIReport } from "./openai-reporting.mjs";

const P = "/backoffice/api/usage";
const input = z
  .object({
    label: z.string().trim().min(1).max(80),
    apiKey: z
      .string()
      .trim()
      .min(25)
      .max(512)
      .regex(/^sk-[A-Za-z0-9_-]+$/),
    revision: z.int().min(0),
  })
  .strict();
const connectionDto = (row) =>
  row?.key_secret
    ? {
        label: row.label,
        suffix: row.suffix,
        revision: row.revision,
        updatedAt: row.updated_at,
      }
    : null;
export function installUsage(
  app,
  {
    fail,
    fresh,
    stillAuthorized,
    clock,
    stamp,
    audit,
    vaultKey,
    reportReader = readOpenAIReport,
  },
) {
  const db = app.db;
  const connection = () =>
    db.prepare("SELECT * FROM usage_reporting WHERE singleton=1").get();
  async function providerReport(key, start, end) {
    try {
      return await reportReader(key, start, end);
    } catch (error) {
      fail(
        502,
        error.code === "invalid"
          ? "Rapporteringsnøglen blev afvist. Den eksisterende forbindelse er bevaret."
          : error.code === "restricted"
            ? "Nøglen mangler adgang til OpenAI Usage og Costs. Brug en Admin API-nøgle."
            : error.code === "rate_limited"
              ? "OpenAI begrænser rapporteringen midlertidigt. Prøv igen senere."
              : "OpenAI-rapporten kunne ikke hentes fuldstændigt. Prøv igen. Ingen delvise totaler vises.",
      );
    }
  }
  const overview = async () => {
    const rows = await db
      .prepare(
        "SELECT c.id,c.name,c.email,c.status,c.expires,c.allowance,a.id AS account_id,a.username,a.status AS account_status,COALESCE(p.display_name,a.name,c.name) AS display_name,CASE WHEN w.account_id IS NULL THEN 'Customer' ELSE 'Admin' END AS role FROM customers c LEFT JOIN admin_workspaces w ON w.customer_id=c.id LEFT JOIN admins a ON a.id=w.account_id OR a.customer_id=c.id LEFT JOIN account_profiles p ON p.account_id=a.id ORDER BY c.name,c.id",
      )
      .all();
    rows.push(
      ...(await db
        .prepare(
          "SELECT a.id,a.name,a.email,a.status,NULL AS expires,0 AS allowance,a.id AS account_id,a.username,a.status AS account_status,COALESCE(p.display_name,a.name) AS display_name,'Admin' AS role FROM admins a LEFT JOIN account_profiles p ON p.account_id=a.id WHERE a.role='admin' AND NOT EXISTS(SELECT 1 FROM admin_workspaces w WHERE w.account_id=a.id) ORDER BY a.name,a.id",
        )
        .all()),
    );
    const assigned = await db
      .prepare(
        "SELECT a.customer_id,p.id,p.name,p.enabled FROM assignments a JOIN projects p ON p.id=a.project_id ORDER BY p.name",
      )
      .all();
    const byOwner = new Map();
    for (const row of assigned) {
      if (!byOwner.has(row.customer_id)) byOwner.set(row.customer_id, []);
      byOwner
        .get(row.customer_id)
        .push({ id: row.id, name: row.name, enabled: !!row.enabled });
    }
    const c = await connection();
    return {
      asOf: stamp(),
      appTrackingEnabled: false,
      allowanceUnit: "responses",
      connection: connectionDto(c),
      connectionRevision: c?.revision || 0,
      accounts: rows.map((row) => ({
        id: row.id,
        accountId: row.account_id || null,
        name: row.display_name,
        email: row.email,
        username: row.username || null,
        role: row.role,
        status: row.account_status === "paused" ? "paused" : row.status,
        expires: row.expires,
        allowance: row.allowance,
        projects: byOwner.get(row.id) || [],
      })),
      totalAllowance: rows.reduce((n, row) => n + row.allowance, 0),
    };
  };
  app.get(P, () =>
    db.dialect === "postgres"
      ? db.transaction(overview, { shared: true })
      : transaction(db, overview),
  );
  app.post(P + "/connection", async (r) => {
    fresh(r);
    const v = input.parse(r.body);
    if (v.apiKey.startsWith("sk-proj-"))
      fail(
        400,
        "Brug en OpenAI Admin API-nøgle til rapportering, ikke en projektnøgle.",
      );
    const previous = await connection();
    if ((previous?.revision || 0) !== v.revision)
      fail(409, "Rapporteringsforbindelsen er ændret. Genindlæs siden.");
    const today = Math.floor(clock() / 86400000) * 86400;
    await providerReport(v.apiKey, today - 86400, today);
    await stillAuthorized(r);
    fresh(r);
    await transaction(db, async () => {
      await stillAuthorized(r);
      fresh(r);
      if (((await connection())?.revision || 0) !== v.revision)
        fail(409, "Rapporteringsforbindelsen er ændret. Genindlæs siden.");
      await db
        .prepare(
          "INSERT INTO usage_reporting VALUES(1,?,?,?,?,?) ON CONFLICT(singleton) DO UPDATE SET label=excluded.label,key_secret=excluded.key_secret,suffix=excluded.suffix,revision=excluded.revision,updated_at=excluded.updated_at",
        )
        .run(
          v.label,
          seal(vaultKey, v.apiKey, "usage-reporting:1"),
          v.apiKey.slice(-4),
          v.revision + 1,
          stamp(),
        );
      await audit(r.adminId, "usage.reporting_saved", "reporting");
    });
    return { ok: true };
  });
  app.delete(P + "/connection", async (r) => {
    fresh(r);
    const { revision } = z
      .object({ revision: z.int().min(1) })
      .strict()
      .parse(r.body);
    await transaction(db, async () => {
      await stillAuthorized(r);
      fresh(r);
      if ((await connection())?.revision !== revision)
        fail(409, "Rapporteringsforbindelsen er ændret. Genindlæs siden.");
      await db
        .prepare(
          "UPDATE usage_reporting SET key_secret=NULL,suffix=NULL,revision=revision+1,updated_at=? WHERE singleton=1",
        )
        .run(stamp());
      await audit(r.adminId, "usage.reporting_removed", "reporting");
    });
    return { ok: true };
  });
  app.get(P + "/openai", async (r) => {
    const { month } = z
      .object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })
      .strict()
      .parse(r.query);
    const start = Date.parse(month + "-01T00:00:00Z") / 1000;
    const now = Math.floor(clock() / 1000),
      date = new Date(start * 1000);
    const oldest = new Date(clock());
    oldest.setUTCMonth(oldest.getUTCMonth() - 23, 1);
    oldest.setUTCHours(0, 0, 0, 0);
    if (start >= now || start < oldest.getTime() / 1000)
      fail(400, "Vælg en måned inden for de seneste 24 måneder.");
    const end = Math.min(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 1000,
      now,
    );
    const c = await connection();
    if (!c?.key_secret) fail(409, "Tilslut OpenAI-rapportering først.");
    const report = await providerReport(
      unseal(vaultKey, c.key_secret, "usage-reporting:1"),
      start,
      end,
    );
    await stillAuthorized(r);
    if ((await connection())?.revision !== c.revision)
      fail(409, "Rapporteringsforbindelsen er ændret. Genindlæs siden.");
    const local = await db
      .prepare(
        "SELECT p.id,p.name,c.project_ref FROM projects p JOIN connections c ON c.id=p.connection_id",
      )
      .all();
    return {
      ...report,
      month,
      connectionRevision: c.revision,
      fetchedAt: stamp(),
      projects: report.projects.map((p) => ({
        ...p,
        appProjects: local
          .filter((l) => l.project_ref === p.projectRef)
          .map((l) => ({ id: l.id, name: l.name })),
      })),
    };
  });
}
