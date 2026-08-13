-- Harness-level reliability summary derived from the 12 reviewed case rows.
WITH harness_summary(
  harness,
  cases,
  one_shot_completed,
  one_shot_rate,
  tool_calls,
  tool_failures,
  tool_failure_rate,
  llm_retries,
  stream_timeouts,
  manual_continues,
  permission_changes
) AS (
  VALUES
    ('Codex', 4, 4, 1.0, 93, 17, 0.1827956989247312, 0, 0, 0, 0),
    ('Pi', 4, 4, 1.0, 94, 13, 0.1382978723404255, 0, 0, 0, 0),
    ('DSH', 4, 0, 0.0, 178, 23, 0.1292134831460674, 15, 20, 8, 3)
)
SELECT * FROM harness_summary;
