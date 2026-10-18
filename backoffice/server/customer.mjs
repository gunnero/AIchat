import { randomUUID } from "node:crypto";
import { z } from "zod";
import { seal, unseal, digest } from "./security.mjs";

const base = "/api/customer/projects/:projectId/conversations";
const titleContext = (c) =>
  `chat-title:${c.customer_id}:${c.project_id}:${c.id}`;
const bodyContext = (m) =>
  `chat-message:${m.customer_id}:${m.project_id}:${m.conversation_id}:${m.id}`;
export function installCustomer(
  app,
  { db, vaultKey, fail, clock, deletionJournal = async () => {} },
) {
  const query = (sql, args = []) => db.query(sql, args).then((r) => r.rows);
  const run = (r, fn) =>
    db.transaction(
      async () => {
        const [{ customer }] = await query(
          "SELECT public.chat_customer() AS customer",
        );
        if (!customer) {
          if (r.session.role === "admin") {
            if (r.routeOptions.url === "/api/customer/projects")
              return { projects: [], aiEnabled: false };
            fail(404, "Samtalen findes ikke.");
          }
          fail(401, "Log ind for at fortsætte.");
        }
        return fn(customer);
      },
      { sessionHash: r.session.hash, shared: true },
    );
  async function project(r) {
    r.privateProject = z.uuid().parse(r.params.projectId);
    if (
      !(
        await query("SELECT public.chat_access($1) AS allowed", [
          r.privateProject,
        ])
      )[0].allowed
    )
      fail(404, "Samtalen findes ikke.");
  }
  async function conversation(r, lock = false) {
    await project(r);
    const id = z.uuid().parse(r.params.id);
    const [c] = await query(
      `SELECT *,public.chat_writable(project_id,version_id) AS writable FROM private.conversations WHERE id=$1 AND project_id=$2${lock ? " FOR UPDATE" : ""}`,
      [id, r.privateProject],
    );
    if (!c) fail(404, "Samtalen findes ikke.");
    return c;
  }
  const dto = (c) => ({
    id: c.id,
    projectId: c.project_id,
    title: unseal(vaultKey, c.title_secret, titleContext(c)),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    writable: c.writable,
  });
  const messageDto = (m) => ({
    id: m.id,
    requestId: m.request_id,
    sequence: m.sequence,
    role: "user",
    text: unseal(vaultKey, m.body_secret, bodyContext(m)),
    createdAt: m.created_at,
  });
  const cursorContext = (customer, project, q) =>
    `history-cursor:${customer}:${project}:${digest(q)}`;
  app.get("/api/customer/projects", async (r) =>
    run(r, async () => ({
      projects: await query(
        "SELECT id,name,description,color FROM public.chat_workspace_projects()",
      ),
      aiEnabled: false,
    })),
  );
  app.get(base, async (r) =>
    run(r, async (customer) => {
      await project(r);
      const {
        q = "",
        cursor,
        limit = 30,
      } = z
        .object({
          q: z.string().trim().max(100).optional(),
          cursor: z.string().max(2000).optional(),
          limit: z.coerce.number().int().min(1).max(50).optional(),
        })
        .strict()
        .parse(r.query);
      let after;
      if (cursor) {
        try {
          after = z
            .object({ time: z.number().int(), id: z.uuid() })
            .strict()
            .parse(
              JSON.parse(
                unseal(
                  vaultKey,
                  cursor,
                  cursorContext(customer, r.privateProject, q),
                ),
              ),
            );
        } catch {
          fail(400, "Anmodningen kunne ikke læses.");
        }
      }
      const matches = [];
      // Titles are decrypted only after RLS has scoped the candidate rows. No
      // plaintext title or body search index is persisted. Keyset pagination
      // traverses title candidates in bounded batches, not message contents.
      while (matches.length <= limit) {
        const rows = await query(
          `SELECT *,public.chat_writable(project_id,version_id) AS writable FROM private.conversations WHERE project_id=$1 ${after ? "AND (updated_at,id)<($2,$3)" : ""} ORDER BY updated_at DESC,id DESC LIMIT 100`,
          after ? [r.privateProject, after.time, after.id] : [r.privateProject],
        );
        if (!rows.length) break;
        for (const c of rows) {
          const item = dto(c);
          if (!q || item.title.toLowerCase().includes(q.toLowerCase()))
            matches.push(item);
          after = { time: c.updated_at, id: c.id };
          if (matches.length > limit) break;
        }
        if (rows.length < 100 || matches.length > limit) break;
      }
      const more = matches.length > limit,
        items = matches.slice(0, limit),
        last = items.at(-1);
      return {
        items,
        nextCursor: more
          ? seal(
              vaultKey,
              JSON.stringify({ time: last.updatedAt, id: last.id }),
              cursorContext(customer, r.privateProject, q),
            )
          : null,
      };
    }),
  );
  app.post(base, async (r) =>
    run(r, async (customer) => {
      await project(r);
      const { requestId } = z
        .object({ requestId: z.uuid() })
        .strict()
        .parse(r.body);
      await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        customer + ":create:" + requestId,
      ]);
      const [old] = await query(
        "SELECT *,public.chat_writable(project_id,version_id) AS writable FROM private.conversations WHERE create_request_id=$1",
        [requestId],
      );
      if (old) {
        if (old.project_id !== r.privateProject)
          fail(409, "Anmodningen er allerede brugt.");
        return dto(old);
      }
      const [assignment] = await query(
        "SELECT version_id FROM public.chat_projects() WHERE id=$1",
        [r.privateProject],
      );
      if (!assignment) fail(404, "Samtalen findes ikke.");
      const c = {
        id: randomUUID(),
        customer_id: customer,
        project_id: r.privateProject,
        version_id: assignment.version_id,
        created_at: clock(),
        updated_at: clock(),
        writable: true,
      };
      await query(
        "INSERT INTO private.conversations(id,customer_id,project_id,version_id,title_secret,created_at,updated_at,create_request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          c.id,
          customer,
          c.project_id,
          c.version_id,
          seal(vaultKey, "", titleContext(c)),
          c.created_at,
          c.updated_at,
          requestId,
        ],
      );
      c.title_secret = seal(vaultKey, "", titleContext(c));
      return dto(c);
    }),
  );
  app.get(base + "/:id", async (r) =>
    run(r, async () => dto(await conversation(r))),
  );
  app.patch(base + "/:id", async (r) =>
    run(r, async () => {
      const c = await conversation(r, true),
        { title } = z
          .object({ title: z.string().trim().min(1).max(120) })
          .strict()
          .parse(r.body);
      const [updated] = await query(
        "UPDATE private.conversations SET title_secret=$1,manual_title=true WHERE id=$2 RETURNING *,public.chat_writable(project_id,version_id) AS writable",
        [seal(vaultKey, title, titleContext(c)), c.id],
      );
      return dto(updated);
    }),
  );
  app.delete(base + "/:id", async (r) =>
    run(r, async () => {
      z.object({}).strict().parse(r.body);
      const c = await conversation(r, true),
        deletedAt = clock();
      await query("INSERT INTO private.deletions VALUES($1,$2,$3,$4)", [
        c.id,
        c.customer_id,
        c.project_id,
        deletedAt,
      ]);
      // Fsync an independent, content-free journal before committing removal.
      // An aborted operation can only preserve this customer's confirmed delete.
      await deletionJournal({
        conversationId: c.id,
        customerId: c.customer_id,
        projectId: c.project_id,
        deletedAt,
      });
      await query("DELETE FROM private.conversations WHERE id=$1", [c.id]);
      return { ok: true };
    }),
  );
  app.get(base + "/:id/messages", async (r) =>
    run(r, async () => {
      const c = await conversation(r);
      const { before, limit = 50 } = z
        .object({
          before: z.coerce.number().int().positive().optional(),
          limit: z.coerce.number().int().min(1).max(100).optional(),
        })
        .strict()
        .parse(r.query);
      const rows = await query(
        `SELECT * FROM private.messages WHERE conversation_id=$1 ${before ? "AND sequence<$3" : ""} ORDER BY sequence DESC LIMIT $2`,
        before ? [c.id, limit + 1, before] : [c.id, limit + 1],
      );
      const items = rows.slice(0, limit).reverse().map(messageDto);
      return { items, before: rows.length > limit ? items[0].sequence : null };
    }),
  );
  app.post(base + "/:id/messages", async (r) =>
    run(r, async (customer) => {
      const { text, requestId } = z
        .object({
          text: z.string().trim().min(1).max(20000),
          requestId: z.uuid(),
        })
        .strict()
        .parse(r.body);
      const c = await conversation(r, true);
      if (!c.writable) fail(409, "Prompten er ændret. Start en ny samtale.");
      const [old] = await query(
        "SELECT * FROM private.messages WHERE request_id=$1",
        [requestId],
      );
      if (old) {
        if (old.conversation_id !== c.id || messageDto(old).text !== text)
          fail(409, "Anmodningen er allerede brugt.");
        return messageDto(old);
      }
      const [{ next }] = await query(
        "SELECT coalesce(max(sequence),0)+1 AS next FROM private.messages WHERE conversation_id=$1",
        [c.id],
      );
      const m = {
        id: randomUUID(),
        customer_id: customer,
        project_id: c.project_id,
        conversation_id: c.id,
        sequence: next,
        request_id: requestId,
        created_at: clock(),
      };
      m.body_secret = seal(vaultKey, text, bodyContext(m));
      await query(
        "INSERT INTO private.messages VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          m.id,
          customer,
          c.project_id,
          c.id,
          next,
          requestId,
          m.body_secret,
          m.created_at,
        ],
      );
      await query(
        "UPDATE private.conversations SET updated_at=$1,title_secret=CASE WHEN manual_title=false AND $2=1 THEN $3 ELSE title_secret END WHERE id=$4",
        [
          m.created_at,
          next,
          seal(
            vaultKey,
            Array.from(text.replace(/\s+/g, " ")).slice(0, 60).join(""),
            titleContext(c),
          ),
          c.id,
        ],
      );
      return messageDto(m);
    }),
  );
  return { checkAccess: (r) => run(r, () => project(r)) };
}
