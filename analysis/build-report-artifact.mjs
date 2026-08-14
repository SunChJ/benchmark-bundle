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
  'dsh-mini-pro-high': [91, 'Pass', 'Best DSH quality; correct geometry with lower-center and lower-right label overlap.'],
  'dsh-mini-flash-high': [90, 'Pass', 'Best DSH quality/speed trade-off; correct geometry with a slight top clip and crowded write-protect labels.'],
  'pi-flash-max': [89, 'Pass', 'Correct geometry; exploded top/bottom framing clips.'],
  'codex-ds-pro-high': [85, 'Pass', 'Fastest usable; correct geometry, minor top clipping.'],
  'dsh-mini-pro-max': [82, 'Pass', 'Correct geometry and round trip; undersized scene with heavy central and lower-right label overlap.'],
  'codex-ds-flash-max': [78, 'Pass', 'Complete; exploded framing over-zoomed and mislabelled.'],
  'dsh-mini-flash-max': [74, 'Critical', 'Magnetic disk and hub are rotated vertically despite a clean interaction round trip.'],
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
const dshFlashHigh = cases.find((row) => row.case === 'dsh-mini-flash-high');
const dshFlashMax = cases.find((row) => row.case === 'dsh-mini-flash-max');
const dshProHigh = cases.find((row) => row.case === 'dsh-mini-pro-high');
const dshProMax = cases.find((row) => row.case === 'dsh-mini-pro-max');
const solControls = [codexSolHigh, codexSolXhigh, codexSolMax, piSolHigh, piSolXhigh, piSolMax];
if (solControls.some((row) => !row)) throw new Error('GPT-5.6 Sol control cases are incomplete');
const dshMinimalCases = [dshFlashHigh, dshFlashMax, dshProHigh, dshProMax];
if (dshMinimalCases.some((row) => !row)) throw new Error('DSH minimal-preset cases are incomplete');
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
      'Adjusted completion time: end-to-end completion time less DSH intervals explicitly attributable to stream-idle timeouts, retry backoff, and error-end-to-next-turn disconnect gaps. In the minimal-preset rerun, only Flash/high excludes 1.96 seconds of retry backoff.',
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
      'Scores all 18 outputs after 1280×720 browser rendering, assembled/exploded/collapsed screenshot review, console inspection, and source review.',
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
      'Round trip checked for leading Pi/Codex candidates, all four DSH minimal-preset cases, and all six Sol controls',
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
      'Tool failure rate = observable actionable failed tool calls divided by tool calls. DSH includes 1 harness-declared stale-file failure and 8 non-zero command exits that were not flagged as errors.',
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
      'DSH minimal spans 18.5–59.3 minutes and finishes 4/4 one-shot; only Flash/high excludes 1.96 seconds of retry backoff.',
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
    subtitle: 'Every current execution stack is 100%; DSH minimal closes the prior one-shot gap in this single-run matrix.',
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
      'DSH minimal is 9/277 (3.2%); eight non-zero exits are still not flagged as failed tool results.',
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
    subtitle: 'Adjusted and wall time remain visible; the DSH minimal rerun contains no stream timeout or manual continuation.',
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
    body: `## Technical Summary\n\n同一 canonical prompt 的 18 个单次样本由两层证据组成：**12-case DeepSeek 匹配矩阵**比较 Pi、Codex 与 DSH，另加 **6-case Pi/Codex × GPT-5.6 Sol high/xhigh/max 匹配对照**。新的 DSH \`minimal\` preset 已把最大可靠性缺口关闭到当前样本的 4/4 one-shot、0 次 manual continuation、0 次 stream timeout；可操作工具失败降至 9/277（3.2%）。但最快的 DSH Flash/max 虽仅 ${dshFlashMax.duration_min.toFixed(1)} 分钟，却因磁片与 Hub 竖直而成为 critical。默认 DSH 应选 Flash/high：${dshFlashHigh.duration_min.toFixed(1)} 分钟、${dshFlashHigh.quality_score}/100；Pro/high 只多 1 分，却需 ${dshProHigh.duration_min.toFixed(1)} 分钟。Sol 对照为 ${solControlSummary}；它用于交叉验证 Pi/Codex harness 行为，不与 DeepSeek 聚合排名。`,
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
    body: `## 净执行时间：DSH Flash/high 已接近同档 Pi/Codex，Pro 档仍形成长尾\n\nSol/high 在 Codex/Pi 下分别为 ${codexSolHigh.duration_min.toFixed(1)} / ${piSolHigh.duration_min.toFixed(1)} 分钟，Sol/xhigh 为 ${codexSolXhigh.duration_min.toFixed(1)} / ${piSolXhigh.duration_min.toFixed(1)} 分钟，Sol/max 为 ${codexSolMax.duration_min.toFixed(1)} / ${piSolMax.duration_min.toFixed(1)} 分钟。DeepSeek Flash/high 中，Codex、Pi、DSH 分别为 21.6、20.8、${dshFlashHigh.duration_min.toFixed(1)} 分钟；DSH 已进入同档时间带。Pro/high 中，Codex 与 Pi 为 10.3 / 17.5 分钟，DSH 却为 ${dshProHigh.duration_min.toFixed(1)} 分钟。DSH Flash/max 的 ${dshFlashMax.duration_min.toFixed(1)} 分钟不能作为默认依据，因为输出存在 critical orientation defect。`,
  },
  { id: 'duration_visual', type: 'chart', chartId: 'duration_chart', layout: 'full' },
  {
    id: 'reliability_section',
    type: 'markdown',
    sourceId: 'benchmark_analysis',
    body:
      '## Harness 可靠性：DSH minimal 达到 4/4 one-shot，但失败结果仍未完全结构化\n\nDSH 四组 session 共 277 次工具调用，识别出 **9 个可操作失败（3.2%）**：1 个 harness-declared stale-file conflict，以及 8 个藏在成功 envelope 里的 non-zero command exit。当前样本没有 manual continuation、stream timeout 或 `read_image` capability mismatch，说明 minimal preset 的 turn 生命周期与能力过滤有实质进展。DeepSeek 下 Pi 为 13/94（13.8%），Codex 为 17/93（18.3%）；Sol 下 Pi 为 2/22（9.1%），Codex为 0/6。由于各 harness schema 不同、每格仅一次，失败率只作方向性诊断；DSH 下一步重点是 outcome normalization 与长期回归，而不是继续修一个当前未复现的续跑问题。',
  },
  { id: 'one_shot_visual', type: 'chart', chartId: 'one_shot_chart', layout: 'full' },
  { id: 'tool_failure_visual', type: 'chart', chartId: 'tool_failure_chart', layout: 'full' },
  {
    id: 'dsh_preview_cli',
    type: 'markdown',
    sourceId: 'benchmark_analysis',
    body:
      '## DSH preview CLI：从“续跑可靠性”转向“可验证正确性”\n\n### P0 — 统一工具结果\n\n8 次 non-zero command exit 仍被包装成 `isError=false`。`bash` adapter 应返回结构化 failure、exit code、stderr 与 retry class，让 harness 而不是模型文本解析决定恢复。唯一的 stale-file conflict 则用 revision token + 一次 bounded re-read/replay 处理。\n\n### P0 — 增加语义级 render validation\n\nFlash/max 的页面能加载、能往返、也通过语法检查，但磁片与 Hub 被转成竖直面。`render_validate` 不能只看 console 与状态机，还应输出主部件法向/包围盒、viewport 占用、标签碰撞和关键对齐断言。纯文本主模型消费 JSON 即可；语义审图可选独立 vision evaluator，但不要伪装成主模型能力。\n\n### P1 — 压缩 Pro 档工具循环\n\nPro/high 用 82 次 model call、80 次 tool call、8.65M 输入换来 91 分；相较 Flash/high 只增 1 分，却多耗约 37 分钟。建议给 tool/model rounds 和重放上下文设置预算，并将已验证的稳定上下文压成摘要。\n\n### P1 — 固化 headless preflight 与观测\n\n当前仅 Pro/high 有 1 次运行中权限变更；首个模型调用前仍应固定 sandbox、approval、可写路径和浏览器能力。稳定 `--json-summary` 需增加 selected preset、resolved CLI/model version、wall/adjusted time、token/cache、errors by class、retries、exit reason 与 artifacts。\n\n### 回归门槛\n\n把本轮 4/4 one-shot、0 timeout、0 manual continuation、0 capability mismatch 视为需长期保持的基线；至少扩到 n>=20，并加入 stream interruption、stale edit 与 orientation defect fixtures。',
  },
  {
    id: 'cache_section',
    type: 'markdown',
    sourceId: 'benchmark_analysis',
    body: `## 缓存：高命中率仍不能替代工具循环预算\n\n12 个 DeepSeek case 的 cache hit 都高于 96.8%，但 DSH Pro/high 仍达到 8.65M 输入、82 次模型调用和 ${dshProHigh.duration_min.toFixed(1)} 分钟；DSH Flash/max 也以 6.32M 输入得到一个 critical 输出。Sol 对照更能说明 agent 路径的影响：${solControls.map((row) => `${row.harness} ${row.effort} 为 ${(row.cache_hit_rate * 100).toFixed(1)}%（${(row.total_input_tokens / 1000).toFixed(1)}k 输入、${row.tool_calls} tool calls）`).join('；')}。cache hit 只描述复用比例，必须和总输入、工具循环、完成时间与最终质量一起读。`,
  },
  { id: 'cache_visual', type: 'chart', chartId: 'cache_chart', layout: 'full' },
  {
    id: 'quality_section',
    type: 'markdown',
    sourceId: 'quality_review',
    body: `## 实现质量：DSH high 档进入第一梯队，Flash/max 暴露验收盲区\n\n六组 Sol 均通过浏览器 round trip：${solControls.map((row) => `${row.harness} ${row.effort} ${row.quality_score}`).join('、')}。DeepSeek 主矩阵中，DSH Pro/high 为 ${dshProHigh.quality_score}，Flash/high 为 ${dshFlashHigh.quality_score}，两者都完成 assembled → exploded → collapsed 往返；Pro/max 为 ${dshProMax.quality_score}，主要问题是模型偏小与标签重叠。Flash/max 只有 ${dshFlashMax.quality_score} 且为 critical，说明“能加载 + 能动画 + 语法通过”不足以证明语义几何正确。DSH 主模型仍是纯文本，最终视觉分来自外部 1280×720 截图审查。`,
  },
  { id: 'quality_visual', type: 'chart', chartId: 'quality_chart', layout: 'full' },
  {
    id: 'frontier_section',
    type: 'markdown',
    sourceId: 'joined_results',
    body: `## 速度—质量前沿：DSH 的默认点已从 Flash/max 移到 Flash/high\n\nSol/high 的 Pi 与 Codex 耗时接近，但 Pi 的工具化验证路径把质量从 83 提到 90；Sol/xhigh 也几乎同速（Pi ${piSolXhigh.duration_min.toFixed(1)} 分钟 / 92，Codex ${codexSolXhigh.duration_min.toFixed(1)} / 86）；Sol/max 中 Pi 同时更快且质量更高（11.0 分钟 / 94，对比 13.8 / 92）。DeepSeek 吞吐首选仍是 Codex Pro/high，最高实现质量仍是 Codex Flash/high。DSH 内部应选 Flash/high（${dshFlashHigh.duration_min.toFixed(1)} 分钟 / ${dshFlashHigh.quality_score}）；Pro/high 的 1 分增益不值得额外约 37 分钟，Flash/max 虽快约 4 分钟却有 critical orientation defect，Pro/max 则更慢且质量更低。`,
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
      '## Scope, definitions, and methodology\n\n样本限定为相同 canonical prompt 的 18 次执行，每个组合仅 1 次：12 次 DeepSeek 匹配矩阵用于 Pi/Codex/DSH 对比，6 次 Pi/Codex × GPT-5.6 Sol high/xhigh/max 构成第二套 matched harness 对照。当前 DSH 四组均使用 `minimal` agent preset。Adjusted time 从 first user 到 completed turn 的墙钟时间中扣除日志明确记录的 stream-idle timeout、retry backoff 与断线间隔；本轮只有 DSH Flash/high 扣除 1.96 秒 retry backoff。质量采用 30/30/25/15 rubric：功能、规格、视觉、验证/可维护性；关键运行时或语义几何缺陷覆盖数值排名。',
  },
  {
    id: 'limitations',
    type: 'markdown',
    body:
      '## Limitations and robustness\n\n每格 n=1，不能估计方差或显著性；DSH 的 4/4 one-shot 是值得回归验证的当前基线，不是长期成功率。Sol 的 Pi/Codex 同档位比较是 matched harness 对照，但协议实现与默认 system/tool contract 仍不同。Codex/Sol high 与 xhigh 未自行写文件，浏览器 QA 使用从最终响应原样物化的 HTML。Sol 与 DeepSeek 不同模型族，不能混合成模型排名。各 harness 的工具失败 schema 非严格同构。质量含人工截图判断；当前审查因 in-app browser 不可用而采用本地 headless Chrome 渲染，DSH 主模型本身不具备图像输入能力。',
  },
  {
    id: 'recommendations',
    type: 'markdown',
    body:
      '## Recommended operating policy\n\n1. DeepSeek 全局吞吐默认仍使用 `Codex + DeepSeek V4 Pro + high`；最高质量使用 `Codex + DeepSeek V4 Flash + high`。\n2. DSH 默认使用 `minimal + Flash + high`；阻止 Flash/max 自动晋级，并避免自动升级到 Pro/max。\n3. 把 DSH 的 4/4 one-shot、0 timeout、0 manual continuation 与 0 capability mismatch 固化为回归门槛；P0 转向 typed tool outcomes 与 semantic render validation。\n4. 下一轮每格至少 5 次，随后扩到 n>=20，记录 p50/p90、one-shot、automatic recovery、model/tool calls、token、TTFT、成本与失败 taxonomy。',
  },
];

const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
await writeFile(artifactPath, serialized);
await writeFile(portableArtifactPath, serialized);
process.stdout.write(`${artifactPath}\n`);
