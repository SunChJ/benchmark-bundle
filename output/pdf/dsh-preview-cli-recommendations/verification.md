# DSH Preview CLI HTML Report Verification

## Source resolution

- Report generated at: `2026-08-14T04:02:56Z`.
- The recommendation report resolves its benchmark evidence from the repository-local canonical comparison artifact and raw Pi, Codex, and DSH run logs.
- A dedicated DSH audit parses every `tool/result` envelope and distinguishes harness-declared failures from non-zero command exits and runtime exceptions returned without an error flag.
- The canonical and portable artifacts are byte-identical. All source paths are safe repository-relative paths; raw sessions, executable analysis, SQL materializations, recommendation rationale, metric definitions, and proposed targets remain inspectable.

## Analytical validation

- DSH error audit: 23 actionable failures across four sessions.
- Failure surfaces: 9 harness-declared tool failures and 14 command/runtime failures not flagged as tool errors.
- Failure classes: 10 non-zero command exits, 5 stale file revisions, 4 unflagged runtime exceptions, 3 image capability mismatches, and 1 unsupported regex feature.
- Per-case audit counts: Flash/high 9, Flash/max 7, Pro/high 2, and Pro/max 5.
- One-shot reconciliation: Codex 4/4, Pi 4/4, and DSH 0/4.
- External control boundary: Pi/Codex × GPT-5.6 Sol high/xhigh/max is 6/6 one-shot and provides a second matched Pi/Codex harness comparison, but it does not include DSH and remains outside the DeepSeek aggregate.
- SQLite materializations: 18 case rows, 5 execution-stack rows, 4 lifecycle rows, 5 error-class rows, 7 recommendation rows, and 7 acceptance-gate rows. The DSH report visual filters the stack summary to the three matched DeepSeek rows.
- Proposed preview exit targets are explicitly labeled as recommendations rather than measured results.

## HTML validation

- Data Analytics artifact validation: passed.
- Portable HTML packaging and browser verification: passed.
- Portable payload: 6 bounded datasets and 11 canonical sources.
- Portable HTML contents: 25 ordered blocks, 3 native charts, and 4 tables.
- Source dialog and keyboard interaction checks: passed.
- Responsive checks: passed at 1440 px and 390 px.
- HTML SHA-256: `b85446b089b4f74f270509d2a98cb9ba9070d58b79cf211034a54fd203c15319`.
- The report is delivered as HTML only; no PDF is retained for this report.
