-- Reviewed actionable DSH execution failures from the four benchmark session logs.
WITH error_classes(
  error_class,
  incidents,
  affected_cases,
  failure_surface,
  recommended_handler
) AS (
  VALUES
    ('Non-zero command exit', 8, 2, 'Command/runtime', 'Return a typed error envelope with exit code and stderr'),
    ('Stale file revision', 1, 1, 'Harness-declared', 'Re-read and replay once with a revision token')
)
SELECT * FROM error_classes;
