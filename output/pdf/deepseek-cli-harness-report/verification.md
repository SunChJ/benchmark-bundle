# PDF Export Verification

## Source resolution

- Original artifact URL: `codex-sandbox://mcp-server-dataanalyticswidgets-d90d6b74b2c37858.web-sandbox.oaiusercontent.com/?app=skybridge`
- Original artifact generated at: `2026-08-13T13:30:00Z`
- The hosted URL resolved to an MCP application shell rather than a complete portable payload. The prior canonical artifact in this repository was therefore used as the structural base, then refreshed from local Pi, Codex, and DSH run evidence.
- The updated canonical and portable artifacts are byte-identical. All source paths are safe repository-relative paths; SQL, metric definitions, filters, narratives, charts, and reviewed snapshot rows are preserved.

## Validation

- Data Analytics artifact validation: passed.
- Portable payload: 4 bounded datasets and 5 canonical sources.
- Portable HTML builder: validation, packaging, and browser verification passed.
- Portable HTML contents: 20 ordered blocks, 6 charts, and 2 tables.
- Source dialog and keyboard interaction checks: passed.
- Responsive checks: passed at 1440 px and 390 px.
- SQLite materializations: 12 case rows and 3 harness summary rows.

## PDF verification

- Renderer: Playwright with Headless Chrome 151; print-time CJK fallback uses PingFang SC.
- Output: 7 Letter portrait pages, 664,227 bytes, PDF 1.4.
- SHA-256: `45dc6bab1acb5da44567322e338183ea69b65f2d7c81bc62111fd789226bdcb6`.
- Text extraction: 10,373 characters, zero replacement characters, and at least 920 characters per page.
- Every page was rendered to PNG at 100 DPI and visually inspected.
- All 6 charts, both complete tables, DSH preview-CLI recommendations, source details, timing caveats, and operating policy are present and legible.
- No blank pages, clipped table columns, standalone app controls, internal artifact labels, credential-bearing URLs, or absolute local paths were found.
