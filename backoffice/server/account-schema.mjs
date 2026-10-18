export const accountTables = `CREATE TABLE account_profiles(
 account_id text PRIMARY KEY REFERENCES admins(id),display_name text NOT NULL,updated_at text NOT NULL);
CREATE TABLE admin_workspaces(
 account_id text PRIMARY KEY REFERENCES admins(id),customer_id text NOT NULL UNIQUE REFERENCES customers(id));`;

export const accountUpgrade = `${accountTables}
REVOKE ALL ON account_profiles,admin_workspaces FROM PUBLIC,ai_chat;
GRANT SELECT,INSERT,UPDATE,DELETE ON account_profiles TO ai_control;
GRANT SELECT,INSERT ON admin_workspaces TO ai_control;
CREATE OR REPLACE FUNCTION public.chat_customer() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT c.id FROM public.sessions s JOIN public.admins a ON a.id=s.admin_id
 LEFT JOIN public.admin_workspaces w ON w.account_id=a.id AND a.role='admin'
 JOIN public.customers c ON c.id=CASE WHEN a.role='admin' THEN w.customer_id ELSE a.customer_id END
 WHERE s.hash=current_setting('app.session_hash',true) AND a.status='active' AND c.status='active'
 AND s.expires>extract(epoch FROM statement_timestamp())*1000 AND s.seen>extract(epoch FROM statement_timestamp())*1000-1800000
 AND (c.expires IS NULL OR c.expires>=to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD'))
$$;
INSERT INTO schema_version VALUES(5);`;
