-- Proposed acceptance gates for moving DSH beyond preview reliability.
WITH acceptance_gates(gate, observed, preview_exit_target, measurement) AS (
  VALUES
    ('One-shot completion', '0/4 DSH cases', '4/4 regression; then >=95% across n>=20', 'Completed artifact without manual continuation'),
    ('Manual continuation', '8 messages', '0 in unattended mode', 'Continuation messages after canonical prompt'),
    ('Capability mismatch', '3 read_image failures', '0 after preflight', 'Permanent mismatch calls by class'),
    ('Recovery fixtures', 'Not measured', '100% within bounded retry budget', 'Injected stream and stale-edit scenarios'),
    ('Outcome normalization', '14 failures not flagged as tool errors', '0 unflagged actionable failures', 'Non-zero exits and runtime exceptions vs tool status'),
    ('Permission stability', '3 mid-run changes', '0 in headless mode', 'Permission-mode transitions per run'),
    ('Telemetry completeness', 'No stable summary contract', '100% schema-valid summaries', 'JSON schema validation and explicit exit reason')
)
SELECT * FROM acceptance_gates;
