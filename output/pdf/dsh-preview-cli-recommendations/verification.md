# DSH Preview CLI HTML Report Verification

## Source resolution

- Report generated at: `2026-08-14T09:22:52Z`.
- The recommendation report resolves its benchmark evidence from the repository-local canonical comparison artifact and raw Pi, Codex, and DSH run logs.
- A dedicated DSH audit parses every `tool/result` envelope and distinguishes the harness-declared stale-file conflict from non-zero command exits returned without an error flag.
- The canonical and portable artifacts are byte-identical. All source paths are safe repository-relative paths; raw sessions, executable analysis, SQL materializations, recommendation rationale, metric definitions, and proposed targets remain inspectable.

## Analytical validation

- DSH error audit: 9 actionable failures across four minimal-preset sessions.
- Failure surfaces: 1 harness-declared stale-file conflict and 8 command/runtime failures not flagged as tool errors.
- Failure classes: 8 non-zero command exits and 1 stale file revision.
- Per-case audit counts: Flash/high 0, Flash/max 1, Pro/high 5, and Pro/max 3.
- One-shot reconciliation: Codex 4/4, Pi 4/4, and DSH 4/4; DSH recorded zero manual continuations, zero stream timeouts, and zero incompatible tool calls.
- Quality reconciliation: Pro/high 91, Flash/high 90, Pro/max 82, and Flash/max 74 with a critical vertical-disk/hub defect.
- External control boundary: Pi/Codex × GPT-5.6 Sol high/xhigh/max is 6/6 one-shot and provides a second matched Pi/Codex harness comparison, but it does not include DSH and remains outside the DeepSeek aggregate.
- SQLite materializations: 18 case rows, 5 execution-stack rows, 5 lifecycle rows, 2 error-class rows, 7 recommendation rows, and 8 acceptance-gate rows. The DSH report visual filters the stack summary to the three matched DeepSeek rows.
- Proposed preview exit targets are explicitly labeled as recommendations rather than measured results.

## HTML validation

- Data Analytics artifact validation: passed.
- Portable HTML packaging and browser verification: passed.
- Portable payload: 6 bounded datasets and 11 canonical sources.
- Portable HTML contents: 25 ordered blocks, 3 native charts, and 4 tables.
- Source dialog and keyboard interaction checks: passed.
- Responsive checks: passed at 1440 px and 390 px.
- HTML SHA-256: `4d08d9364c733b8a12b5e0716dd1fc4f80bb37451f6ffc5bca709274561771c2`.
- The report is delivered as HTML only; no PDF is retained for this report.
