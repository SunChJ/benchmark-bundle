# Chart Map

## Adjusted completion time

- Question: Which harness, model tier, and effort combination reaches a completed artifact fastest after removing DSH's explicit disconnect and retry waits?
- Dataset: `cases`
- Fields: `case`, `duration_min`, `wall_duration_min`, `completion_mode`
- Mark: Horizontal bar
- Sort: Ascending by `duration_min`
- Source: `analysis/analyze-runs.mjs`
- Caveat: All current DSH minimal-preset rows are one-shot. Adjusted time differs from wall time only for Flash/high, where 1.96 seconds of logged retry backoff are excluded.

## One-shot completion rate

- Question: Does each execution stack complete the same prompt without manual continuation?
- Dataset: `harness_summary`
- Fields: `stack_label`, `stack`, `one_shot_rate`
- Mark: Horizontal bar
- Source: `analysis/analyze-runs.mjs`
- Caveat: Every current stack is 100% in this single-run matrix; use this chart as a regression-status view, not evidence of equal long-run reliability.

## Observed actionable tool failure rate

- Question: What share of tool calls produced an observable actionable failure?
- Dataset: `harness_summary`
- Fields: `stack_label`, `stack`, `tool_failure_rate`, `tool_failures`, `tool_calls`
- Mark: Horizontal bar
- Source: `analysis/analyze-runs.mjs`
- DSH definition: the current minimal-preset audit contains one harness-declared stale-file conflict plus eight non-zero command exits embedded in otherwise successful tool-result envelopes.
- Caveat: This is an incidence metric, not a severity metric. Pi and Codex use the failure signals observable in their respective schemas, so the cross-harness comparison is directional rather than strictly schema-identical.
- Control handling: Sol stack rates aggregate the high, xhigh, and max controls for each harness. Codex/Sol high and xhigh made zero tool calls and therefore do not add to that stack's denominator.

## Input token cache composition

- Question: How much of each run's model input was served from cache?
- Dataset: `cases`
- Fields: `case`, `cached_input_tokens`, `uncached_input_tokens`, `cache_hit_rate`
- Mark: 100% horizontal stacked bar
- Sort: Preserve adjusted-duration order
- Source: `analysis/analyze-runs.mjs`

## Implementation quality score

- Question: Which outputs best satisfy functional, geometric, visual, and verification requirements?
- Dataset: `cases`
- Fields: `case`, `quality_score`, `critical_status`
- Mark: Horizontal bar
- Sort: Descending by `quality_score`
- Source: `analysis/quality-assessment.md`

## Completion time vs implementation quality

- Question: Which cases lie on the practical speed-quality frontier?
- Dataset: `cases`
- Fields: `case_label`, `case`, `duration_min`, `quality_score`, `harness`, `completion_mode`, `critical_status`
- Mark: Static PNG scatter embedded in a custom HTML block because the native report chart does not support a non-zero quantitative-axis baseline.
- Label format: full `cli-model/reasoning` names such as `codex-sol/high`, `pi-pro/max`, and `dsh-flash/high`; harness is also encoded by color.
- Scale: The Y-axis is fixed at 50–100. The X-axis uses a base-2 logarithmic scale with visible ticks at 5, 10, 20, 40, and 80 minutes, expanding the low-duration cluster without hiding the long tail. All 18 points remain visible.
- Sort: Not applicable
- Source: Deterministic join of `analysis/analyze-runs.mjs` and `analysis/quality-assessment.md` by `case`; rendered by `analysis/render-frontier-chart.mjs`.

## Visual policy

- CLI harness is the only semantic color encoding in the scatter plot; model family/tier remains encoded in the direct label.
- Cache component is the only semantic color encoding in the stacked chart.
- Other ranked charts use a neutral sequential palette.
- All 18 cases remain visible; no top-N truncation is applied.
