-- Prioritized DSH preview CLI recommendation plan.
WITH recommendations(priority, workstream, proposed_change, exit_signal) AS (
  VALUES
    ('P0', 'Outcome normalization', 'Convert every non-zero command exit into a typed failed tool result with exit code and stderr.', 'Zero actionable subprocess failures are returned as success.'),
    ('P0', 'Semantic render validation', 'Add a text/JSON oracle for console, DOM, viewport, state transitions, orientation and label collisions.', 'No critical geometry or viewport defect passes automated acceptance.'),
    ('P1', 'Safe edit recovery', 'Carry revision tokens and automatically re-read and replay one stale edit.', 'The stale-edit fixture completes within one bounded replay.'),
    ('P1', 'Tool-loop efficiency', 'Budget model/tool rounds and summarize stable context before replaying it.', 'Repeated runs report lower p50/p90 calls, tokens and elapsed time without quality loss.'),
    ('P1', 'Headless preflight', 'Resolve sandbox, approval, paths, browser and tool support before the first model call.', 'Zero mid-run permission changes in non-interactive runs.'),
    ('P1', 'Observability', 'Emit a stable JSON summary for preset, versions, timings, tokens/cache, retries, errors and exit reason.', 'Every benchmark run produces a schema-valid summary.'),
    ('P2', 'Regression and reproducibility', 'Pin the minimal preset manifest and repeat the matched matrix with deterministic recovery fixtures.', 'One-shot and capability gains hold across n>=20 and injected failures.')
)
SELECT * FROM recommendations;
