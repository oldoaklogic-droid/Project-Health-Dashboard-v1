UPDATE health_rules
SET
  name = 'Budget hours over 100%, or over 95% with percent complete under 80%',
  condition = '{"type":"budget_burn","minExclusive":0.95,"percentCompleteMaxExclusive":80,"independentMinExclusive":1,"requiresBudget":true}'::jsonb
WHERE name = 'Budget hours over 95% with percent complete under 80%';