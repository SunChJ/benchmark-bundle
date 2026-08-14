-- Execution-stack reliability summary derived from the 18 reviewed case rows.
WITH harness_summary(
  stack,
  stack_label,
  harness,
  model_family,
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
    ('Codex / GPT-5.6 Sol', 'Sol · Codex', 'Codex', 'OpenAI', 3, 3, 1.0, 6, 0, 0.0, 0, 0, 0, 0),
    ('Pi / GPT-5.6 Sol', 'Sol · Pi', 'Pi', 'OpenAI', 3, 3, 1.0, 22, 2, 0.0909090909090909, 1, 0, 0, 0),
    ('Codex / DeepSeek', 'DS · Codex', 'Codex', 'DeepSeek', 4, 4, 1.0, 93, 17, 0.1827956989247312, 0, 0, 0, 0),
    ('Pi / DeepSeek', 'DS · Pi', 'Pi', 'DeepSeek', 4, 4, 1.0, 94, 13, 0.1382978723404255, 0, 0, 0, 0),
    ('DSH / DeepSeek', 'DS · DSH', 'DSH', 'DeepSeek', 4, 0, 0.0, 178, 23, 0.1292134831460674, 15, 20, 8, 3)
)
SELECT * FROM harness_summary;
