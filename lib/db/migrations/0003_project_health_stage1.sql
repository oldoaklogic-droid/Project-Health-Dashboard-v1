CREATE TABLE health_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  severity text NOT NULL CHECK (severity IN ('red', 'yellow', 'gray')),
  condition jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE project_health_snapshot (
  project_id text NOT NULL,
  as_of date NOT NULL,
  severity text NOT NULL CHECK (severity IN ('red', 'yellow', 'green', 'gray')),
  triggered_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  override_severity text CHECK (override_severity IN ('red', 'yellow', 'green', 'gray')),
  override_reason text,
  override_by text,
  PRIMARY KEY (project_id, as_of)
);
CREATE INDEX project_health_snapshot_as_of_idx ON project_health_snapshot(as_of);

CREATE TABLE actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text,
  what text NOT NULL,
  owner_employee_id text,
  due_date date,
  amount numeric,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_in_meeting boolean NOT NULL DEFAULT false,
  closed_at date,
  close_note text
);
CREATE INDEX actions_project_idx ON actions(project_id);
CREATE INDEX actions_status_due_idx ON actions(status, due_date);

CREATE TABLE pm_notes (
  project_id text NOT NULL,
  as_of date NOT NULL,
  risk_line text NOT NULL DEFAULT '',
  action_line text NOT NULL DEFAULT '',
  percent_complete numeric,
  entered_by text NOT NULL,
  PRIMARY KEY (project_id, as_of)
);
CREATE INDEX pm_notes_as_of_idx ON pm_notes(as_of);

CREATE TABLE client_contact_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  contact_date date NOT NULL,
  method text NOT NULL,
  summary text NOT NULL,
  logged_by text NOT NULL
);
CREATE INDEX client_contact_log_project_date_idx ON client_contact_log(project_id, contact_date);

INSERT INTO health_rules (name, severity, condition, active, sort_order) VALUES
('Budget hours over 95% with percent complete under 80%', 'red', '{"type":"budget_burn","minExclusive":0.95,"percentCompleteMaxExclusive":80,"requiresBudget":true}', true, 10),
('Any activity over budget by more than 25%', 'red', '{"type":"activity_variance","minExclusive":0.25,"requiresBudget":true}', true, 20),
('Unbilled work over 60 days', 'red', '{"type":"unbilled_age","minExclusive":60}', true, 30),
('Any invoice over 60 days past due', 'red', '{"type":"invoice_past_due","minExclusive":60}', true, 40),
('No PM note in 30 days', 'red', '{"type":"pm_note_age","minExclusive":30}', true, 50),
('No client contact in 30 days on an active project', 'red', '{"type":"client_contact_age","minExclusive":30,"activeOnly":true}', true, 60),
('Fee exhausted with work remaining', 'red', '{"type":"fee_exhausted","invoicedAtLeastContract":true,"workRemaining":true}', true, 70),
('No time entry in 30 days and not completed', 'red', '{"type":"time_entry_age","minExclusive":30,"activeOnly":true}', true, 80),
('Budget hours 80 to 95% with percent complete under 80%', 'yellow', '{"type":"budget_burn","minInclusive":0.8,"maxInclusive":0.95,"percentCompleteMaxExclusive":80,"requiresBudget":true}', true, 90),
('Any activity over budget by 10 to 25%', 'yellow', '{"type":"activity_variance","minInclusive":0.1,"maxInclusive":0.25,"requiresBudget":true}', true, 100),
('Unbilled work 30 to 60 days', 'yellow', '{"type":"unbilled_age","minInclusive":30,"maxInclusive":60}', true, 110),
('Invoices 30 to 60 days past due', 'yellow', '{"type":"invoice_past_due","minInclusive":30,"maxInclusive":60}', true, 120),
('No PM note in 14 to 30 days', 'yellow', '{"type":"pm_note_age","minInclusive":14,"maxInclusive":30}', true, 130),
('Under $5000 fee remaining', 'yellow', '{"type":"fee_remaining","maxExclusive":5000}', true, 140),
('No time entry in 90 days and no invoice in 90 days and still active', 'gray', '{"type":"dual_inactivity","minExclusive":90,"activeOnly":true}', true, 150);