// A link is immutable and scoped to the same project and connection as its app
// prompt version. Remote content remains managed by OpenAI, not copied here.
export const linkTable = `CREATE UNIQUE INDEX project_connection_binding ON projects(id,connection_id);
CREATE TABLE platform_prompt_links(
 version_id text PRIMARY KEY,
 project_id text NOT NULL,
 connection_id text NOT NULL REFERENCES connections(id),
 provider_prompt_id text NOT NULL,
 version_policy text NOT NULL CHECK(version_policy='default'),
 FOREIGN KEY(project_id,version_id) REFERENCES prompt_versions(project_id,id),
 FOREIGN KEY(project_id,connection_id) REFERENCES projects(id,connection_id),
 UNIQUE(project_id,provider_prompt_id)
);`;
export const postgresUpgrade = `${linkTable}
REVOKE ALL ON platform_prompt_links FROM PUBLIC,ai_chat;
GRANT SELECT,INSERT ON platform_prompt_links TO ai_control;
INSERT INTO schema_version VALUES(4);`;
