-- These objects may already be present from the immutable snapshot capture.
-- Definitions intentionally match that production schema.
CREATE TABLE IF NOT EXISTS internal_clients (
  client text PRIMARY KEY,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bqe_snapshots (
  id uuid PRIMARY KEY, label text NOT NULL, pull_run_id text NOT NULL,
  captured_at timestamptz NOT NULL, row_counts jsonb NOT NULL, checksum text NOT NULL
);
CREATE INDEX IF NOT EXISTS bqe_snapshots_captured_at_idx ON bqe_snapshots(captured_at);

-- Snapshot tables are CTAS copies of their live counterparts, with snapshot_id
-- added by the capture process.  Do not add constraints that CTAS tables lack.
CREATE TABLE IF NOT EXISTS bqe_projects_snap (
  snapshot_id uuid NOT NULL, record_id text NOT NULL, pulled_at timestamptz NOT NULL, raw_json jsonb NOT NULL,
  code text, name text, parent_id text, root_project_id text, project_type text, project_class text, project_class_id text,
  client text, status text, contract_type text, contract_amount numeric, manager text
);
CREATE TABLE IF NOT EXISTS bqe_time_entries_snap (
  snapshot_id uuid NOT NULL, record_id text NOT NULL, pulled_at timestamptz NOT NULL, raw_json jsonb NOT NULL,
  entry_date date, employee text, project_id text, project_code text, activity_id text, activity_code text,
  hours numeric, billable boolean, bill_rate numeric, cost_rate numeric
);
CREATE TABLE IF NOT EXISTS bqe_budgets_snap (
  snapshot_id uuid NOT NULL, record_id text NOT NULL, pulled_at timestamptz NOT NULL, raw_json jsonb NOT NULL,
  name text, project_id text, project_code text, line_items jsonb, total_hours numeric
);
CREATE TABLE IF NOT EXISTS bqe_invoices_snap (
  snapshot_id uuid NOT NULL, record_id text NOT NULL, pulled_at timestamptz NOT NULL, raw_json jsonb NOT NULL,
  invoice_number text, project_id text, project_code text, invoice_date date, amount numeric, balance numeric,
  status integer, invoice_type integer, draft boolean, void boolean, service_amount numeric, expense_amount numeric,
  service_tax_amount numeric, expense_tax_amount numeric, discount numeric, register_amount numeric
);
CREATE TABLE IF NOT EXISTS bqe_payments_snap (
  snapshot_id uuid NOT NULL, record_id text NOT NULL, pulled_at timestamptz NOT NULL, raw_json jsonb NOT NULL,
  payment_date date, amount numeric, project_id text, project_code text, method text, reference text
);
CREATE TABLE IF NOT EXISTS bqe_activities_snap (
  snapshot_id uuid NOT NULL, record_id text NOT NULL, pulled_at timestamptz NOT NULL, raw_json jsonb NOT NULL,
  code text, name text, active boolean, billable boolean, rates jsonb
);
CREATE INDEX IF NOT EXISTS bqe_projects_snap_snapshot_code_idx ON bqe_projects_snap(snapshot_id, code);
CREATE INDEX IF NOT EXISTS bqe_time_entries_snap_snapshot_project_idx ON bqe_time_entries_snap(snapshot_id, project_id);
CREATE INDEX IF NOT EXISTS bqe_budgets_snap_snapshot_project_idx ON bqe_budgets_snap(snapshot_id, project_id);
CREATE INDEX IF NOT EXISTS bqe_invoices_snap_snapshot_project_idx ON bqe_invoices_snap(snapshot_id, project_id);

-- Purge only known placeholder rows; genuine legacy overlays are left intact.
DELETE FROM health_projects
WHERE name ILIKE 'Portfolio project %'
   OR client ILIKE 'Complete Design client %'
   OR code ~ '^26-(1509|15[1-9][0-9]|16[0-2][0-9]|163[0-3])$';

-- Anchored tokens prevent false positives such as “Bell Law Office”.
INSERT INTO internal_clients (client)
SELECT DISTINCT CASE WHEN client IS NULL OR btrim(client) = '' THEN '' ELSE btrim(client) END
FROM bqe_projects_snap
WHERE client IS NULL
   OR btrim(client) = ''
   OR btrim(client) ~* '^(complete[[:space:]]+design|cdi|internal|office|overhead|pto|marketing|admin|training|holiday|vacation|sick)([[:space:][:punct:]].*)?$'
ON CONFLICT (client) DO NOTHING;