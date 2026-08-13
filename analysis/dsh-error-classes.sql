-- Reviewed actionable DSH execution failures from the four benchmark session logs.
WITH error_classes(
  error_class,
  incidents,
  affected_cases,
  failure_surface,
  recommended_handler
) AS (
  VALUES
    ('Non-zero command exit', 10, 4, 'Command/runtime', 'Return a typed error envelope with exit code and stderr'),
    ('Stale file revision', 5, 3, 'Harness-declared', 'Re-read and replay once with a revision token'),
    ('Runtime exception without failure flag', 4, 1, 'Command/runtime', 'Detect process failure and set the tool error flag'),
    ('Image capability mismatch', 3, 3, 'Harness-declared', 'Hide read_image and route to render_validate'),
    ('Unsupported regex feature', 1, 1, 'Harness-declared', 'Return an executable compatibility hint')
)
SELECT * FROM error_classes;
