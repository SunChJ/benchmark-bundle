# HTML Report Verification

## Source resolution

- Original artifact URL: `codex-sandbox://mcp-server-dataanalyticswidgets-d90d6b74b2c37858.web-sandbox.oaiusercontent.com/?app=skybridge`.
- Original artifact generated at: `2026-08-13T13:30:00Z`.
- Updated report generated at: `2026-08-13T16:26:44Z`.
- The hosted URL resolved to an MCP application shell rather than a complete portable payload. The repository-local canonical artifact remains the structural base and is refreshed from the local Pi, Codex, and DSH run evidence.
- The canonical and portable artifacts are byte-identical. All source paths are safe repository-relative paths; SQL, metric definitions, filters, narratives, charts, and reviewed snapshot rows are preserved.

## Tool failure metric validation

- DSH overall tool failure rate: 23 unique failed tool calls / 178 tool calls = 12.9%.
- DSH failure composition: 9 harness-declared failures plus 14 non-zero command exits or runtime exceptions embedded in otherwise successful tool-result envelopes.
- DSH case counts: Flash/high 9/49, Flash/max 7/34, Pro/high 2/18, and Pro/max 5/77.
- Failure-class reconciliation: 10 non-zero command exits, 5 stale file revisions, 4 runtime exceptions without a failure flag, 3 image capability mismatches, and 1 unsupported regex feature.
- The previous 9/178 explicit-error metric is no longer used as the report's DSH tool failure rate.
- Pi and Codex use the failure signals observable in their available schemas; the report labels the cross-harness comparison as directional rather than strictly schema-identical.

## HTML validation

- Data Analytics artifact validation: passed.
- Portable HTML packaging and browser verification: passed.
- Portable payload: 4 bounded datasets and 5 canonical sources.
- Portable HTML contents: 21 ordered blocks, 6 charts, and 2 tables.
- Source dialog and keyboard interaction checks: passed.
- Responsive checks: passed at 1440 px and 390 px.
- SQLite materializations: 12 case rows and 3 harness summary rows.
- HTML SHA-256: `9ac4fb6a84196fd7edcb66daa9d4392635d7bc20eb924dc5b9dcf77fe0a5f5ef`.
- The report is delivered as HTML only; no PDF is retained for this report.
