# Chart Map

## One-shot completion time

- Question: Which harness, model tier, and effort combination finishes the task fastest?
- Dataset: `cases`
- Fields: `case`, `duration_min`
- Mark: Horizontal bar
- Sort: Ascending by `duration_min`
- Source: `analysis/analyze-runs.mjs`

## Input token cache composition

- Question: How much of each run's model input was served from cache?
- Dataset: `token_components`
- Fields: `case`, `component`, `share`, `tokens_m`
- Mark: 100% horizontal stacked bar
- Sort: Preserve case order
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
- Fields: `case`, `duration_min`, `quality_score`, `harness`, `critical_status`
- Mark: Scatter with direct labels
- Sort: Not applicable
- Source: Deterministic join of `analysis/analyze-runs.mjs` and `analysis/quality-assessment.md` by `case`

## Visual policy

- Harness is the only semantic color encoding in the scatter plot.
- Cache component is the only semantic color encoding in the stacked chart.
- Other ranked charts use one neutral sequential palette.
- All eight cases remain visible; no top-N truncation is applied.
