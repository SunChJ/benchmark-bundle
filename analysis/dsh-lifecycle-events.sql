-- DSH lifecycle event totals from the four benchmark session logs.
WITH lifecycle_events(event, count, interpretation) AS (
  VALUES
    ('One-shot completion', 4, 'Unattended success'),
    ('LLM retry', 3, 'Automatic retry attempt'),
    ('Permission mode change', 1, 'Preflight contract gap'),
    ('Stream timeout occurrence', 0, 'No timeout observed'),
    ('Manual continuation', 0, 'No continuation required')
)
SELECT * FROM lifecycle_events;
