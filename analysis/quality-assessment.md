# CLI Harness Output Quality Assessment

## Review protocol

- All 18 cases use the same canonical prompt SHA-256: `bee2dabb86385df8686e5f48fa5e9fd70d33acbf9b833f9c487114c725b8a48e`. The DSH copy only removes Markdown trailing spaces and the terminal newline.
- Each HTML output was served from the same local HTTP server and reviewed in the Codex in-app browser at a 1280×720 viewport.
- Browser checks covered the assembled state, Space-triggered exploded state after animation completion, page-specific console errors, and label/layout readability.
- Round-trip exploded → collapsed behavior was checked for the leading Pi/Codex candidates, DSH Flash/max and Pro/high, and all six GPT-5.6 Sol controls.
- Static review checked Three.js imports, orthographic camera, geometry construction, shared shutter channel, opacity/state handling, controls, dashed lines, labels, resize handling, and self-check comments.

This is a single-run benchmark (`n=1` per harness × tier × effort cell). Quality scores are a structured review aid, not statistically stable model rankings.

## Rubric

| Dimension | Weight | Interpretation |
| --- | ---: | --- |
| Functional correctness | 30 | Loads, animates, completes state transitions, and avoids runtime errors |
| Geometry and specification compliance | 30 | Correct coordinate plane, compound parts, holes, shutter constraints, camera, controls, opacity, and timing |
| Visual fidelity and composition | 25 | Readable assembled/exploded states, framing, layer separation, label placement, and blueprint aesthetics |
| Verification and maintainability | 15 | Clear structure, shared constants, targeted checks, and whether validation catches semantic failures |

A critical defect overrides the numeric score for deployment recommendations.

## Scores and observed evidence

| Case | Functional | Spec | Visual | Verification | Total | Critical defect | Review summary |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `pi-gpt56-sol-max` | 30 | 29 | 21 | 14 | **94** | No | Excellent geometry and exploded composition with a clean round trip. Right-edge write-protect labels crowd slightly; one sandbox-denied `/tmp` check was recovered in-session. |
| `codex-ds-flash-high` | 30 | 29 | 21 | 14 | **94** | No | Best overall implementation. Correct horizontal geometry, clear opaque shutter, working state machine, and strong static checks; exploded labels crowd the lower shell. |
| `codex-gpt56-sol-max` | 30 | 29 | 20 | 13 | **92** | No | Strong exploded composition, all labels within the 1280×720 viewport, clean console, and a successful round trip. The assembled scene is undersized; in-session verification covered syntax and key source assertions but could not launch a browser. |
| `pi-gpt56-sol-xhigh` | 30 | 29 | 20 | 13 | **92** | No | Strong geometry and a clean round trip. All labels eventually render, but HD NOTCH clips above the viewport and the exploded prompt remains visible. One WebSocket failure and one sandbox-denied `/tmp` check both recovered automatically. |
| `pi-pro-high` | 30 | 29 | 22 | 10 | **91** | No | Best visual composition. Correct geometry and strong layer separation; labels remain readable but crowd the right/bottom edge. |
| `pi-gpt56-sol-high` | 30 | 29 | 18 | 13 | **90** | No | Clean round trip, strong geometry, and successful static checks. Exploded labels overlap around the disk/hub and lower-right components, reducing diagram readability. |
| `pi-flash-max` | 30 | 28 | 17 | 14 | **89** | No | Strong implementation and extensive targeted checks. Assembled state is clean; exploded framing clips top/bottom content. |
| `ds-harness-flash-max` | 30 | 28 | 18 | 12 | **88** | No | Strong DSH result and a successful browser round trip. Shutter placement is credible; exploded top shell and some labels are clipped at the viewport edge. |
| `ds-harness-pro-high` | 30 | 28 | 18 | 11 | **87** | No | Clean assembled state and reliable round trip. Exploded geometry is sound, but central labels overlap and the right side is crowded. |
| `codex-gpt56-sol-xhigh` | 30 | 28 | 20 | 8 | **86** | No | Clean round trip, strong geometry, separated labels, and a correctly hidden exploded prompt. The top shell and HD NOTCH label clip above the viewport, explicit 80 ms staggering is absent, and the complete final-response HTML was not written or browser-tested in-session. |
| `codex-ds-pro-high` | 30 | 28 | 18 | 9 | **85** | No | Fastest run with a usable result. Correct core geometry and round trip; exploded labels are dense and slightly clipped. |
| `codex-gpt56-sol-high` | 28 | 28 | 19 | 8 | **83** | No | Clean assembled/exploded/collapsed round trip with no console errors and strong geometry. The top label clips, the animated prompt remains visible after explosion, and the model returned HTML without writing or browser-validating a file; the benchmark wrapper materialized the final response unchanged. |
| `ds-harness-flash-high` | 30 | 23 | 14 | 12 | **79** | No | Runs cleanly, but the opaque shutter appears detached from the shell in the assembled view; exploded framing clips the top/bottom and multiple labels overlap. |
| `codex-ds-flash-max` | 30 | 27 | 11 | 10 | **78** | No | Functionally complete, but the exploded camera/framing is substantially over-zoomed and several labels are misleadingly placed. |
| `ds-harness-pro-max` | 30 | 27 | 6 | 9 | **72** | No | Core interaction works, but the model is too small in frame, central labels overlap heavily, and the right vertical title is visibly clipped/broken. |
| `pi-pro-max` | 12 | 28 | 17 | 7 | **64** | **Yes** | Geometry is visually sound, but label fade-in throws continuously at `L.obj.el.style`; labels never render. Geometry-only validation missed the browser failure. |
| `codex-ds-pro-max` | 30 | 10 | 5 | 8 | **53** | **Yes** | Shell and other extruded shapes remain in the XY plane, so the floppy stands vertically. Claimed Chromium regression checks verified state changes but missed semantic orientation. |
| `pi-flash-high` | 30 | 10 | 4 | 8 | **52** | **Yes** | The same coordinate-plane failure leaves the shell vertical in both states. Extensive non-browser assertions gave false confidence. |

## Critical defect locations

- `pi-flash-high`: `shellGeometry()` creates `ExtrudeGeometry` but does not rotate it into the XZ plane (`runs/20260813193424/pi-flash-high/index.html`, around line 275).
- `codex-ds-pro-max`: shell, liner, hub, and shutter extrusions are translated but not rotated into the XZ plane (`runs/20260813195515/codex-ds-pro-max/floppy-disk-blueprint.html`, first visible at line 301).
- `pi-pro-max`: label animation dereferences the nonexistent `CSS2DObject.el` property instead of the label element (`runs/20260813195515/pi-pro-max/floppy-blueprint.html`, line 752).

## DSH visual-validation caveat

DeepSeek V4 Flash/Pro are text-only in these sessions. Three of four DSH runs called `read_image` and received a permanent model-capability error. The generated preview PNGs therefore do not prove that the primary model inspected the result. DSH quality scores above come from an external browser review, not from the model's own image acceptance.

## GPT-5.6 Sol control caveat

The Codex Sol/high and Sol/xhigh responses contained complete standalone HTML documents but made zero tool calls and did not write files. The benchmark wrapper materialized the exact final responses as `sol-high.html` and `sol-xhigh.html` solely for browser QA. Codex Sol/max and all three Pi Sol cases wrote their own files and ran static checks. Pi Sol/max and Pi Sol/xhigh each recorded one recoverable tool failure when an absolute `/tmp` write was rejected by the outer sandbox; Pi Sol/xhigh also recovered from one WebSocket model-call failure without manual input. All six final scores use the same external browser protocol as the other cases; no model session had direct visual acceptance evidence.

## Decision guidance

- Default throughput choice remains `codex-ds-pro-high`: 10:19, score 85, one-shot completion.
- Highest implementation quality remains `codex-ds-flash-high`: score 94 at 21:34.
- External controls reach 94 for `pi-gpt56-sol-max` at 10:58 and 92 for `pi-gpt56-sol-xhigh` at 10:24. The matched Pi-vs-Codex Sol pairs can cross-check harness behavior within the Sol family, but Sol should not be folded into the DeepSeek aggregate.
- Best DSH result is `ds-harness-flash-max`: score 88, but 45:36 adjusted active time and two manual continuations.
- Avoid automatic Pro/max escalation. It is slower in every harness and produces either a critical defect or the weakest DSH composition.
