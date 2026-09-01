DROP INDEX IF EXISTS "local_projects_intake_id_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "local_projects_intake_id_uidx"
  ON "local_projects" ("intake_id");