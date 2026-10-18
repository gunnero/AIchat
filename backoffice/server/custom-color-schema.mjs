// SQLite is used only by legacy behavior fixtures, not by production.
export const sqliteAppearanceTable = `CREATE TABLE IF NOT EXISTS project_appearance(
 project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 color text NOT NULL CHECK(color IN ('black','yellow','purple','green') OR
 (length(color)=7 AND substr(color,1,1)='#' AND substr(color,2) NOT GLOB '*[^0-9a-f]*')));`;

export const customColorUpgrade = `ALTER TABLE project_appearance
 DROP CONSTRAINT project_appearance_color_check;
ALTER TABLE project_appearance ADD CONSTRAINT project_appearance_color_check
 CHECK(color IN ('black','yellow','purple','green') OR color ~ '^#[0-9a-f]{6}$');
INSERT INTO schema_version VALUES(8);`;
