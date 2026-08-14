# DSH Preview CLI Recommendation Evidence

## Decision framing

The DSH `minimal` preset closes the largest gap in the preceding benchmark snapshot: all four cases now finish one-shot without a manual continuation or stream timeout. The remaining work is narrower and more actionable—normalize tool outcomes, catch semantic render defects, reduce long Pro-tier tool loops, and prove the improvement across repeated runs.

## Evidence-backed findings

- DSH completed 4/4 cases one-shot, matching Pi and Codex in the current single-run DeepSeek matrix. The sessions contain zero manual continuations and zero stream-timeout occurrences.
- The four sessions contain 9 observable actionable failures in 277 tool calls (3.2%): one harness-declared stale-file conflict and eight non-zero command exits returned without an error flag.
- Capability filtering improved: none of the four text-only DeepSeek sessions attempted `read_image`, so the previous permanent capability mismatch is absent.
- DSH runtime now spans 18.5–59.3 minutes. Flash/high is the practical DSH default at 22.4 minutes and 90/100; Pro/high gains one quality point but takes 59.3 minutes and 82 model calls.
- The fastest DSH case, Flash/max at 18.5 minutes, has a critical semantic defect: its magnetic disk and hub are vertical. Syntax/source checks did not catch the error, so speed alone is not a safe selector.
- Pro/high and Pro/max ran headless-browser/CDP checks in-session, while the Flash cases relied on source and syntax checks. External 1280×720 review was still required to score visual correctness.

## Recommended roadmap

| Priority | Workstream | Proposed change | Preview exit signal |
|---|---|---|---|
| P0 | Outcome normalization | Convert every non-zero command exit into a typed failed tool result with exit code, stderr, and retry class. | No actionable subprocess failure is returned as a successful tool result. |
| P0 | Semantic render validation | Provide `render_validate` as a text/JSON oracle for console, DOM, viewport, state transitions, geometry orientation, and label collisions. | No critical geometry or viewport defect passes automated acceptance. |
| P1 | Safe edit recovery | Carry revision tokens and automatically re-read and replay one stale edit. | The stale-edit fixture completes within one bounded replay. |
| P1 | Tool-loop efficiency | Budget model/tool rounds and summarize stable context before replaying it. | Repeated runs reduce p50/p90 calls, tokens, and elapsed time without quality loss. |
| P1 | Headless preflight | Resolve sandbox, approvals, paths, browser support, and tool availability before the first model call. | No mid-run permission-mode changes in non-interactive runs. |
| P1 | Observability | Emit a stable JSON summary with preset, resolved versions, timings, tokens/cache, retries, errors by class, exit reason, and artifacts. | Every benchmark run produces a schema-valid summary. |
| P2 | Regression and reproducibility | Pin the minimal-preset manifest and repeat the matched matrix with deterministic recovery fixtures. | One-shot and capability gains hold across at least 20 runs and injected failures. |

## Proposed preview exit gates

The following are product acceptance targets, not statistical conclusions from the current `n=1` per cell:

- One-shot completion: maintain at least 95% across 20 or more repeated runs; the current sample is 4/4.
- Manual continuation: maintain zero in unattended mode; the current sample is zero.
- Capability mismatch: maintain zero under model-profile regression tests; the current sample is zero.
- Recovery: 100% for deterministic stream-interruption and stale-edit fixtures within a bounded retry budget.
- Outcome normalization: 100% of non-zero exits surface as structured tool failures; eight are currently unflagged.
- Semantic validation: zero critical orientation, viewport, or label-collision defects accepted by the render oracle; one current case escaped.
- Permissions: zero mid-run permission transitions in headless mode; one current transition remains.
- Telemetry: 100% schema-valid JSON summaries with explicit exit reasons.
- Performance: report p50 and p90 time, model/tool calls, and input tokens; do not use cache hit rate as an efficiency proxy.

## Product posture

The `minimal` preset should be presented as a successful reliability improvement, not as proof that the preview contract is finished. Current evidence supports DSH Flash/high as the quality/speed default, blocks Flash/max on its semantic defect, and does not justify automatic escalation to Pro/max.
