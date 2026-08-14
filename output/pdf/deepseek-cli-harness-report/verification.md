# HTML Report Verification

## Source resolution

- Original artifact URL: `codex-sandbox://mcp-server-dataanalyticswidgets-d90d6b74b2c37858.web-sandbox.oaiusercontent.com/?app=skybridge`.
- Original artifact generated at: `2026-08-13T13:30:00Z`.
- Updated report generated at: `2026-08-14T04:02:55Z`.
- The hosted URL resolved to an MCP application shell rather than a complete portable payload. The repository-local canonical artifact remains the structural base and is refreshed from the local Pi, Codex, and DSH run evidence.
- The canonical and portable artifacts are byte-identical. All source paths are safe repository-relative paths; SQL, metric definitions, filters, narratives, charts, and reviewed snapshot rows are preserved.

## Tool failure metric validation

- DSH overall tool failure rate: 23 unique failed tool calls / 178 tool calls = 12.9%.
- DSH failure composition: 9 harness-declared failures plus 14 non-zero command exits or runtime exceptions embedded in otherwise successful tool-result envelopes.
- DSH case counts: Flash/high 9/49, Flash/max 7/34, Pro/high 2/18, and Pro/max 5/77.
- Failure-class reconciliation: 10 non-zero command exits, 5 stale file revisions, 4 runtime exceptions without a failure flag, 3 image capability mismatches, and 1 unsupported regex feature.
- The previous 9/178 explicit-error metric is no longer used as the report's DSH tool failure rate.
- Pi and Codex use the failure signals observable in their available schemas; the report labels the cross-harness comparison as directional rather than strictly schema-identical.

## GPT-5.6 Sol control validation

- Official control configuration: model `gpt-5.6-sol` through Codex and Pi, reasoning efforts `high`, `xhigh`, and `max`.
- Codex/Sol-high: 4.36 minutes, 15,321 input tokens, 0% cache hit, 0 tool calls, quality 83/100.
- Codex/Sol-xhigh: 10.47 minutes, 19,472 input tokens, 0% cache hit, 0 tool calls, quality 86/100.
- Codex/Sol-max: 13.77 minutes, 279,693 input tokens, 80.0% cache hit, 6 tool calls, quality 92/100.
- Pi/Sol-high: 4.50 minutes, 84,789 input tokens, 72.5% cache hit, 4 tool calls, quality 90/100.
- Pi/Sol-xhigh: 10.40 minutes, 114,769 input tokens, 69.6% cache hit, 6 tool calls, quality 92/100.
- Pi/Sol-max: 10.96 minutes, 386,528 input tokens, 87.6% cache hit, 12 tool calls, quality 94/100.
- All six controls completed one-shot. Pi/Sol recorded 2 observable tool failures across 22 calls: max and xhigh each recovered from one sandbox rejection of an absolute `/tmp` write. Pi/xhigh also recovered automatically from one WebSocket model-call failure. Codex/Sol recorded 0 failures across 6 calls; high and xhigh returned HTML directly and `analysis/materialize-codex-html.mjs` wrote the exact final responses for browser QA.
- All six outputs passed external 1280×720 assembled/exploded/collapsed browser checks. No visible runtime failure occurred during the checked round trips; visible clipping, label crowding, prompt-state behavior, transport/tool recovery, and in-session verification depth remain reflected in the quality scores.

## Speed-quality chart validation

- The custom scatter image contains all 18 reviewed rows and is generated deterministically by `analysis/render-frontier-chart.mjs` from the same bounded case dataset used by the report.
- The Y-axis is fixed at 50–100; every observed quality score is inside the domain.
- The X-axis uses an explicitly labeled base-2 logarithmic scale with ticks at 5, 10, 20, 40, and 80 minutes, expanding the competitive cluster without omitting the long tail.
- Color encodes CLI harness; direct labels use full `cli-model/reasoning` names such as `codex-sol/high` and `dsh-flash/max`.

## HTML validation

- Data Analytics artifact validation: passed.
- Portable HTML packaging and browser verification: passed.
- Portable payload: 5 bounded datasets and 6 canonical sources.
- Portable HTML contents: 22 ordered blocks, 5 native charts, 1 custom static chart block, and 2 tables.
- Source dialog and keyboard interaction checks: passed.
- Responsive checks: passed at 1440 px and 390 px.
- SQLite materializations: 18 case rows and 5 execution-stack summary rows.
- HTML SHA-256: `cae70269c5b08668bc18b1f1724ae4cfa05daa0d241f977a37f114a6a1483323`.
- The report is delivered as HTML only; no PDF is retained for this report.
