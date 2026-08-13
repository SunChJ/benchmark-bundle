# PDF Export Verification

## Source resolution

- Artifact URL: `codex-sandbox://mcp-server-dataanalyticswidgets-d90d6b74b2c37858.web-sandbox.oaiusercontent.com/?app=skybridge`
- Artifact generated at: `2026-08-13T13:30:00Z`
- The hosted URL resolved to a 287-byte MCP application shell. `/api/package`, `/api/manifest`, and `/api/snapshot` were unavailable.
- The complete validated artifact payload was still available in the current run and was saved as `artifact.json`.
- `artifact-portable.json` removes machine-local `source.path` fields for portable delivery. Reader-facing source labels, metric definitions, SQL, source tables, narrative, charts, and snapshot rows are unchanged.

## Validation

- Data Analytics artifact validation: passed.
- Portable payload: 3 datasets and 4 canonical sources.
- Portable HTML builder: passed validation, packaging, and browser verification.
- Portable HTML contents: 16 ordered blocks, 4 charts, and 1 table.
- Source dialog and keyboard interaction checks: passed.
- Responsive checks: passed at 1440 px and 390 px.

## PDF verification

- Renderer: Headless Chrome 151.
- Output: 5 tagged A4 landscape pages, 700,114 bytes, PDF 1.4.
- SHA-256: `760acac55caa3bfb8fe661d683a0e8c70d000c1ae48920f01d0713810a33ff94`.
- Poppler text extraction: 12,369 characters; all required headings and Chinese narrative are searchable.
- Every page was rendered to PNG at 120 DPI and visually inspected.
- Charts, legends, table columns, source details, generated-at metadata, caveats, and recommendations are present and legible.
- No blank pages, clipped content, standalone app controls, internal artifact labels, or absolute local paths were found.
