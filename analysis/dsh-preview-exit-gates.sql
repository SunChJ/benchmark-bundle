-- Proposed acceptance gates for moving DSH beyond preview reliability.
WITH acceptance_gates(gate, observed, preview_exit_target, measurement) AS (
  VALUES
    ('One-shot completion', '4/4 DSH cases', 'Maintain >=95% across n>=20', 'Completed artifact without manual continuation'),
    ('Manual continuation', '0 messages', 'Maintain 0 in unattended mode', 'Continuation messages after canonical prompt'),
    ('Capability mismatch', '0 incompatible tool calls', 'Maintain 0 under capability regression tests', 'Permanent mismatch calls by class'),
    ('Recovery fixtures', 'Not measured', '100% within bounded retry budget', 'Injected stream and stale-edit scenarios'),
    ('Outcome normalization', '8 non-zero exits not flagged as errors', '0 unflagged actionable failures', 'Non-zero exits vs tool status'),
    ('Semantic validation', '1/4 critical geometry defect escaped', '0 critical defects accepted by render validation', 'Orientation, viewport and label-collision assertions'),
    ('Permission stability', '1 mid-run change', '0 in headless mode', 'Permission-mode transitions per run'),
    ('Telemetry completeness', 'No stable summary contract', '100% schema-valid summaries', 'JSON schema validation and explicit exit reason')
)
SELECT * FROM acceptance_gates;
