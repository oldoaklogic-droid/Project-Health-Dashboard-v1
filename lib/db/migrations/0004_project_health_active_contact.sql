UPDATE health_rules
SET condition = condition || '{"activeOnly":true}'::jsonb
WHERE name = 'No client contact in 30 days on an active project';