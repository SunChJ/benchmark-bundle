-- DSH lifecycle event totals from the four benchmark session logs.
WITH lifecycle_events(event, count, interpretation) AS (
  VALUES
    ('Stream timeout occurrence', 20, 'Turn continuity signal'),
    ('LLM retry', 15, 'Automatic retry attempt'),
    ('Manual continuation', 8, 'Unattended completion failure'),
    ('Permission mode change', 3, 'Preflight contract gap')
)
SELECT * FROM lifecycle_events;
