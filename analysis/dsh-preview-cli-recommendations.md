# DSH Preview CLI Recommendation Evidence

## Decision framing

This report treats DSH as a preview CLI with credible output quality but an incomplete unattended-execution contract. The goal is to improve one-shot completion and recovery behavior without hiding the product's preview status or conflating model capability with harness capability.

## Evidence-backed findings

- DSH completed 0/4 benchmark cases one-shot. Pi and Codex completed 8/8 combined with the same DeepSeek model tiers and effort levels.
- DSH produced 23 observable actionable failures: 9 harness-declared tool failures plus 14 command/runtime failures embedded in successful tool-result envelopes. The latter comprise 10 non-zero exits and 4 JavaScript runtime exceptions.
- The 9 declared failures in 178 tool calls (5.1%) alone understate the real failure surface. DSH Pro/high recorded 0 harness-declared tool failures but still contained 2 non-zero command exits and required two manual continuation turns.
- The four DSH sessions recorded 20 stream-timeout occurrences, 15 LLM retries, 8 manual continuations, and 3 mid-run permission changes.
- After excluding explicit disconnect and retry waits, DSH still required 40.3–72.1 minutes. The four DSH artifacts scored 72–88/100 and all passed the implementation-quality rubric.
- Three DSH cases attempted `read_image` even though the selected DeepSeek models do not accept image input. The correct remedy is capability negotiation plus a text/JSON validation oracle, not pretending that the model can see screenshots.

## Recommended roadmap

| Priority | Workstream | Proposed change | Preview exit signal |
|---|---|---|---|
| P0 | Turn continuity | Add a progress-aware stream watchdog, same-turn automatic resume, idempotent step IDs, and an atomic completion marker. | Synthetic stream interruptions recover without a user continuation. |
| P0 | Capability negotiation | Resolve model capabilities before the first turn and hide incompatible tools such as `read_image`. | Zero permanent capability-mismatch tool calls. |
| P0 | Visual validation | Provide `render_validate` as an external oracle returning console, DOM, viewport, state-transition, and image-statistics results as text/JSON. | Pure-text models can verify visual tasks without direct image input. |
| P1 | Tool contracts | Normalize non-zero exits/runtime exceptions into typed failure envelopes, then classify recovery policy. | No actionable subprocess failure is returned as a successful tool result. |
| P1 | Safe edits | Add revision tokens; on stale conflict, automatically re-read and replay once. | Concurrent-edit fixture completes without model-led recovery. |
| P1 | Headless preflight | Resolve sandbox, approvals, paths, browser support, and tool availability before the first model call. | No mid-run permission-mode changes in non-interactive runs. |
| P1 | Observability | Emit a stable JSON summary with resolved versions, timings, tokens/cache, retries, errors by class, exit reason, and artifacts. | Every benchmark run produces a schema-valid summary. |
| P2 | Reproducibility and UX | Pin the resolved CLI version/integrity, add `dsh resume <session>`, and explain automatic recovery in concise user-facing status messages. | A run can be reproduced and resumed from its recorded manifest. |

## Proposed preview exit gates

The following are product acceptance targets, not measurements from the current n=1-per-cell benchmark:

- One-shot completion: 4/4 on the current regression set, then at least 95% across 20 or more repeated runs.
- Manual continuation: zero in unattended mode.
- Capability mismatch: zero exposed incompatible tools after preflight.
- Recovery: 100% for deterministic stream interruption and stale-edit fixtures within a bounded retry budget.
- Outcome normalization: 100% of non-zero exits and runtime exceptions surface as structured tool failures.
- Permissions: zero mid-run permission transitions in headless mode.
- Telemetry: 100% schema-valid JSON summaries with explicit exit reasons.
- Performance: report p50 and p90 adjusted time separately from wall time; do not use cache hit rate as an efficiency proxy.

## Product posture

The suggested messaging is intentionally friendly: DSH already demonstrates competitive artifact quality, so the preview label should communicate that reliability and recovery semantics are still being hardened. The harness should surface recoverable states as product behavior, not as blame assigned to the model or the user.
