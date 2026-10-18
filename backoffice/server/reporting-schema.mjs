export const reportingTable = `CREATE TABLE usage_reporting(
 singleton integer PRIMARY KEY CHECK(singleton=1),label text NOT NULL,
 key_secret text,suffix text,revision integer NOT NULL CHECK(revision>0),updated_at text NOT NULL,
 CHECK((key_secret IS NULL)=(suffix IS NULL)));`;
export const reportingUpgrade = `${reportingTable}
REVOKE ALL ON usage_reporting FROM PUBLIC,ai_chat;
GRANT SELECT,INSERT,UPDATE,DELETE ON usage_reporting TO ai_control;
INSERT INTO schema_version VALUES(7);`;
