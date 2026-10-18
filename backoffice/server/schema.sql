-- Run by the migration owner, never by either application role.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE TABLE schema_version(version integer PRIMARY KEY);
INSERT INTO schema_version VALUES(3);
CREATE TABLE customers(id text PRIMARY KEY,name text NOT NULL,email citext NOT NULL UNIQUE,status text NOT NULL CHECK(status IN ('pending','active','paused')),expires text,allowance integer NOT NULL CHECK(allowance>=0),created_at text NOT NULL,updated_at text NOT NULL);
CREATE TABLE admins(id text PRIMARY KEY,email citext NOT NULL UNIQUE,name text NOT NULL,password_hash text NOT NULL,mfa_secret text NOT NULL,last_step bigint NOT NULL DEFAULT -1,created_at text NOT NULL,username citext UNIQUE,role text NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','customer')),protected integer NOT NULL DEFAULT 0 CHECK(protected IN (0,1)),status text NOT NULL DEFAULT 'active' CHECK(status IN ('pending','active','paused')),locale text NOT NULL DEFAULT 'da' CHECK(locale IN ('en','da')),customer_id text UNIQUE REFERENCES customers(id));
CREATE UNIQUE INDEX single_protected_account ON admins(protected) WHERE protected=1;
CREATE TABLE sessions(hash text PRIMARY KEY,admin_id text NOT NULL REFERENCES admins(id),created bigint NOT NULL,seen bigint NOT NULL,expires bigint NOT NULL,mfa_at bigint NOT NULL);
CREATE INDEX session_expiry ON sessions(expires);
CREATE TABLE setup_sessions(hash text PRIMARY KEY,secret text NOT NULL,expires bigint NOT NULL);
CREATE TABLE login_failures(bucket text PRIMARY KEY,failures integer NOT NULL,reset_at bigint NOT NULL);
CREATE TABLE connections(id text PRIMARY KEY,label text NOT NULL,project_ref text NOT NULL,environment text NOT NULL CHECK(environment IN ('test','production')),key_secret text NOT NULL,suffix text NOT NULL,revision integer NOT NULL,enabled integer NOT NULL CHECK(enabled IN (0,1)),status text NOT NULL,last_checked text,created_at text NOT NULL,updated_at text NOT NULL);
CREATE TABLE projects(id text PRIMARY KEY,name citext NOT NULL UNIQUE,description text NOT NULL,connection_id text REFERENCES connections(id),enabled integer NOT NULL CHECK(enabled IN (0,1)),created_at text NOT NULL,updated_at text NOT NULL);
CREATE TABLE prompt_versions(id text PRIMARY KEY,project_id text NOT NULL REFERENCES projects(id),prompt_id text NOT NULL,name citext NOT NULL,version integer NOT NULL CHECK(version>0),instructions text NOT NULL,source_ref text NOT NULL,checksum text NOT NULL,created_at text NOT NULL,UNIQUE(project_id,prompt_id,version),UNIQUE(project_id,id));
CREATE TABLE assignments(customer_id text NOT NULL REFERENCES customers(id),project_id text NOT NULL REFERENCES projects(id),version_id text NOT NULL,PRIMARY KEY(customer_id,project_id),FOREIGN KEY(project_id,version_id) REFERENCES prompt_versions(project_id,id));
CREATE TABLE audit(id text PRIMARY KEY,admin_id text REFERENCES admins(id),action text NOT NULL,target text NOT NULL,created_at text NOT NULL);
CREATE TABLE owner_identity(singleton integer PRIMARY KEY CHECK(singleton=1),name text NOT NULL,email text NOT NULL,username text NOT NULL);
CREATE TABLE invitations(id text PRIMARY KEY,account_id text NOT NULL REFERENCES admins(id),token_hash text NOT NULL UNIQUE,expires bigint NOT NULL,status text NOT NULL CHECK(status IN ('sending','sent','failed','revoked','used')),created_at text NOT NULL);
CREATE INDEX invitation_account ON invitations(account_id);
CREATE TABLE registrations(hash text PRIMARY KEY,invitation_id text NOT NULL REFERENCES invitations(id),secret text NOT NULL,expires bigint NOT NULL);
CREATE FUNCTION protect_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.protected=1 AND (TG_OP='DELETE' OR
   ROW(NEW.email::text,NEW.name,NEW.username::text,NEW.role,NEW.protected,NEW.status,NEW.customer_id)
   IS DISTINCT FROM ROW(OLD.email::text,OLD.name,OLD.username::text,OLD.role,OLD.protected,OLD.status,OLD.customer_id))
 THEN RAISE EXCEPTION 'Account cannot be changed' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_owner_identity BEFORE UPDATE OR DELETE ON admins FOR EACH ROW EXECUTE FUNCTION protect_owner();

CREATE SCHEMA private;
CREATE TABLE private.conversations(
 id text PRIMARY KEY,customer_id text NOT NULL REFERENCES customers(id),project_id text NOT NULL REFERENCES projects(id),version_id text NOT NULL,
 title_secret text NOT NULL,manual_title boolean NOT NULL DEFAULT false,created_at bigint NOT NULL,updated_at bigint NOT NULL,
 create_request_id text NOT NULL,FOREIGN KEY(project_id,version_id) REFERENCES prompt_versions(project_id,id),
 UNIQUE(customer_id,create_request_id),UNIQUE(customer_id,project_id,id));
CREATE INDEX conversations_owner_page ON private.conversations(customer_id,project_id,updated_at DESC,id DESC);
CREATE TABLE private.messages(
 id text PRIMARY KEY,customer_id text NOT NULL,project_id text NOT NULL,conversation_id text NOT NULL,
 sequence integer NOT NULL CHECK(sequence>0),request_id text NOT NULL,body_secret text NOT NULL,created_at bigint NOT NULL,
 FOREIGN KEY(customer_id,project_id,conversation_id) REFERENCES private.conversations(customer_id,project_id,id) ON DELETE CASCADE,
 UNIQUE(conversation_id,sequence),UNIQUE(customer_id,request_id));
-- Content-free deletion ledger is exported separately and reapplied after restore.
CREATE TABLE private.deletions(conversation_id text PRIMARY KEY,customer_id text NOT NULL,project_id text NOT NULL,deleted_at bigint NOT NULL);

CREATE FUNCTION public.chat_customer() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT a.customer_id FROM public.sessions s JOIN public.admins a ON a.id=s.admin_id JOIN public.customers c ON c.id=a.customer_id
 WHERE s.hash=current_setting('app.session_hash',true) AND a.role='customer' AND a.status='active' AND c.status='active'
 AND s.expires>extract(epoch FROM statement_timestamp())*1000 AND s.seen>extract(epoch FROM statement_timestamp())*1000-1800000
 AND (c.expires IS NULL OR c.expires>=to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD'))
$$;
CREATE FUNCTION public.chat_access(p text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.assignments a JOIN public.projects p1 ON p1.id=a.project_id
 WHERE a.customer_id=public.chat_customer() AND a.project_id=p AND p1.enabled=1)
$$;
CREATE FUNCTION public.chat_writable(p text,v text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.chat_access(p) AND EXISTS(SELECT 1 FROM public.assignments a WHERE a.customer_id=public.chat_customer() AND a.project_id=p AND a.version_id=v)
$$;
CREATE FUNCTION public.chat_projects() RETURNS TABLE(id text,name text,description text,version_id text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT p.id,p.name::text,p.description,a.version_id FROM public.projects p JOIN public.assignments a ON a.project_id=p.id
 WHERE a.customer_id=public.chat_customer() AND p.enabled=1 ORDER BY p.name
$$;
ALTER TABLE private.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE private.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.messages FORCE ROW LEVEL SECURITY;
ALTER TABLE private.deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.deletions FORCE ROW LEVEL SECURITY;
CREATE POLICY conversation_read ON private.conversations FOR SELECT TO ai_chat USING(customer_id=public.chat_customer() AND public.chat_access(project_id));
CREATE POLICY conversation_create ON private.conversations FOR INSERT TO ai_chat WITH CHECK(customer_id=public.chat_customer() AND public.chat_writable(project_id,version_id));
CREATE POLICY conversation_update ON private.conversations FOR UPDATE TO ai_chat USING(customer_id=public.chat_customer() AND public.chat_access(project_id)) WITH CHECK(customer_id=public.chat_customer() AND public.chat_access(project_id));
CREATE POLICY conversation_delete ON private.conversations FOR DELETE TO ai_chat USING(customer_id=public.chat_customer() AND public.chat_access(project_id));
CREATE POLICY message_read ON private.messages FOR SELECT TO ai_chat USING(customer_id=public.chat_customer() AND public.chat_access(project_id));
CREATE POLICY message_create ON private.messages FOR INSERT TO ai_chat WITH CHECK(customer_id=public.chat_customer() AND EXISTS(SELECT 1 FROM private.conversations c WHERE c.id=conversation_id AND c.customer_id=private.messages.customer_id AND c.project_id=private.messages.project_id AND public.chat_writable(c.project_id,c.version_id)));
CREATE POLICY deletion_create ON private.deletions FOR INSERT TO ai_chat WITH CHECK(customer_id=public.chat_customer() AND public.chat_access(project_id));
CREATE POLICY conversation_maintenance ON private.conversations TO ai_owner USING(true) WITH CHECK(true);
CREATE POLICY message_maintenance ON private.messages TO ai_owner USING(true) WITH CHECK(true);
CREATE POLICY deletion_maintenance ON private.deletions TO ai_owner USING(true) WITH CHECK(true);
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ai_control,ai_chat;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ai_control;
GRANT USAGE ON SCHEMA private TO ai_chat;
GRANT SELECT,INSERT,DELETE ON private.conversations TO ai_chat;
GRANT UPDATE(title_secret,manual_title,updated_at) ON private.conversations TO ai_chat;
GRANT SELECT,INSERT ON private.messages TO ai_chat;
GRANT INSERT ON private.deletions TO ai_chat;
GRANT EXECUTE ON FUNCTION public.chat_customer(),public.chat_access(text),public.chat_writable(text,text),public.chat_projects() TO ai_chat;
