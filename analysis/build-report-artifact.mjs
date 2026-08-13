#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const analysisDir = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(analysisDir, '..');
const outputDir = path.join(workspace, 'output/pdf/deepseek-cli-harness-report');
const artifactPath = path.join(outputDir, 'artifact.json');
const portableArtifactPath = path.join(outputDir, 'artifact-portable.json');
const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

const quality = {
  'codex-ds-flash-high': [94, 'Pass', 'Best overall; strong exploded view, slight lower-label crowding.'],
  'pi-pro-high': [91, 'Pass', 'Best composition; minor right/bottom label crowding.'],
  'pi-flash-max': [89, 'Pass', 'Correct geometry; exploded top/bottom framing clips.'],
  'ds-harness-flash-max': [88, 'Pass', 'Best DSH; round trip passes, minor viewport clipping.'],
  'ds-harness-pro-high': [87, 'Pass', 'Clean DSH round trip; central labels overlap.'],
  'codex-ds-pro-high': [85, 'Pass', 'Fastest usable; correct geometry, minor top clipping.'],
  'ds-harness-flash-high': [79, 'Pass', 'Assembled shutter detached; exploded labels overlap.'],
  'codex-ds-flash-max': [78, 'Pass', 'Complete; exploded framing over-zoomed and mislabelled.'],
  'ds-harness-pro-max': [72, 'Pass', 'Undersized scene; labels and vertical title clipped.'],
  'pi-pro-max': [64, 'Critical', 'Label fade-in throws; labels never render.'],
  'codex-ds-pro-max': [53, 'Critical', 'Vertical shell caused by unrotated extrusions.'],
  'pi-flash-high': [52, 'Critical', 'Vertical shell despite extensive self-tests.'],
};

const metrics = JSON.parse(
  execFileSync(process.execPath, [path.join(analysisDir, 'analyze-runs.mjs')], {
    cwd: workspace,
    encoding: 'utf8',
  }),
);

const cases = metrics
  .map((row) => {
    const [qualityScore, criticalStatus, observedResult] = quality[row.case];
    return {
      case: row.case,
      harness: row.harness,
      model_tier: row.model.includes('Pro') ? 'Pro' : 'Flash',
      effort: row.effort,
      duration_s: Number((row.durationMs / 1000).toFixed(3)),
      duration_min: Number((row.durationMs / 60000).toFixed(4)),
      wall_duration_min: Number((row.wallDurationMs / 60000).toFixed(4)),
      excluded_wait_min: Number((row.excludedWaitMs / 60000).toFixed(4)),
      total_input_tokens: row.totalInputTokens,
      cached_input_tokens: row.cachedInputTokens,
      uncached_input_tokens: row.uncachedInputTokens,
      cache_hit_rate: row.cacheHitRate,
      input_cache_summary: `${(row.totalInputTokens / 1_000_000).toFixed(2)}M / ${(row.cacheHitRate * 100).toFixed(1)}%`,
      output_tokens: row.outputTokens,
      reasoning_output_tokens: row.reasoningOutputTokens,
      model_calls: row.modelCalls,
      tool_calls: row.toolCalls,
      tool_failures: row.toolFailureCount,
      tool_failure_rate: row.toolFailureRate,
      tool_error_summary: `${row.toolFailureCount}/${row.toolCalls}`,
      call_summary: `${row.modelCalls}/${row.toolCalls}`,
      one_shot_completed: row.oneShotCompleted,
      one_shot_rate: row.oneShotCompleted ? 1 : 0,
      completion_mode: row.completionMode,
      manual_continues: row.manualContinueCount,
      stream_timeouts: row.streamTimeoutCount,
      llm_retries: row.llmRetryCount,
      permission_changes: row.permissionChangeCount,
      retry_timeout_summary: `${row.llmRetryCount}/${row.streamTimeoutCount}`,
      quality_score: qualityScore,
      critical_status: criticalStatus,
      quality_status: `${qualityScore} · ${criticalStatus}`,
      observed_result: observedResult,
      output_path: row.outputPath,
    };
  })
  .sort((a, b) => b.quality_score - a.quality_score);

const harnessSummary = ['Codex', 'Pi', 'DSH'].map((harness) => {
  const rows = cases.filter((row) => row.harness === harness);
  const sum = (field) => rows.reduce((total, row) => total + row[field], 0);
  const oneShotCompleted = rows.filter((row) => row.one_shot_completed).length;
  const toolCalls = sum('tool_calls');
  const toolFailures = sum('tool_failures');
  return {
    harness,
    cases: rows.length,
    one_shot_completed: oneShotCompleted,
    one_shot_rate: oneShotCompleted / rows.length,
    tool_calls: toolCalls,
    tool_failures: toolFailures,
    tool_failure_rate: toolFailures / toolCalls,
    llm_retries: sum('llm_retries'),
    stream_timeouts: sum('stream_timeouts'),
    manual_continues: sum('manual_continues'),
    permission_changes: sum('permission_changes'),
  };
});

const reportSql = await readFile(path.join(analysisDir, 'report-source.sql'), 'utf8');
const harnessSummarySql = await readFile(path.join(analysisDir, 'harness-summary.sql'), 'utf8');
const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
artifact.manifest.generatedAt = generatedAt;
artifact.snapshot.generatedAt = generatedAt;
artifact.manifest.description =
  'Same-prompt comparison of Pi, Codex, and DSH running DeepSeek V4 Flash/Pro at high/max effort, including adjusted execution time, cache use, tool reliability, implementation quality, and preview-CLI recommendations.';

const benchmarkSource = {
  id: 'benchmark_analysis',
  label: 'Normalized benchmark session analysis',
  path: 'analysis/analyze-runs.mjs',
  query: {
    engine: 'node',
    id: 'analyze-runs-v2',
    language: 'javascript',
    executed_at: generatedAt,
    description:
      'Parses Pi, Codex, and DSH JSONL sessions; normalizes token/cache semantics, explicit waits, completion mode, retries, and tool outcomes; joins each session to its generated HTML.',
    tables_used: [
      'runs/20260813193424/*/.benchmark-runtime/pi/sessions/*.jsonl',
      'runs/20260813195515/*/.benchmark-runtime/{pi,codex}/sessions/**/*.jsonl',
      'runs/dsh/*/session.jsonl',
    ],
    filters: [
      'Canonical prompt SHA-256 bee2dabb86385df8686e5f48fa5e9fd70d33acbf9b833f9c487114c725b8a48e',
      'Twelve harness × model tier × effort cases; no sampling',
      'One final HTML output per case',
    ],
    metric_definitions: [
      'Adjusted completion time: end-to-end completion time less DSH intervals explicitly attributable to 300-second stream-idle timeouts, retry backoff, and error-end-to-next-turn disconnect gaps.',
      'Wall duration: first benchmark user prompt to final completed turn, including DSH interruption and retry waits.',
      'One-shot completion: final artifact delivered without a manual continuation message.',
      'Tool failure rate: explicit error tool results divided by tool calls; incidence does not measure severity or task recovery.',
      'Total input tokens: uncached input plus cache-read input. Codex input includes cached tokens, so uncached input = input - cached input.',
      'Cache hit rate: cached input tokens divided by total input tokens.',
      'Output tokens include reasoning tokens; reasoning output is the reported reasoning subset.',
    ],
  },
};

const qualitySource = {
  id: 'quality_review',
  label: 'Browser and implementation quality assessment',
  path: 'analysis/quality-assessment.md',
  query: {
    engine: 'manual-reviewed',
    id: 'quality-rubric-v2',
    language: 'markdown',
    executed_at: generatedAt,
    description:
      'Scores all 12 outputs after 1280×720 browser QA of assembled/exploded states, console inspection, selected round trips, and source review.',
    tables_used: [
      'analysis/quality-assessment.md',
      'runs/20260813193424/*/*.html',
      'runs/20260813195515/*/*.html',
      'runs/dsh/*/*.html',
    ],
    filters: [
      'All 12 outputs reviewed',
      '1280×720 viewport',
      'Exploded state triggered with Space after page load',
      'Round trip checked for leading Pi/Codex candidates and DSH Flash/max and Pro/high',
    ],
    metric_definitions: [
      'Quality score = functional correctness (30) + geometry/spec compliance (30) + visual fidelity/composition (25) + verification/maintainability (15).',
      'Critical status overrides numeric ranking when a runtime or semantic geometry defect prevents faithful task completion.',
    ],
  },
};

const joinedSource = {
  id: 'joined_results',
  label: 'Joined performance and quality evidence',
  path: 'analysis/chart-map.md',
  query: {
    engine: 'deterministic-local-join',
    id: 'case-performance-quality-v2',
    language: 'javascript+markdown',
    executed_at: generatedAt,
    description:
      'Deterministic case-key join of normalized session metrics and browser-reviewed quality scores.',
    tables_used: ['analysis/analyze-runs.mjs', 'analysis/quality-assessment.md', 'analysis/chart-map.md'],
    filters: ['Inner join on exact case identifier', 'Twelve matched rows; no missing cases and no sampling'],
    metric_definitions: [
      'Performance and reliability fields use benchmark_analysis definitions.',
      'Quality fields use the quality_review rubric and critical-defect override.',
    ],
  },
};

const reportSource = {
  id: 'report_query',
  label: 'Reviewed case-level report query',
  path: 'analysis/report-source.sql',
  query: {
    engine: 'sqlite',
    id: 'case-evidence-v2',
    language: 'sql',
    sql: reportSql,
    executed_at: generatedAt,
    description: 'Returns the 12 reviewed case-level rows used by report charts and the detail table.',
    tables_used: ['analysis/report-source.sql', 'analysis/analyze-runs.mjs', 'analysis/quality-assessment.md'],
    filters: [
      'Canonical prompt SHA-256 bee2dabb86385df8686e5f48fa5e9fd70d33acbf9b833f9c487114c725b8a48e',
      'Twelve completed artifacts; no sampling',
      'Deterministic join on exact case identifier',
    ],
    metric_definitions: benchmarkSource.query.metric_definitions.concat(
      qualitySource.query.metric_definitions,
    ),
  },
};

const harnessSummarySource = {
  id: 'harness_summary_query',
  label: 'Harness-level reliability query',
  path: 'analysis/harness-summary.sql',
  query: {
    engine: 'sqlite',
    id: 'harness-reliability-v1',
    language: 'sql',
    sql: harnessSummarySql,
    executed_at: generatedAt,
    description:
      'Aggregates the 12 reviewed cases to harness-level one-shot completion, explicit tool-result failures, retries, timeouts, continuations, and permission changes.',
    tables_used: ['analysis/harness-summary.sql', 'analysis/report-source.sql'],
    filters: ['Four cases per harness', 'Twelve total cases; no sampling'],
    metric_definitions: [
      'One-shot rate = cases completed without manual continuation divided by cases.',
      'Tool failure rate = explicit error tool results divided by tool calls.',
      'LLM retries and stream timeout occurrences are observable only in DSH session logs under the available schemas.',
    ],
  },
};

artifact.manifest.sources = [
  benchmarkSource,
  qualitySource,
  joinedSource,
  reportSource,
  harnessSummarySource,
];
artifact.sources = structuredClone(artifact.manifest.sources);
artifact.snapshot.datasets = {
  cases,
  duration_cases: [...cases].sort((a, b) => a.duration_min - b.duration_min),
  quality_cases: [...cases].sort((a, b) => b.quality_score - a.quality_score),
  harness_summary: harnessSummary,
};

artifact.manifest.cards = [];
artifact.manifest.charts = [
  {
    id: 'duration_chart',
    title: 'Adjusted completion time',
    subtitle:
      'DSH needs 40.3–72.1 active minutes after removing explicit waits; all four DSH artifacts still require two manual continuations.',
    showDescription: true,
    type: 'horizontalBar',
    dataset: 'duration_cases',
    sourceId: 'report_query',
    encodings: {
      x: { field: 'case', type: 'nominal', label: 'Case' },
      y: { field: 'duration_min', type: 'quantitative', label: 'Adjusted elapsed time', unit: 'min' },
      tooltip: [
        { field: 'harness', type: 'nominal', label: 'Harness' },
        { field: 'completion_mode', type: 'nominal', label: 'Completion mode' },
        { field: 'duration_min', type: 'quantitative', label: 'Adjusted minutes', format: 'number' },
        { field: 'wall_duration_min', type: 'quantitative', label: 'Wall minutes', format: 'number' },
        { field: 'excluded_wait_min', type: 'quantitative', label: 'Excluded waits', format: 'number' },
      ],
    },
    yAxisTitle: 'Adjusted minutes',
    valueFormat: 'number',
    maxRows: 12,
    layout: 'full',
  },
  {
    id: 'one_shot_chart',
    title: 'One-shot completion rate by harness',
    subtitle: 'Pi and Codex finish 8/8 combined without intervention; DSH finishes 0/4 without two manual continuations.',
    showDescription: true,
    type: 'horizontalBar',
    dataset: 'harness_summary',
    sourceId: 'harness_summary_query',
    encodings: {
      x: { field: 'harness', type: 'nominal', label: 'Harness' },
      y: { field: 'one_shot_rate', type: 'quantitative', label: 'One-shot completion rate' },
      tooltip: [
        { field: 'one_shot_completed', type: 'quantitative', label: 'One-shot cases', format: 'number' },
        { field: 'cases', type: 'quantitative', label: 'Cases', format: 'number' },
        { field: 'manual_continues', type: 'quantitative', label: 'Manual continues', format: 'number' },
      ],
    },
    yAxisTitle: 'One-shot completion rate',
    valueFormat: 'percent',
    maxRows: 3,
    layout: 'full',
  },
  {
    id: 'tool_failure_chart',
    title: 'Observed tool-result failure rate',
    subtitle:
      'DSH has the lowest raw incidence, proving that failure severity and recovery—not error count alone—drive its reliability gap.',
    showDescription: true,
    type: 'horizontalBar',
    dataset: 'harness_summary',
    sourceId: 'harness_summary_query',
    encodings: {
      x: { field: 'harness', type: 'nominal', label: 'Harness' },
      y: { field: 'tool_failure_rate', type: 'quantitative', label: 'Explicit tool error rate' },
      tooltip: [
        { field: 'tool_failures', type: 'quantitative', label: 'Tool failures', format: 'number' },
        { field: 'tool_calls', type: 'quantitative', label: 'Tool calls', format: 'number' },
        { field: 'llm_retries', type: 'quantitative', label: 'LLM retries', format: 'number' },
        { field: 'stream_timeouts', type: 'quantitative', label: 'Stream timeouts', format: 'number' },
      ],
    },
    yAxisTitle: 'Explicit tool error rate',
    valueFormat: 'percent',
    maxRows: 3,
    layout: 'full',
  },
  {
    id: 'cache_chart',
    title: 'Input token cache composition',
    subtitle:
      'Cache hit is high across all 12 runs, but DSH Pro/max still replays 11.0M input tokens across 75 model calls.',
    showDescription: true,
    type: 'horizontalStackedBar100',
    dataset: 'duration_cases',
    sourceId: 'report_query',
    encodings: {
      x: { field: 'case', type: 'nominal', label: 'Case' },
      y: { fields: ['cached_input_tokens', 'uncached_input_tokens'], type: 'quantitative', label: 'Input share' },
      tooltip: [
        { field: 'cache_hit_rate', type: 'quantitative', label: 'Cache hit', format: 'percent' },
        { field: 'cached_input_tokens', type: 'quantitative', label: 'Cached input', format: 'compact' },
        { field: 'uncached_input_tokens', type: 'quantitative', label: 'Uncached input', format: 'compact' },
        { field: 'total_input_tokens', type: 'quantitative', label: 'Total input', format: 'compact' },
      ],
    },
    yAxisTitle: 'Share of input tokens',
    valueFormat: 'percent',
    maxRows: 12,
    layout: 'full',
  },
  {
    id: 'quality_chart',
    title: 'Implementation quality score',
    subtitle: 'DSH Flash/max (88) and Pro/high (87) are competitive on output quality despite poor one-shot reliability.',
    showDescription: true,
    type: 'horizontalBar',
    dataset: 'quality_cases',
    sourceId: 'report_query',
    encodings: {
      x: { field: 'case', type: 'nominal', label: 'Case' },
      y: { field: 'quality_score', type: 'quantitative', label: 'Quality score', unit: '/100' },
      tooltip: [
        { field: 'critical_status', type: 'nominal', label: 'Critical status' },
        { field: 'completion_mode', type: 'nominal', label: 'Completion mode' },
        { field: 'observed_result', type: 'text', label: 'Browser finding' },
      ],
    },
    yAxisTitle: 'Score / 100',
    valueFormat: 'number',
    maxRows: 12,
    layout: 'full',
  },
  {
    id: 'frontier_chart',
    title: 'Adjusted completion time vs implementation quality',
    subtitle: 'DSH reaches competitive quality only after materially more active time and manual recovery.',
    showDescription: true,
    type: 'scatter',
    dataset: 'cases',
    sourceId: 'report_query',
    encodings: {
      x: { field: 'duration_min', type: 'quantitative', label: 'Adjusted elapsed time', unit: 'min' },
      y: { field: 'quality_score', type: 'quantitative', label: 'Quality score', unit: '/100' },
      color: { field: 'harness', type: 'nominal', label: 'Harness' },
      tooltip: [
        { field: 'case', type: 'nominal', label: 'Case' },
        { field: 'completion_mode', type: 'nominal', label: 'Completion mode' },
        { field: 'critical_status', type: 'nominal', label: 'Critical status' },
        { field: 'total_input_tokens', type: 'quantitative', label: 'Total input', format: 'compact' },
      ],
    },
    xAxisTitle: 'Adjusted completion time (min)',
    yAxisTitle: 'Quality score / 100',
    maxRows: 12,
    layout: 'full',
  },
];

artifact.manifest.tables = [
  {
    id: 'case_detail',
    title: 'Case-level performance and reliability',
    subtitle: 'DSH adjusted time excludes only identifiable waits; wall time remains visible for audit.',
    showDescription: true,
    dataset: 'cases',
    sourceId: 'report_query',
    density: 'compact',
    layout: 'full',
    defaultSort: { field: 'duration_min', direction: 'asc' },
    columns: [
      { field: 'case', label: 'Case', type: 'text' },
      { field: 'duration_min', label: 'Adjusted min', type: 'number', format: 'number', align: 'right' },
      { field: 'wall_duration_min', label: 'Wall min', type: 'number', format: 'number', align: 'right' },
      { field: 'completion_mode', label: 'Completion', type: 'text' },
      { field: 'input_cache_summary', label: 'Input/cache', type: 'text', align: 'right' },
      { field: 'call_summary', label: 'Model/tool calls', type: 'text', align: 'right' },
      { field: 'tool_error_summary', label: 'Tool err/calls', type: 'text', align: 'right' },
      { field: 'retry_timeout_summary', label: 'Retry/timeout', type: 'text', align: 'right' },
    ],
  },
  {
    id: 'quality_detail',
    title: 'Case-level browser quality findings',
    subtitle: 'Critical status overrides the numeric quality score for deployment guidance.',
    showDescription: true,
    dataset: 'quality_cases',
    sourceId: 'report_query',
    density: 'compact',
    layout: 'full',
    defaultSort: { field: 'quality_score', direction: 'desc' },
    columns: [
      { field: 'case', label: 'Case', type: 'text' },
      { field: 'quality_score', label: 'Score', type: 'number', format: 'number', align: 'right' },
      { field: 'critical_status', label: 'Status', type: 'text' },
      { field: 'observed_result', label: 'Browser finding', type: 'text' },
    ],
  },
];

artifact.manifest.blocks = [
  { id: 'title', type: 'markdown', body: '# DeepSeek CLI Harness 实测对比' },
  {
    id: 'technical_summary',
    type: 'markdown',
    sourceId: 'joined_results',
    body:
      '## Technical Summary\n\n同一 canonical prompt、12 个单次样本下，**DSH 的输出质量并不差，但执行可靠性明显落后**：最佳 DSH 输出为 Flash/max（88/100），接近 Pi Flash/max（89）；然而 DSH 4/4 都需要两次人工“继续”，Pi/Codex 8/8 均 one-shot。扣除可识别的断线与重试等待后，DSH 仍需 40.3–72.1 分钟，Pi 为 14.1–34.6 分钟，Codex 为 10.3–31.7 分钟。由于模型档位一致，这组差异主要指向 harness 的任务生命周期、工具契约与恢复策略。',
  },
  {
    id: 'duration_section',
    type: 'markdown',
    sourceId: 'benchmark_analysis',
    body:
      '## 净执行时间：去掉明确等待后，DSH 仍慢约 2–4×\n\n最可比的 Pro/high 组合中，Codex 为 10:19、Pi 为 17:30、DSH 为 40:19；DSH 墙钟时间原为 61:36，本报告按要求扣除了 21:17 的显式 stream-idle timeout、retry backoff 和错误轮次间隔。DSH 的 turn 记录存在缺失结束事件，因此 adjusted time 是保守近似，不应解读为精确 CPU 活跃时间。',
  },
  { id: 'duration_visual', type: 'chart', chartId: 'duration_chart', layout: 'full' },
  {
    id: 'reliability_section',
    type: 'markdown',
    sourceId: 'benchmark_analysis',
    body:
      '## Harness 可靠性：问题不在“报错次数多”，而在错误是否终止任务\n\nDSH 原始工具错误率只有 9/178（5.1%），低于 Pi 的 13/94（13.8%）和 Codex 的 17/93（18.3%）；但 DSH one-shot 为 0/4，另外两者为 8/8。最强反例是 DSH Pro/high：18 次工具调用 **0 次显式工具错误**，仍因流超时与续跑状态机无法一次完成。真正的 harness 差距是错误分类、自动恢复和 turn 生命周期，而不是单一错误率。',
  },
  { id: 'one_shot_visual', type: 'chart', chartId: 'one_shot_chart', layout: 'full' },
  { id: 'tool_failure_visual', type: 'chart', chartId: 'tool_failure_chart', layout: 'full' },
  {
    id: 'dsh_preview_cli',
    type: 'markdown',
    sourceId: 'benchmark_analysis',
    body:
      '## DSH preview CLI：面向一次完成的友好优化建议\n\n### P0 — 先修任务连续性与恢复语义\n\n把 300 秒 idle timeout 升级为 progress-aware watchdog：token、reasoning、tool heartbeat 任一有进展就续租；连接中断后在同一 turn 内自动 resume，并以幂等 step/turn ID 写入原子 completion marker。四组 DSH 共记录 15 次 LLM retry、20 次 timeout occurrence 和 8 次人工“继续”，这是当前最大损耗。\n\n### P0 — 基于模型能力协商工具，而不是让模型试错\n\nDeepSeek V4 Flash/Pro 都是纯文本模型。DSH 仍向其暴露 `read_image`，3/4 case 调用后得到永久 capability error。启动时应根据 model capability registry 隐藏不兼容工具；视觉任务改为外部 `render_validate` oracle，返回 console errors、DOM/viewport bounds、状态机断言、像素占用与结构化 JSON。需要语义审图时，可选独立 vision evaluator，但不要伪装成主模型能力。\n\n### P1 — 让工具契约自带可恢复性\n\n5 次 stale-file edit 应由 wrapper 携带 revision token，并在冲突时自动 re-read + 单次重放；regex 不支持 lookbehind 时应返回可直接执行的 `--pcre2` 修复提示。统一错误 taxonomy：`retryable`、`permanent`、`capability_mismatch`、`permission_denied`，由 harness 决定自动恢复预算。\n\n### P1 — 预先固化权限与 headless benchmark 模式\n\n3/4 DSH case 在中途切到 `danger-full-access`。提供显式 `--sandbox`、`--approval`、`--non-interactive` preflight，并在首个模型调用前输出可用工具/路径/浏览器能力，避免运行中改变上下文。\n\n### P1 — 对齐 Pi/Codex 的可观测性\n\n提供稳定 `--json-summary`：resolved CLI/model version、effort、adjusted/wall time、TTFT、token/cache、tool errors by class、retries、timeout、exit reason、artifact paths。回归门槛应优先看 one-shot completion 与 automatic recovery，再看 raw error rate。',
  },
  {
    id: 'cache_section',
    type: 'markdown',
    sourceId: 'benchmark_analysis',
    body:
      '## 缓存：高命中率无法抵消重复上下文重放\n\n12 个 case 的 cache hit 都高于 96.8%。真正拉开资源消耗的是模型调用次数与总输入：DSH Pro/max 达到 11.03M 输入、75 次模型调用和 72.1 分钟净执行时间；同档 Codex 为 3.53M/23 次，Pi 为 2.91M/20 次。缓存 token 不是零成本，高 cache hit 也不代表高效率。',
  },
  { id: 'cache_visual', type: 'chart', chartId: 'cache_chart', layout: 'full' },
  {
    id: 'quality_section',
    type: 'markdown',
    sourceId: 'quality_review',
    body:
      '## 实现质量：DSH 能做出好结果，但缺少可靠验收闭环\n\nDSH Flash/max（88）和 Pro/high（87）已进入第二梯队，说明模型生成能力不是主要瓶颈。DSH Flash/high 的 assembled shutter 脱离壳体，Pro/max 则严重缩小主体并让标签/右侧标题拥挤。三组 DSH 虽生成截图，却因纯文本模型无法直接读取；最终评分来自外部浏览器 QA。',
  },
  { id: 'quality_visual', type: 'chart', chartId: 'quality_chart', layout: 'full' },
  {
    id: 'frontier_section',
    type: 'markdown',
    sourceId: 'joined_results',
    body:
      '## 速度—质量前沿：DSH 当前不在默认执行前沿\n\n吞吐首选仍是 Codex Pro/high；平衡速度与质量选 Pi Flash/max；最高实现质量选 Codex Flash/high。DSH Flash/max 和 Pro/high 的质量有竞争力，但在净时间与人工介入两个维度都被 Pi/Codex 支配，适合作为 preview CLI 的能力信号，而非默认无人值守路径。',
  },
  { id: 'frontier_visual', type: 'chart', chartId: 'frontier_chart', layout: 'full' },
  {
    id: 'detail_section',
    type: 'markdown',
    sourceId: 'joined_results',
    body: '## Case 级证据\n\n下表保留 adjusted/wall time、完成模式、token/cache、调用/错误/重试、质量分和浏览器发现。',
  },
  { id: 'detail_table', type: 'table', tableId: 'case_detail', layout: 'full' },
  { id: 'quality_detail_table', type: 'table', tableId: 'quality_detail', layout: 'full' },
  {
    id: 'methodology',
    type: 'markdown',
    body:
      '## Scope, definitions, and methodology\n\n样本限定为相同 canonical prompt 的 12 次执行，每个组合仅 1 次。Pi/Codex 使用 one-shot 端到端完成时间；DSH adjusted time 从 first user 到 completed turn 的墙钟时间中，扣除日志明确记录的 300 秒 stream-idle timeout、retry backoff、以及 error turn 到下一 turn 的断线间隔。质量采用 30/30/25/15 rubric：功能、规格、视觉、验证/可维护性；关键运行时或语义几何缺陷覆盖数值排名。',
  },
  {
    id: 'limitations',
    type: 'markdown',
    body:
      '## Limitations and robustness\n\n每格 n=1，不能估计方差或显著性。DSH 部分 turn 缺少 end 事件，adjusted time 只能扣除可明确识别的等待，仍可能包含残余等待或重叠执行。Pi/Codex 日志没有 DSH 同口径的 LLM retry 事件，因此 retry 数只用于 DSH 内部诊断。工具错误率按显式 error result 计数；它衡量发生率，不衡量严重度。质量含人工视觉判断，DSH 主模型不具备图像输入能力。',
  },
  {
    id: 'recommendations',
    type: 'markdown',
    body:
      '## Recommended operating policy\n\n1. 当前默认仍使用 `Codex + DeepSeek V4 Pro + high`。\n2. DSH 在无人值守 benchmark 中先设 one-shot completion gate；P0 修复前不以最终 quality 分掩盖续跑失败。\n3. 禁止自动升级到 Pro/max：三个 harness 中都更慢，且没有稳定质量收益。\n4. 下一轮每格至少 5 次，记录 p50/p90、one-shot rate、automatic recovery rate、TTFT、成本与失败 taxonomy。',
  },
];

const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
await writeFile(artifactPath, serialized);
await writeFile(portableArtifactPath, serialized);
process.stdout.write(`${artifactPath}\n`);
