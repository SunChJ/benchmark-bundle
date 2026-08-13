-- Materialized, reviewed case-level evidence for the report artifact.
-- Source metrics come from analyze-runs.mjs; quality fields come from quality-assessment.md.
WITH cases(
  case_name,
  harness,
  model_tier,
  effort,
  duration_s,
  duration_min,
  total_input_tokens,
  cached_input_tokens,
  uncached_input_tokens,
  cache_hit_rate,
  output_tokens,
  reasoning_output_tokens,
  model_calls,
  tool_calls,
  quality_score,
  critical_status,
  observed_result,
  output_path
) AS (
  VALUES
    ('codex-ds-flash-high', 'Codex', 'Flash', 'high', 1294.126, 21.5688, 2572715, 2552064, 20651, 0.9919730712496332, 32311, 12142, 20, 25, 94, 'Pass', 'Best overall implementation; strong exploded view, minor lower-label crowding.', 'runs/20260813195515/codex-ds-flash-high/floppy-disk-blueprint.html'),
    ('pi-pro-high', 'Pi', 'Pro', 'high', 1049.822, 17.4970, 673469, 657408, 16061, 0.9761518347540866, 90884, 79122, 8, 7, 91, 'Pass', 'Best visual composition; clear layer separation, some right/bottom label crowding.', 'runs/20260813195515/pi-pro-high/floppy-exploded.html'),
    ('pi-flash-max', 'Pi', 'Flash', 'max', 845.870, 14.0978, 2624424, 2604032, 20392, 0.9922299140687633, 93837, 69119, 29, 28, 89, 'Pass', 'Strong Flash alternative; correct geometry, but exploded framing clips top/bottom labels.', 'runs/20260813193424/pi-flash-max/floppy-exploded-view.html'),
    ('codex-ds-pro-high', 'Codex', 'Pro', 'high', 619.162, 10.3194, 756309, 737920, 18389, 0.9756858638466552, 53076, 32482, 15, 14, 85, 'Pass', 'Fastest usable result; correct core geometry, denser labels and slight top clipping.', 'runs/20260813195515/codex-ds-pro-high/index.html'),
    ('codex-ds-flash-max', 'Codex', 'Flash', 'max', 995.252, 16.5875, 1520846, 1507456, 13390, 0.9911956897674058, 70660, 46039, 23, 22, 78, 'Pass', 'Functionally complete; exploded view is over-zoomed with clipped and misleading labels.', 'runs/20260813195515/codex-ds-flash-max/floppy_blueprint.html'),
    ('pi-pro-max', 'Pi', 'Pro', 'max', 2076.601, 34.6100, 2912213, 2882176, 30037, 0.9896858505885386, 161557, 133661, 20, 19, 64, 'Critical', 'Exploded geometry completes, but label animation continuously throws on undefined .style.', 'runs/20260813195515/pi-pro-max/floppy-blueprint.html'),
    ('codex-ds-pro-max', 'Codex', 'Pro', 'max', 1902.947, 31.7158, 3529832, 3419008, 110824, 0.9686036049307729, 135505, 108138, 23, 32, 53, 'Critical', 'Semantic geometry failure: extruded shell remains in XY and the floppy stands vertically.', 'runs/20260813195515/codex-ds-pro-max/floppy-disk-blueprint.html'),
    ('pi-flash-high', 'Pi', 'Flash', 'high', 1247.667, 20.7945, 3801287, 3781504, 19783, 0.9947957099792780, 102333, 79451, 41, 40, 52, 'Critical', 'Semantic geometry failure: extruded shell remains vertical despite extensive self-tests.', 'runs/20260813193424/pi-flash-high/index.html')
)
SELECT
  case_name AS "case",
  harness,
  model_tier,
  effort,
  duration_s,
  duration_min,
  total_input_tokens,
  cached_input_tokens,
  uncached_input_tokens,
  cache_hit_rate,
  output_tokens,
  reasoning_output_tokens,
  model_calls,
  tool_calls,
  quality_score,
  critical_status,
  observed_result,
  output_path
FROM cases;
