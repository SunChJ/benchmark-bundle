# Chart Map

## Adjusted completion time

- Question: Which harness, model tier, and effort combination reaches a completed artifact fastest after removing DSH's explicit disconnect and retry waits?
- Dataset: `cases`
- Fields: `case`, `duration_min`, `wall_duration_min`, `completion_mode`
- Mark: Horizontal bar
- Sort: Ascending by `duration_min`
- Source: `analysis/analyze-runs.mjs`
- Caveat: DSH rows are human-assisted completions; Pi/Codex rows are one-shot. DSH adjusted time removes logged 300-second idle timeouts, retry backoff, and error-end-to-next-turn gaps.

## One-shot completion rate

- Question: Does each harness complete the same prompt without manual continuation?
- Dataset: `harness_summary`
- Fields: `harness`, `one_shot_rate`
- Mark: Horizontal bar
- Source: `analysis/analyze-runs.mjs`

## Observed actionable tool failure rate

- Question: What share of tool calls produced an observable actionable failure?
- Dataset: `harness_summary`
- Fields: `harness`, `tool_failure_rate`, `tool_failures`, `tool_calls`
- Mark: Horizontal bar
- Source: `analysis/analyze-runs.mjs`
- DSH definition: harness-declared errors plus non-zero command exits and runtime exceptions embedded in otherwise successful tool-result envelopes.
- Caveat: This is an incidence metric, not a severity metric. Pi and Codex use the failure signals observable in their respective schemas, so the cross-harness comparison is directional rather than strictly schema-identical.

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
- Mark: Scatter with direct labels
- Label format: `Model–Reasoning`; the report explicitly decodes `F/P = Flash/Pro` and `H/M = high/max` directly below the chart, while harness is encoded by color.
- Sort: Not applicable
- Source: Deterministic join of `analysis/analyze-runs.mjs` and `analysis/quality-assessment.md` by `case`

## Visual policy

- Harness is the only semantic color encoding in the scatter plot.
- Cache component is the only semantic color encoding in the stacked chart.
- Other ranked charts use a neutral sequential palette.
- All 12 cases remain visible; no top-N truncation is applied.
