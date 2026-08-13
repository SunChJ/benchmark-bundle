# DeepSeek Harness Output Quality Assessment

## Review protocol

- All 12 cases use the same canonical prompt SHA-256: `bee2dabb86385df8686e5f48fa5e9fd70d33acbf9b833f9c487114c725b8a48e`. The DSH copy only removes Markdown trailing spaces and the terminal newline.
- Each HTML output was served from the same local HTTP server and reviewed in the Codex in-app browser at a 1280×720 viewport.
- Browser checks covered the assembled state, Space-triggered exploded state after animation completion, page-specific console errors, and label/layout readability.
- Round-trip exploded → collapsed behavior was checked for the leading Pi/Codex candidates and DSH Flash/max and Pro/high.
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
| `codex-ds-flash-high` | 30 | 29 | 21 | 14 | **94** | No | Best overall implementation. Correct horizontal geometry, clear opaque shutter, working state machine, and strong static checks; exploded labels crowd the lower shell. |
| `pi-pro-high` | 30 | 29 | 22 | 10 | **91** | No | Best visual composition. Correct geometry and strong layer separation; labels remain readable but crowd the right/bottom edge. |
| `pi-flash-max` | 30 | 28 | 17 | 14 | **89** | No | Strong implementation and extensive targeted checks. Assembled state is clean; exploded framing clips top/bottom content. |
| `ds-harness-flash-max` | 30 | 28 | 18 | 12 | **88** | No | Strong DSH result and a successful browser round trip. Shutter placement is credible; exploded top shell and some labels are clipped at the viewport edge. |
| `ds-harness-pro-high` | 30 | 28 | 18 | 11 | **87** | No | Clean assembled state and reliable round trip. Exploded geometry is sound, but central labels overlap and the right side is crowded. |
| `codex-ds-pro-high` | 30 | 28 | 18 | 9 | **85** | No | Fastest run with a usable result. Correct core geometry and round trip; exploded labels are dense and slightly clipped. |
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

## Decision guidance

- Default throughput choice remains `codex-ds-pro-high`: 10:19, score 85, one-shot completion.
- Highest implementation quality remains `codex-ds-flash-high`: score 94 at 21:34.
- Best DSH result is `ds-harness-flash-max`: score 88, but 45:36 adjusted active time and two manual continuations.
- Avoid automatic Pro/max escalation. It is slower in every harness and produces either a critical defect or the weakest DSH composition.
