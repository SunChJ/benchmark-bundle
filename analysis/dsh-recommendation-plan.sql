-- Prioritized DSH preview CLI recommendation plan.
WITH recommendations(priority, workstream, proposed_change, exit_signal) AS (
  VALUES
    ('P0', 'Turn continuity', 'Progress-aware watchdog, same-turn resume, idempotent steps, atomic completion marker.', 'Synthetic stream interruptions recover without user continuation.'),
    ('P0', 'Capability negotiation', 'Resolve model capabilities before the turn and hide incompatible tools.', 'Zero permanent capability-mismatch tool calls.'),
    ('P0', 'Visual validation', 'Add a text/JSON render_validate oracle for console, DOM, viewport, state and image statistics.', 'Pure-text models verify visual tasks without direct image input.'),
    ('P1', 'Typed tool recovery', 'Normalize non-zero exits/runtime exceptions into typed failures; make stale edits revision-aware.', 'No actionable subprocess failure is returned as success.'),
    ('P1', 'Headless preflight', 'Resolve sandbox, approval, paths, browser and tool support before the first model call.', 'No mid-run permission changes in non-interactive runs.'),
    ('P1', 'Observability', 'Emit a stable JSON summary for versions, timings, tokens/cache, retries, errors and exit reason.', 'Every benchmark run produces a schema-valid summary.'),
    ('P2', 'Reproducibility and UX', 'Pin resolved CLI integrity, add dsh resume, and explain automatic recovery states.', 'A run can be reproduced and resumed from its manifest.')
)
SELECT * FROM recommendations;
