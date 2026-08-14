#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderFrontierChart } from './render-frontier-chart.mjs';

const analysisDir = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(analysisDir, '..');
const outputDir = path.join(workspace, 'output/pdf/deepseek-cli-harness-report');
const artifactPath = path.join(outputDir, 'artifact.json');
const portableArtifactPath = path.join(outputDir, 'artifact-portable.json');
const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

const quality = {
  'pi-gpt56-sol-max': [94, 'Pass', 'Excellent geometry and exploded composition; clean round trip, slight right-label crowding, and one recovered sandbox-denied check.'],
  'pi-gpt56-sol-xhigh': [92, 'Pass', 'Strong geometry and clean round trip; HD NOTCH clips above the viewport, the exploded prompt remains visible, and transport/sandbox failures recover automatically.'],
  'codex-gpt56-sol-high': [83, 'Pass', 'Clean round trip and strong geometry; top label clips, prompt stays visible, and the response was not written to disk.'],
  'codex-gpt56-sol-xhigh': [86, 'Pass', 'Clean round trip and separated labels; top geometry and HD NOTCH clip, explicit 80 ms stagger is missing, and the response was not written or browser-tested in-session.'],
  'codex-gpt56-sol-max': [92, 'Pass', 'Strong exploded composition and clean round trip; assembled scene is undersized and only static checks ran in-session.'],
  'pi-gpt56-sol-high': [90, 'Pass', 'Clean round trip and strong geometry; exploded labels overlap around the disk/hub and lower-right components.'],
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

const fullCaseLabel = (harness, model, effort) => {
  const modelCode = model.includes('Sol') ? 'sol' : model.includes('Pro') ? 'pro' : 'flash';
  return `${harness.toLowerCase()}-${modelCode}/${effort}`;
};

const compactStackLabel = (stack) =>
  ({
    'Codex / GPT-5.6 Sol': 'Sol · Codex',
    'Pi / GPT-5.6 Sol': 'Sol · Pi',
    'Codex / DeepSeek': 'DS · Codex',
    'Pi / DeepSeek': 'DS · Pi',
    'DSH / DeepSeek': 'DS · DSH',
  })[stack];

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
      stack: row.stack,
      stack_label: compactStackLabel(row.stack),
      model_family: row.model.includes('DeepSeek') ? 'DeepSeek' : 'OpenAI',
      model_tier: row.model.includes('Sol') ? 'Sol' : row.model.includes('Pro') ? 'Pro' : 'Flash',
      effort: row.effort,
      case_label: fullCaseLabel(row.harness, row.model, row.effort),
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
      declared_tool_failures: row.declaredToolFailureCount ?? null,
      unflagged_command_failures: row.unflaggedCommandFailureCount ?? null,
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
      artifact_delivery:
        row.model.includes('Sol') && row.toolCalls === 0
          ? 'Final-response HTML; materialized by benchmark wrapper'
          : 'Written by the model through harness tools',
      output_path: row.outputPath,
    };
  })
  .sort((a, b) => b.quality_score - a.quality_score);

const stackOrder = [
  'Codex / GPT-5.6 Sol',
  'Pi / GPT-5.6 Sol',
  'Codex / DeepSeek',
  'Pi / DeepSeek',
  'DSH / DeepSeek',
];
const harnessSummary = stackOrder.map((stack) => {
  const rows = cases.filter((row) => row.stack === stack);
  const sum = (field) => rows.reduce((total, row) => total + row[field], 0);
  const oneShotCompleted = rows.filter((row) => row.one_shot_completed).length;
  const toolCalls = sum('tool_calls');
  const toolFailures = sum('tool_failures');
  return {
    stack,
    stack_label: rows[0].stack_label,
    harness: rows[0].harness,
    model_family: rows[0].model_family,
    cases: rows.length,
    one_shot_completed: oneShotCompleted,
    one_shot_rate: oneShotCompleted / rows.length,
    tool_calls: toolCalls,
    tool_failures: toolFailures,
    tool_failure_rate: toolCalls ? toolFailures / toolCalls : null,
    llm_retries: sum('llm_retries'),
    stream_timeouts: sum('stream_timeouts'),
    manual_continues: sum('manual_continues'),
    permission_changes: sum('permission_changes'),
  };
});
const codexSolHigh = cases.find((row) => row.case === 'codex-gpt56-sol-high');
const codexSolXhigh = cases.find((row) => row.case === 'codex-gpt56-sol-xhigh');
const codexSolMax = cases.find((row) => row.case === 'codex-gpt56-sol-max');
const piSolHigh = cases.find((row) => row.case === 'pi-gpt56-sol-high');
const piSolXhigh = cases.find((row) => row.case === 'pi-gpt56-sol-xhigh');
const piSolMax = cases.find((row) => row.case === 'pi-gpt56-sol-max');
const solControls = [codexSolHigh, codexSolXhigh, codexSolMax, piSolHigh, piSolXhigh, piSolMax];
if (solControls.some((row) => !row)) throw new Error('GPT-5.6 Sol control cases are incomplete');
const solControlSummary = solControls
  .map(
    (row) =>
      `${row.harness}/${row.effort} ${row.duration_min.toFixed(1)} min / ${row.quality_score} 分 / ${row.tool_calls} tool calls`,
  )
  .join('；');
const frontierPng = await renderFrontierChart(cases);
await writeFile(path.join(workspace, 'assets/adjusted-completion-time-vs-quality.png'), frontierPng);
const frontierImageDataUrl = `data:image/png;base64,${frontierPng.toString('base64')}`;

const reportSql = await readFile(path.join(analysisDir, 'report-source.sql'), 'utf8');
const harnessSummarySql = await readFile(path.join(analysisDir, 'harness-summary.sql'), 'utf8');
const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
artifact.manifest.generatedAt = generatedAt;
artifact.snapshot.generatedAt = generatedAt;
artifact.manifest.description =
  'Same-prompt comparison of 12 Pi/Codex/DSH runs on DeepSeek V4 Flash/Pro plus six Pi/Codex GPT-5.6 Sol controls at high/xhigh/max effort, covering execution time, cache use, tool reliability, implementation quality, and preview-CLI recommendations.';

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
      'runs/20260814101425/*/.benchmark-runtime/{codex,pi}/sessions/**/*.jsonl',
      'runs/dsh/*/session.jsonl',
      'analysis/dsh-error-audit-lib.mjs',
    ],
    filters: [
      'Canonical prompt SHA-256 bee2dabb86385df8686e5f48fa5e9fd70d33acbf9b833f9c487114c725b8a48e',
      'Twelve DeepSeek harness × model tier × effort cases plus six GPT-5.6 Sol control cases; no sampling',
      'One final HTML output per case',
      'Codex/Sol high and xhigh final-response HTML materialized byte-for-byte by analysis/materialize-codex-html.mjs',
    ],
    metric_definitions: [
      'Adjusted completion time: end-to-end completion time less DSH intervals explicitly attributable to 300-second stream-idle timeouts, retry backoff, and error-end-to-next-turn disconnect gaps.',
      'Wall duration: first benchmark user prompt to final completed turn, including DSH interruption and retry waits.',
      'One-shot completion: final artifact delivered without a manual continuation message.',
      'Tool failure rate: observable actionable failed tool calls divided by tool calls. DSH includes harness-declared errors plus non-zero command exits and runtime exceptions embedded in otherwise successful tool-result envelopes.',
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
      'Scores all 18 outputs after 1280×720 browser QA of assembled/exploded states, console inspection, selected round trips, and source review.',
    tables_used: [
      'analysis/quality-assessment.md',
      'runs/20260813193424/*/*.html',
      'runs/20260813195515/*/*.html',
      'runs/20260814101425/*/*.html',
      'runs/dsh/*/*.html',
    ],
    filters: [
      'All 18 outputs reviewed',
      '1280×720 viewport',
      'Exploded state triggered with Space after page load',
      'Round trip checked for leading Pi/Codex candidates, DSH Flash/max and Pro/high, and all six Sol controls',
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
    filters: ['Inner join on exact case identifier', 'Eighteen matched rows; no missing cases and no sampling'],
    metric_definitions: [
      'Performance and reliability fields use benchmark_analysis definitions.',
      'Quality fields use the quality_review rubric and critical-defect override.',
    ],
  },
};

const modelDocsSource = {
  id: 'openai_model_docs',
  label: 'OpenAI GPT-5.6 Sol model documentation',
  path: 'analysis/openai-sol-model-source.md',
  query: {
    engine: 'official-documentation',
    id: 'openai-codex-models-gpt-5-6-sol',
    language: 'markdown',
    url: 'https://developers.openai.com/api/docs/models/gpt-5.6-sol',
    executed_at: generatedAt,
    description:
      'Official model page confirming the gpt-5.6-sol slug, Responses API support, image input, and high/xhigh/max reasoning effort support; local Pi model inventory confirms its openai-codex route.',
    tables_used: ['analysis/openai-sol-model-source.md'],
    filters: ['Official OpenAI developer documentation only'],
    metric_definitions: [
      'Control cases use model slug gpt-5.6-sol through Codex and Pi.',
      'Control reasoning efforts are high, xhigh, and max.',
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
    description: 'Returns the 18 reviewed case-level rows used by report charts and the detail table.',
    tables_used: ['analysis/report-source.sql', 'analysis/analyze-runs.mjs', 'analysis/quality-assessment.md'],
    filters: [
      'Canonical prompt SHA-256 bee2dabb86385df8686e5f48fa5e9fd70d33acbf9b833f9c487114c725b8a48e',
      'Eighteen completed artifacts; no sampling',
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
      'Aggregates the 18 reviewed cases to execution-stack one-shot completion, observable actionable tool failures, retries, timeouts, continuations, and permission changes.',
    tables_used: ['analysis/harness-summary.sql', 'analysis/report-source.sql'],
    filters: ['Twelve DeepSeek cases plus six GPT-5.6 Sol controls', 'Five execution stacks; no sampling'],
    metric_definitions: [
      'One-shot rate = cases completed without manual continuation divided by cases.',
      'Tool failure rate = observable actionable failed tool calls divided by tool calls. DSH includes 9 harness-declared failures and 14 non-zero command exits or runtime exceptions that were not flagged as errors.',
      'Pi and Codex use the failure signals observable in their available schemas, so cross-harness failure-rate comparisons are directional rather than strictly schema-identical.',
      'Codex/Sol high and xhigh returned HTML directly with zero tool calls; Sol stack rates aggregate all three effort levels for each harness.',
      'LLM retries are observable in Pi and DSH session logs; stream timeout occurrences are observable only in DSH under the available schemas.',
    ],
  },
};

artifact.manifest.sources = [
  benchmarkSource,
  qualitySource,
  joinedSource,
  modelDocsSource,
  reportSource,
  harnessSummarySource,
];
artifact.sources = structuredClone(artifact.manifest.sources);
artifact.snapshot.datasets = {
  cases,
  duration_cases: [...cases].sort((a, b) => a.duration_min - b.duration_min),
  quality_cases: [...cases].sort((a, b) => b.quality_score - a.quality_score),
  harness_summary: harnessSummary,
  tool_summary: harnessSummary.filter((row) => row.tool_calls > 0),
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
    maxRows: 18,
    layout: 'full',
  },
  {
    id: 'one_shot_chart',
    title: 'One-shot completion rate by execution stack',
    subtitle: 'DeepSeek on Pi/Codex finishes 8/8 one-shot, Pi/Codex Sol controls finish 6/6, and DSH finishes 0/4.',
    showDescription: true,
    type: 'horizontalBar',
    dataset: 'harness_summary',
    sourceId: 'harness_summary_query',
    encodings: {
      x: { field: 'stack_label', type: 'nominal', label: 'Execution stack' },
      y: { field: 'one_shot_rate', type: 'quantitative', label: 'One-shot completion rate' },
      tooltip: [
        { field: 'one_shot_completed', type: 'quantitative', label: 'One-shot cases', format: 'number' },
        { field: 'cases', type: 'quantitative', label: 'Cases', format: 'number' },
        { field: 'manual_continues', type: 'quantitative', label: 'Manual continues', format: 'number' },
      ],
    },
    yAxisTitle: 'One-shot completion rate',
    valueFormat: 'percent',
    maxRows: 5,
    layout: 'full',
  },
  {
    id: 'tool_failure_chart',
    title: 'Observed actionable tool failure rate',
    subtitle:
      'DSH is 23/178 (12.9%); Codex/Sol is 0/6 and Pi/Sol is 2/22 (9.1%).',
    showDescription: true,
    type: 'horizontalBar',
    dataset: 'tool_summary',
    sourceId: 'harness_summary_query',
    encodings: {
      x: { field: 'stack_label', type: 'nominal', label: 'Execution stack' },
      y: { field: 'tool_failure_rate', type: 'quantitative', label: 'Tool failure rate' },
      tooltip: [
        { field: 'tool_failures', type: 'quantitative', label: 'Actionable failures', format: 'number' },
        { field: 'tool_calls', type: 'quantitative', label: 'Tool calls', format: 'number' },
        { field: 'llm_retries', type: 'quantitative', label: 'LLM retries', format: 'number' },
        { field: 'stream_timeouts', type: 'quantitative', label: 'Stream timeouts', format: 'number' },
      ],
    },
    yAxisTitle: 'Tool failure rate',
    valueFormat: 'percent',
    maxRows: 5,
    layout: 'full',
  },
  {
    id: 'cache_chart',
    title: 'Input token cache composition',
    subtitle:
      'DeepSeek runs exceed 96.8%; Sol controls span 0–87.6% as harness tool-loop behavior changes.',
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
    maxRows: 18,
    layout: 'full',
  },
  {
    id: 'quality_chart',
    title: 'Implementation quality score',
    subtitle: 'Eighteen browser-reviewed outputs; Sol adds matched Pi/Codex controls without entering the DeepSeek aggregate.',
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
    maxRows: 18,
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
      { field: 'tool_error_summary', label: 'Tool failures/calls', type: 'text', align: 'right' },
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
    body: `## Technical Summary\n\n同一 canonical prompt 的 18 个单次样本由两层证据组成：**12-case DeepSeek 匹配矩阵**比较 Pi、Codex 与 DSH，另加 **6-case Pi/Codex × GPT-5.6 Sol high/xhigh/max 匹配对照**。核心结论不变：DSH 最佳输出 Flash/max 为 88/100，但 4/4 都需要两次人工“继续”，同模型 Pi/Codex 8/8 one-shot；DSH 整体 tool failure rate 为 23/178（12.9%），扣除可识别等待后仍需 40.3–72.1 分钟。Sol 对照为 ${solControlSummary}；它能直接交叉验证 Pi/Codex harness 行为，但不替代 DeepSeek 下含 DSH 的三方归因。`,
  },
  {
    id: 'sol_control_section',
    type: 'markdown',
    sourceId: 'joined_results',
    body: `## GPT-5.6 Sol 对照：同模型下，harness 明显改变 agent 路径\n\n六组 Sol 都 one-shot 完成：${solControlSummary}。high 档耗时几乎相同（Codex ${codexSolHigh.duration_min.toFixed(1)}、Pi ${piSolHigh.duration_min.toFixed(1)} 分钟），但 Codex 直接返回 HTML、0 tool call，Pi 则写文件并以 4 次工具调用完成静态检查，质量分别为 83 与 90。xhigh 档 Codex/Pi 分别为 ${codexSolXhigh.duration_min.toFixed(1)} / ${piSolXhigh.duration_min.toFixed(1)} 分钟、${codexSolXhigh.quality_score} / ${piSolXhigh.quality_score} 分。max 档中，Pi 用 ${piSolMax.duration_min.toFixed(1)} 分钟、12 次工具调用达到 94；Codex 用 ${codexSolMax.duration_min.toFixed(1)} 分钟、6 次工具调用达到 92。Pi/max 有 1 次 \`/tmp\` 写入被隔离策略拒绝，随后自动恢复。单次样本不足以排名，但足以说明同一模型与 effort 下，harness 的工具策略、验证深度和恢复路径会改变实际结果。`,
  },
  {
    id: 'duration_section',
    type: 'markdown',
    sourceId: 'benchmark_analysis',
    body: `## 净执行时间：Sol 对照更快，DSH 去掉明确等待后仍慢约 2–4×\n\nSol/high 在 Codex/Pi 下分别为 ${codexSolHigh.duration_min.toFixed(1)} / ${piSolHigh.duration_min.toFixed(1)} 分钟，Sol/xhigh 为 ${codexSolXhigh.duration_min.toFixed(1)} / ${piSolXhigh.duration_min.toFixed(1)} 分钟，Sol/max 为 ${codexSolMax.duration_min.toFixed(1)} / ${piSolMax.duration_min.toFixed(1)} 分钟。DeepSeek 最可比的 Pro/high 组合中，Codex 为 10:19、Pi 为 17:30、DSH 为 40:19；DSH 墙钟时间原为 61:36，本报告按要求扣除了 21:17 的显式 stream-idle timeout、retry backoff 和错误轮次间隔。Sol 匹配对照可用于观察 Pi/Codex 差异；涉及 DSH 的结论仍以 DeepSeek 三方矩阵为准。`,
  },
  { id: 'duration_visual', type: 'chart', chartId: 'duration_chart', layout: 'full' },
  {
    id: 'reliability_section',
    type: 'markdown',
    sourceId: 'benchmark_analysis',
    body:
      '## Harness 可靠性：DSH 整体 tool failure rate 是 12.9%\n\nDSH 四组 session 共 178 次工具调用，识别出 **23 个可操作失败（12.9%）**：9 个 harness-declared tool failures，以及 14 个藏在成功 envelope 里的 non-zero command exit 或 runtime exception。DeepSeek 下 Pi 为 13/94（13.8%），Codex 为 17/93（18.3%）；Sol 下 Pi 为 2/22（9.1%），Codex 为 0/6。Pi/Sol max 与 xhigh 各有一次外层隔离拒绝绝对 `/tmp` 写入，模型都随后恢复；Pi/xhigh 另自动跨过一次 WebSocket model-call failure。Codex/Sol high 与 xhigh 均未调用工具，不进入分母。日志 schema 与小样本限制意味着横向数值只作方向性参考。DSH 核心差距仍是失败结果标准化、自动恢复和 turn 生命周期。',
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
    body: `## 缓存：高命中率无法抵消重复上下文重放\n\n12 个 DeepSeek case 的 cache hit 都高于 96.8%，但 DSH Pro/max 仍达到 11.03M 输入、75 次模型调用和 72.1 分钟净执行时间。Sol 对照更能说明 agent 路径的影响：${solControls.map((row) => `${row.harness} ${row.effort} 为 ${(row.cache_hit_rate * 100).toFixed(1)}%（${(row.total_input_tokens / 1000).toFixed(1)}k 输入、${row.tool_calls} tool calls）`).join('；')}。cache hit 描述复用比例，必须和总输入、工具循环及完成时间一起读。`,
  },
  { id: 'cache_visual', type: 'chart', chartId: 'cache_chart', layout: 'full' },
  {
    id: 'quality_section',
    type: 'markdown',
    sourceId: 'quality_review',
    body: `## 实现质量：Sol 对照扩展到 xhigh，DSH 仍缺少可靠验收闭环\n\n六组 Sol 均通过浏览器 round trip：${solControls.map((row) => `${row.harness} ${row.effort} ${row.quality_score}`).join('、')}。Pi/max 的爆炸构图与细节最好；Codex/high 主要扣分来自未落盘、未自验、顶部标签 clipping 与爆炸后提示未隐藏。DeepSeek 主矩阵中，DSH Flash/max（88）和 Pro/high（87）已进入第二梯队，说明模型生成能力不是主要瓶颈；但 DSH 的纯文本模型无法读取自身截图，最终评分仍来自外部浏览器 QA。`,
  },
  { id: 'quality_visual', type: 'chart', chartId: 'quality_chart', layout: 'full' },
  {
    id: 'frontier_section',
    type: 'markdown',
    sourceId: 'joined_results',
    body: `## 速度—质量前沿：Sol 提供第二套 matched harness 对照\n\nSol/high 的 Pi 与 Codex 耗时接近，但 Pi 的工具化验证路径把质量从 83 提到 90；Sol/xhigh 也几乎同速（Pi ${piSolXhigh.duration_min.toFixed(1)} 分钟 / 92，Codex ${codexSolXhigh.duration_min.toFixed(1)} / 86），Pi 以 6 次工具调用换来更完整的落盘与静态检查，同时自动恢复一次 WebSocket error 与一次 sandbox failure；Sol/max 中 Pi 同时更快且质量更高（11.0 分钟 / 94，对比 13.8 / 92）。DeepSeek 吞吐首选仍是 Codex Pro/high；平衡速度与质量选 Pi Flash/max；DeepSeek 最高实现质量选 Codex Flash/high。DSH Flash/max 和 Pro/high 的质量有竞争力，但在净时间与人工介入两个维度都被同模型 Pi/Codex 支配。`,
  },
  {
    id: 'frontier_visual',
    type: 'html',
    layout: 'full',
    body: `<figure style="margin:0;padding:0 0 8px"><img src="${frontierImageDataUrl}" alt="Scatter plot of adjusted completion time versus implementation quality for 18 Pi, Codex, and DSH cases. The quality axis runs from 50 to 100 and the time axis uses a logarithmic scale." style="display:block;width:100%;height:auto;border-radius:12px"/><figcaption style="margin:10px 4px 0;color:#8f8f8f;font:12px/1.45 system-ui,sans-serif">Focused Y-axis: 50–100. Logarithmic X-axis: 5–80 minutes. Source: reviewed case-level metrics in analysis/report-source.sql and browser quality scores in analysis/quality-assessment.md.</figcaption></figure>`,
  },
  {
    id: 'frontier_label_legend',
    type: 'markdown',
    body:
      '**点位说明**：点位直接使用完整的 `cli-model/reasoning` 命名，例如 `codex-sol/high`、`pi-pro/max`、`dsh-flash/high`；颜色同时区分 CLI harness。原始 case name 保留在下方 Case 级证据表中。Y 轴聚焦 50–100；X 轴使用对数刻度（5 / 10 / 20 / 40 / 80 分钟），用于展开低耗时密集区并压缩长尾，点位之间的横向距离表示耗时倍数而非绝对分钟差。',
  },
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
      '## Scope, definitions, and methodology\n\n样本限定为相同 canonical prompt 的 18 次执行，每个组合仅 1 次：12 次 DeepSeek 匹配矩阵用于 Pi/Codex/DSH 对比，6 次 Pi/Codex × GPT-5.6 Sol high/xhigh/max 构成第二套 matched harness 对照。Pi/Codex 使用 one-shot 端到端完成时间；DSH adjusted time 从 first user 到 completed turn 的墙钟时间中，扣除日志明确记录的 300 秒 stream-idle timeout、retry backoff、以及 error turn 到下一 turn 的断线间隔。质量采用 30/30/25/15 rubric：功能、规格、视觉、验证/可维护性；关键运行时或语义几何缺陷覆盖数值排名。',
  },
  {
    id: 'limitations',
    type: 'markdown',
    body:
      '## Limitations and robustness\n\n每格 n=1，不能估计方差或显著性。Sol 的 Pi/Codex 同档位比较是 matched harness 对照，但协议实现与默认 system/tool contract 仍不同，结论只作工程假设。Codex/Sol high 与 xhigh 未自行写文件，浏览器 QA 使用从最终响应原样物化的 HTML；其余 Sol 静态检查也不等于浏览器视觉验收。Sol 与 DeepSeek 不同模型族，不能混合成模型排名。DSH adjusted time 仍是保守近似；各 harness 的工具失败 schema 也非严格同构。质量含人工视觉判断，DSH 主模型不具备图像输入能力。',
  },
  {
    id: 'recommendations',
    type: 'markdown',
    body:
      '## Recommended operating policy\n\n1. DeepSeek 任务的当前默认仍使用 `Codex + DeepSeek V4 Pro + high`。\n2. GPT-5.6 Sol 保持 Pi/Codex 双 control lane；当前单次结果中 Pi/max 最强，但先扩样再决定默认 harness。\n3. DSH 在无人值守 benchmark 中先设 one-shot completion gate；P0 修复前不以最终 quality 分掩盖续跑失败。\n4. 下一轮每格至少 5 次，记录 p50/p90、one-shot rate、automatic recovery rate、TTFT、成本与失败 taxonomy。',
  },
];

const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
await writeFile(artifactPath, serialized);
await writeFile(portableArtifactPath, serialized);
process.stdout.write(`${artifactPath}\n`);
