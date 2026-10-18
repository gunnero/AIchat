export const appearanceTable = `CREATE TABLE project_appearance(
 project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 color text NOT NULL CHECK(color IN ('black','yellow','purple','green')));`;

export const appearanceUpgrade = `${appearanceTable}
REVOKE ALL ON project_appearance FROM PUBLIC,ai_chat;
GRANT SELECT,INSERT,UPDATE,DELETE ON project_appearance TO ai_control;
CREATE FUNCTION public.chat_workspace_projects() RETURNS TABLE(id text,name text,description text,color text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT p.id,p.name,p.description,COALESCE(a.color,'black') FROM public.chat_projects() p
 LEFT JOIN public.project_appearance a ON a.project_id=p.id ORDER BY p.name
$$;
REVOKE ALL ON FUNCTION public.chat_workspace_projects() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_workspace_projects() TO ai_chat;
INSERT INTO schema_version VALUES(6);`;
