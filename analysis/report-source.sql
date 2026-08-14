-- Materialized, reviewed case-level evidence for the report artifact.
-- Source metrics come from analyze-runs.mjs; quality fields come from quality-assessment.md.
WITH cases(
  case_name,
  harness,
  model_tier,
  effort,
  duration_s,
  duration_min,
  wall_duration_min,
  excluded_wait_min,
  total_input_tokens,
  cached_input_tokens,
  uncached_input_tokens,
  cache_hit_rate,
  output_tokens,
  reasoning_output_tokens,
  model_calls,
  tool_calls,
  tool_failures,
  tool_failure_rate,
  declared_tool_failures,
  unflagged_command_failures,
  one_shot_completed,
  completion_mode,
  manual_continues,
  stream_timeouts,
  llm_retries,
  permission_changes,
  quality_score,
  critical_status,
  observed_result,
  output_path
) AS (
  VALUES
    ('pi-gpt56-sol-max', 'Pi', 'Sol', 'max', 657.812, 10.9635, 10.9635, 0.0000, 386528, 338432, 48096, 0.8755691696332478, 34247, 19090, 12, 12, 1, 0.0833333333333333, NULL, NULL, 1, 'one-shot', 0, 0, 0, 0, 94, 'Pass', 'Excellent geometry and exploded composition; clean round trip, slight right-label crowding, and one recovered sandbox-denied check.', 'runs/20260814101425/pi-gpt56-sol-max/index.html'),
    ('codex-ds-flash-high', 'Codex', 'Flash', 'high', 1294.126, 21.5688, 21.5688, 0.0000, 2572715, 2552064, 20651, 0.9919730712496332, 32311, 12142, 20, 25, 6, 0.2400000000000000, NULL, NULL, 1, 'one-shot', 0, 0, 0, 0, 94, 'Pass', 'Best overall; strong exploded view, slight lower-label crowding.', 'runs/20260813195515/codex-ds-flash-high/floppy-disk-blueprint.html'),
    ('codex-gpt56-sol-max', 'Codex', 'Sol', 'max', 826.173, 13.7696, 13.7696, 0.0000, 279693, 223744, 55949, 0.7999628163736668, 35483, 20490, 44, 6, 0, 0.0000000000000000, NULL, NULL, 1, 'one-shot', 0, 0, 0, 0, 92, 'Pass', 'Strong exploded composition and clean round trip; assembled scene is undersized and only static checks ran in-session.', 'runs/20260814101425/codex-gpt56-sol-max/floppy_blueprint.html'),
    ('pi-gpt56-sol-xhigh', 'Pi', 'Sol', 'xhigh', 623.985, 10.3997, 10.3997, 0.0000, 114769, 79872, 34897, 0.6959370561737055, 20915, 10016, 7, 6, 1, 0.1666666666666667, NULL, NULL, 1, 'one-shot', 0, 0, 1, 0, 92, 'Pass', 'Strong geometry and clean round trip; HD NOTCH clips, the exploded prompt stays visible, and transport/sandbox failures recover automatically.', 'runs/20260814101425/pi-gpt56-sol-xhigh/index.html'),
    ('pi-pro-high', 'Pi', 'Pro', 'high', 1049.822, 17.4970, 17.4970, 0.0000, 673469, 657408, 16061, 0.9761518347540866, 90884, 79122, 8, 7, 1, 0.1428571428571429, NULL, NULL, 1, 'one-shot', 0, 0, 0, 0, 91, 'Pass', 'Best composition; minor right/bottom label crowding.', 'runs/20260813195515/pi-pro-high/floppy-exploded.html'),
    ('dsh-mini-pro-high', 'DSH', 'Pro', 'high', 3557.427, 59.2904, 59.2904, 0.0000, 8645152, 8586240, 58912, 0.9931855449158095, 140751, 83018, 82, 80, 5, 0.0625000000000000, 0, 5, 1, 'one-shot', 0, 0, 0, 1, 91, 'Pass', 'Best DSH quality; correct geometry with lower-center and lower-right label overlap.', 'runs/dsh/dsh-mini-pro-high/index.html'),
    ('dsh-mini-flash-high', 'DSH', 'Flash', 'high', 1342.584, 22.3764, 22.4091, 0.0327, 2905206, 2882304, 22902, 0.9921169101261667, 88601, 50698, 51, 50, 0, 0.0000000000000000, 0, 0, 1, 'one-shot', 0, 0, 3, 0, 90, 'Pass', 'Best DSH quality/speed trade-off; correct geometry with a slight top clip and crowded write-protect labels.', 'runs/dsh/dsh-mini-flash-high/floppy_exploded.html'),
    ('pi-gpt56-sol-high', 'Pi', 'Sol', 'high', 270.052, 4.5009, 4.5009, 0.0000, 84789, 61440, 23349, 0.7246222977037116, 13117, 4911, 5, 4, 0, 0.0000000000000000, NULL, NULL, 1, 'one-shot', 0, 0, 0, 0, 90, 'Pass', 'Clean round trip and strong geometry; exploded labels overlap around the disk/hub and lower-right components.', 'runs/20260814101425/pi-gpt56-sol-high/index.html'),
    ('pi-flash-max', 'Pi', 'Flash', 'max', 845.870, 14.0978, 14.0978, 0.0000, 2624424, 2604032, 20392, 0.9922299140687633, 93837, 69119, 29, 28, 2, 0.0714285714285714, NULL, NULL, 1, 'one-shot', 0, 0, 0, 0, 89, 'Pass', 'Correct geometry; exploded top/bottom framing clips.', 'runs/20260813193424/pi-flash-max/floppy-exploded-view.html'),
    ('codex-gpt56-sol-xhigh', 'Codex', 'Sol', 'xhigh', 628.319, 10.4720, 10.4720, 0.0000, 19472, 0, 19472, 0.0000000000000000, 18915, 8128, 24, 0, 0, NULL, NULL, NULL, 1, 'one-shot', 0, 0, 0, 0, 86, 'Pass', 'Clean round trip and separated labels; top geometry and HD NOTCH clip, explicit 80 ms stagger is missing, and the response was not written or browser-tested in-session.', 'runs/20260814101425/codex-gpt56-sol-xhigh/sol-xhigh.html'),
    ('codex-ds-pro-high', 'Codex', 'Pro', 'high', 619.162, 10.3194, 10.3194, 0.0000, 756309, 737920, 18389, 0.9756858638466552, 53076, 32482, 15, 14, 2, 0.1428571428571429, NULL, NULL, 1, 'one-shot', 0, 0, 0, 0, 85, 'Pass', 'Fastest usable; correct geometry, minor top clipping.', 'runs/20260813195515/codex-ds-pro-high/index.html'),
    ('codex-gpt56-sol-high', 'Codex', 'Sol', 'high', 261.487, 4.3581, 4.3581, 0.0000, 15321, 0, 15321, 0.0000000000000000, 14243, 4492, 9, 0, 0, NULL, NULL, NULL, 1, 'one-shot', 0, 0, 0, 0, 83, 'Pass', 'Clean round trip and strong geometry; top label clips, prompt stays visible, and the response was not written to disk.', 'runs/20260814101425/codex-gpt56-sol-high/sol-high.html'),
    ('dsh-mini-pro-max', 'DSH', 'Pro', 'max', 3004.039, 50.0673, 50.0673, 0.0000, 6911356, 6865152, 46204, 0.9933147706470337, 124312, 75927, 69, 69, 3, 0.0434782608695652, 0, 3, 1, 'one-shot', 0, 0, 0, 0, 82, 'Pass', 'Correct geometry and round trip; undersized scene with heavy central and lower-right label overlap.', 'runs/dsh/dsh-mini-pro-max/floppy-disk.html'),
    ('codex-ds-flash-max', 'Codex', 'Flash', 'max', 995.252, 16.5875, 16.5875, 0.0000, 1520846, 1507456, 13390, 0.9911956897674058, 70660, 46039, 23, 22, 7, 0.3181818181818182, NULL, NULL, 1, 'one-shot', 0, 0, 0, 0, 78, 'Pass', 'Complete; exploded framing over-zoomed and mislabelled.', 'runs/20260813195515/codex-ds-flash-max/floppy_blueprint.html'),
    ('dsh-mini-flash-max', 'DSH', 'Flash', 'max', 1107.398, 18.4566, 18.4566, 0.0000, 6317794, 6293632, 24162, 0.9961755638123053, 108001, 65595, 79, 78, 1, 0.0128205128205128, 1, 0, 1, 'one-shot', 0, 0, 0, 0, 74, 'Critical', 'Magnetic disk and hub are rotated vertically despite a clean interaction round trip.', 'runs/dsh/dsh-mini-flash-max/index.html'),
    ('pi-pro-max', 'Pi', 'Pro', 'max', 2076.601, 34.6100, 34.6100, 0.0000, 2912213, 2882176, 30037, 0.9896858505885386, 161557, 133661, 20, 19, 4, 0.2105263157894737, NULL, NULL, 1, 'one-shot', 0, 0, 0, 0, 64, 'Critical', 'Label fade-in throws; labels never render.', 'runs/20260813195515/pi-pro-max/floppy-blueprint.html'),
    ('codex-ds-pro-max', 'Codex', 'Pro', 'max', 1902.947, 31.7158, 31.7158, 0.0000, 3529832, 3419008, 110824, 0.9686036049307729, 135505, 108138, 23, 32, 2, 0.0625000000000000, NULL, NULL, 1, 'one-shot', 0, 0, 0, 0, 53, 'Critical', 'Vertical shell caused by unrotated extrusions.', 'runs/20260813195515/codex-ds-pro-max/floppy-disk-blueprint.html'),
    ('pi-flash-high', 'Pi', 'Flash', 'high', 1247.667, 20.7945, 20.7945, 0.0000, 3801287, 3781504, 19783, 0.9947957099792780, 102333, 79451, 41, 40, 6, 0.1500000000000000, NULL, NULL, 1, 'one-shot', 0, 0, 0, 0, 52, 'Critical', 'Vertical shell despite extensive self-tests.', 'runs/20260813193424/pi-flash-high/index.html')
)
SELECT
  case_name AS "case",
  harness,
  CASE model_tier WHEN 'Sol' THEN harness || ' / GPT-5.6 Sol' ELSE harness || ' / DeepSeek' END AS stack,
  CASE
    WHEN model_tier = 'Sol' THEN 'Sol · ' || harness
    WHEN harness = 'Codex' THEN 'DS · Codex'
    WHEN harness = 'Pi' THEN 'DS · Pi'
    ELSE 'DS · DSH'
  END AS stack_label,
  CASE model_tier WHEN 'Sol' THEN 'OpenAI' ELSE 'DeepSeek' END AS model_family,
  model_tier,
  effort,
  lower(harness) || '-' || lower(model_tier) || '/' || effort AS case_label,
  duration_s,
  duration_min,
  wall_duration_min,
  excluded_wait_min,
  total_input_tokens,
  cached_input_tokens,
  uncached_input_tokens,
  cache_hit_rate,
  output_tokens,
  reasoning_output_tokens,
  model_calls,
  tool_calls,
  tool_failures,
  tool_failure_rate,
  declared_tool_failures,
  unflagged_command_failures,
  one_shot_completed,
  completion_mode,
  manual_continues,
  stream_timeouts,
  llm_retries,
  permission_changes,
  quality_score,
  critical_status,
  observed_result,
  CASE
    WHEN harness = 'Codex' AND model_tier = 'Sol' AND effort IN ('high', 'xhigh')
      THEN 'Final-response HTML; materialized by benchmark wrapper'
    ELSE 'Written by the model through harness tools'
  END AS artifact_delivery,
  output_path
FROM cases;
