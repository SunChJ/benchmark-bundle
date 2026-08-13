# DeepSeek Harness Output Quality Assessment

## Review protocol

- All eight cases use the same prompt SHA-256: `c96144a8e824835043a65b3efdf287aee7bf35fb1abebd347e951ce0b86d3c52`.
- Each HTML output was served from the same local HTTP server and reviewed in the Codex in-app browser at a 1280×720 viewport.
- Browser checks covered initial assembled state, Space-triggered exploded state after 4.6 seconds, page-specific console errors, and label/layout readability.
- The four strongest candidates also completed an exploded → collapsed round trip without page-specific console errors.
- Static review checked the requested Three.js imports, orthographic camera, geometry construction, shared shutter channel, opacity/state handling, controls, dashed lines, labels, resize handling, and self-check comments.

This is a single-run benchmark (`n=1` per case). Quality scores are a structured review aid, not statistically stable model rankings.

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
| `codex-ds-flash-high` | 30 | 29 | 21 | 14 | **94** | No | Best overall implementation. Correct horizontal geometry, clear opaque shutter, working state machine, strong static checks; exploded labels are somewhat crowded near the lower shell. |
| `pi-pro-high` | 30 | 29 | 22 | 10 | **91** | No | Best visual composition. Correct geometry and strong layer separation; labels remain readable but crowd the right/bottom edge. Verification was mostly syntax-level. |
| `pi-flash-max` | 30 | 28 | 17 | 14 | **89** | No | Strong implementation and extensive targeted checks. Assembled state is clean; exploded framing clips top/bottom content and weakens labels. |
| `codex-ds-pro-high` | 30 | 28 | 18 | 9 | **85** | No | Fastest run with a usable result. Correct core geometry and round trip; the exploded composition and labels are denser and slightly clipped. |
| `codex-ds-flash-max` | 30 | 27 | 11 | 10 | **78** | No | Functionally complete, but the exploded camera/framing is substantially over-zoomed and several labels are misleadingly placed. |
| `pi-pro-max` | 12 | 28 | 17 | 7 | **64** | **Yes** | Geometry is visually sound, but label fade-in throws continuously at `L.obj.el.style`; labels never render. Geometry-only validation missed the browser failure. |
| `codex-ds-pro-max` | 30 | 10 | 5 | 8 | **53** | **Yes** | Shell and other extruded shapes remain in the XY plane, so the floppy stands vertically. Claimed Chromium regression checks verified state changes but missed the semantic orientation failure. |
| `pi-flash-high` | 30 | 10 | 4 | 8 | **52** | **Yes** | Same coordinate-plane failure: extruded shell geometry is not rotated into XZ, producing a vertical shell in both states. Extensive non-browser assertions gave a false sense of coverage. |

## Critical defect locations

- `pi-flash-high`: `shellGeometry()` creates `ExtrudeGeometry` but does not rotate it into the XZ plane (`runs/20260813193424/pi-flash-high/index.html`, around line 275).
- `codex-ds-pro-max`: shell, liner, hub, and shutter extrusions are translated but not rotated into the XZ plane (`runs/20260813195515/codex-ds-pro-max/floppy-disk-blueprint.html`, first visible at line 301).
- `pi-pro-max`: label animation dereferences the nonexistent `CSS2DObject.el` property instead of the label element (`runs/20260813195515/pi-pro-max/floppy-blueprint.html`, line 752).

## Decision guidance

- Default throughput choice: `codex-ds-pro-high` — fastest usable output at 10:19.
- Highest implementation quality: `codex-ds-flash-high` — score 94, but 21:34 latency.
- Highest visual quality: `pi-pro-high` — score 91 at 17:30.
- Strong Flash alternative: `pi-flash-max` — score 89 at 14:06.
- Avoid Pro/max for this task: both harnesses were slower than Pro/high and produced critical defects.
