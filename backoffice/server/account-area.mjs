import { randomUUID } from "node:crypto";
import { z } from "zod";
import { asyncTransaction as transaction } from "./database.mjs";

export async function workspaceId(db, account) {
  if (account.role === "customer") return account.customer_id;
  return (
    (
      await db
        .prepare("SELECT customer_id FROM admin_workspaces WHERE account_id=?")
        .get(account.id)
    )?.customer_id || null
  );
}
export async function workspaceSettings(db, account) {
  const id = await workspaceId(db, account);
  const c =
    id &&
    (await db
      .prepare("SELECT allowance,expires FROM customers WHERE id=?")
      .get(id));
  return {
    allowance: c?.allowance ?? 0,
    expires: c?.expires ?? null,
    assignments: id
      ? await db
          .prepare(
            "SELECT project_id AS projectId,version_id AS versionId FROM assignments WHERE customer_id=?",
          )
          .all(id)
      : [],
  };
}
export function installAccountArea(
  app,
  { fail, fresh, stillAuthorized, stamp, audit },
) {
  const db = app.db;
  app.get("/api/account", async (r) => {
    const account = await db
      .prepare("SELECT * FROM admins WHERE id=?")
      .get(r.adminId);
    const profile = await db
      .prepare("SELECT display_name FROM account_profiles WHERE account_id=?")
      .get(account.id);
    const workspace = await workspaceSettings(db, account);
    const id = await workspaceId(db, account);
    const projects = id
      ? await db
          .prepare(
            "SELECT projects.id,projects.name FROM assignments JOIN projects ON projects.id=assignments.project_id WHERE customer_id=? AND projects.enabled=1 ORDER BY projects.name",
          )
          .all(id)
      : [];
    return {
      id: account.id,
      name: profile?.display_name || account.name,
      email: account.email,
      username: account.username,
      role: account.role === "admin" ? "Admin" : "Customer",
      allowance: workspace.allowance,
      expires: workspace.expires,
      projects,
      usageAvailable: false,
      billingAvailable: false,
    };
  });
  app.put("/api/account/profile", async (r) => {
    const { name } = z
      .object({ name: z.string().trim().min(1).max(100) })
      .strict()
      .parse(r.body);
    await transaction(db, async () => {
      await stillAuthorized(r);
      // A personal display name is separate from the protected owner's identity.
      await db
        .prepare(
          "INSERT INTO account_profiles VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET display_name=excluded.display_name,updated_at=excluded.updated_at",
        )
        .run(r.adminId, name, stamp());
      await audit(r.adminId, "account.profile_updated", r.adminId);
    });
    return { id: r.adminId, name };
  });
  app.put("/backoffice/api/staff/:id/workspace", async (r) => {
    fresh(r);
    const id = z.uuid().parse(r.params.id);
    const input = z
      .object({
        allowance: z.int().min(0).max(1000000),
        assignments: z
          .array(
            z.object({ projectId: z.uuid(), versionId: z.uuid() }).strict(),
          )
          .max(100),
      })
      .strict()
      .parse(r.body);
    if (
      new Set(input.assignments.map((a) => a.projectId)).size !==
      input.assignments.length
    )
      fail(400, "Vælg kun én promptversion pr. projekt.");
    await transaction(db, async () => {
      await stillAuthorized(r);
      const account = await db
        .prepare("SELECT * FROM admins WHERE id=?")
        .get(id);
      if (!account || account.role !== "admin")
        fail(404, "Kontoen findes ikke.");
      if (account.protected && account.id !== r.adminId)
        fail(403, "Kontoen kan ikke ændres.");
      let customerId = await workspaceId(db, account);
      if (!customerId) {
        customerId = randomUUID();
        // Never attach staff to an existing customer's identity/history.
        await db
          .prepare("INSERT INTO customers VALUES(?,?,?,'active',NULL,?,?,?)")
          .run(
            customerId,
            account.name,
            account.email,
            input.allowance,
            stamp(),
            stamp(),
          );
        await db
          .prepare("INSERT INTO admin_workspaces VALUES(?,?)")
          .run(id, customerId);
      } else {
        await db
          .prepare("UPDATE customers SET allowance=?,updated_at=? WHERE id=?")
          .run(input.allowance, stamp(), customerId);
      }
      await db
        .prepare("DELETE FROM assignments WHERE customer_id=?")
        .run(customerId);
      for (const a of input.assignments)
        await db
          .prepare("INSERT INTO assignments VALUES(?,?,?)")
          .run(customerId, a.projectId, a.versionId);
      await audit(r.adminId, "staff.workspace_updated", id);
    });
    return { id };
  });
}
