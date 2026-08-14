#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const analysisDir = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(analysisDir, '..');
const baseArtifactPath = path.join(
  workspace,
  'output/pdf/deepseek-cli-harness-report/artifact.json',
);
const outputDir = path.join(workspace, 'output/pdf/dsh-preview-cli-recommendations');
const artifactPath = path.join(outputDir, 'artifact.json');
const portableArtifactPath = path.join(outputDir, 'artifact-portable.json');
const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

const base = JSON.parse(await readFile(baseArtifactPath, 'utf8'));
const dshErrorAudit = JSON.parse(
  execFileSync(process.execPath, [path.join(analysisDir, 'audit-dsh-errors.mjs')], {
    cwd: workspace,
    encoding: 'utf8',
  }),
);
const sourceById = new Map(base.manifest.sources.map((source) => [source.id, source]));
const clonedSource = (id) => {
  const source = structuredClone(sourceById.get(id));
  if (!source) throw new Error(`Missing base source: ${id}`);
  if (source.query) source.query.executed_at = generatedAt;
  return source;
};

const cases = base.snapshot.datasets.cases;
const solControls = cases
  .filter((row) => row.model_tier === 'Sol')
  .sort((a, b) => a.harness.localeCompare(b.harness) || a.effort.localeCompare(b.effort));
const dshCases = cases
  .filter((row) => row.harness === 'DSH')
  .map((row) => {
    const failures = dshErrorAudit.events.filter((event) => event.case === row.case);
    const declaredFailures = failures.filter((event) => event.is_error_flag).length;
    const commandFailures = failures.length - declaredFailures;
    return {
      ...row,
      case_label: `${row.model_tier}/${row.effort}`,
      duration_pair: `${row.duration_min.toFixed(1)} / ${row.wall_duration_min.toFixed(1)} min`,
      retry_timeout_pair: `${row.llm_retries} / ${row.stream_timeouts}`,
      actionable_failures: failures.length,
      declared_failures: declaredFailures,
      command_failures: commandFailures,
      failure_summary: `${failures.length} (${declaredFailures} + ${commandFailures})`,
    };
  })
  .sort((a, b) => a.duration_min - b.duration_min);

const harnessSummary = base.snapshot.datasets.harness_summary.filter(
  (row) => row.model_family === 'DeepSeek',
);
const solControlDescription = solControls
  .map(
    (row) =>
      `${row.harness}/${row.effort} 为 ${row.duration_min.toFixed(1)} 分钟、质量 ${row.quality_score}/100、${row.tool_calls} 次工具调用`,
  )
  .join('；');
const dshSum = (field) => dshCases.reduce((total, row) => total + row[field], 0);
const lifecycleEvents = [
  { event: 'One-shot completion', count: dshCases.filter((row) => row.one_shot_completed).length, interpretation: 'Unattended success' },
  { event: 'LLM retry', count: dshSum('llm_retries'), interpretation: 'Automatic retry attempt' },
  { event: 'Permission mode change', count: dshSum('permission_changes'), interpretation: 'Preflight contract gap' },
  { event: 'Stream timeout occurrence', count: dshSum('stream_timeouts'), interpretation: 'No timeout observed' },
  { event: 'Manual continuation', count: dshSum('manual_continues'), interpretation: 'No continuation required' },
];
const errorClassHandlers = {
  'non-zero command exit': 'Return a typed error envelope with exit code and stderr',
  'stale file revision': 'Re-read and replay once with a revision token',
};
const errorClasses = Object.entries(dshErrorAudit.summary.by_class)
  .map(([errorClass, incidents]) => {
    const matching = dshErrorAudit.events.filter((event) => event.error_class === errorClass);
    return {
      error_class: errorClass,
      incidents,
      affected_cases: new Set(matching.map((event) => event.case)).size,
      failure_surface: matching[0].failure_surface,
      recommended_handler: errorClassHandlers[errorClass],
    };
  })
  .sort((a, b) => b.incidents - a.incidents);

const recommendations = [
  {
    priority: 'P0',
    workstream: 'Outcome normalization',
    proposed_change: 'Convert every non-zero command exit into a typed failed tool result with exit code and stderr.',
    exit_signal: 'Zero actionable subprocess failures are returned as success.',
  },
  {
    priority: 'P0',
    workstream: 'Semantic render validation',
    proposed_change: 'Add a text/JSON oracle for console, DOM, viewport, state transitions, orientation and label collisions.',
    exit_signal: 'No critical geometry or viewport defect passes automated acceptance.',
  },
  {
    priority: 'P1',
    workstream: 'Safe edit recovery',
    proposed_change: 'Carry revision tokens and automatically re-read and replay one stale edit.',
    exit_signal: 'The stale-edit fixture completes within one bounded replay.',
  },
  {
    priority: 'P1',
    workstream: 'Tool-loop efficiency',
    proposed_change: 'Budget model/tool rounds and summarize stable context before replaying it.',
    exit_signal: 'Repeated runs reduce p50/p90 calls, tokens and elapsed time without quality loss.',
  },
  {
    priority: 'P1',
    workstream: 'Headless preflight',
    proposed_change: 'Resolve sandbox, approval, paths, browser and tool support before the first model call.',
    exit_signal: 'No mid-run permission changes in non-interactive runs.',
  },
  {
    priority: 'P1',
    workstream: 'Observability',
    proposed_change: 'Emit a stable JSON summary for preset, versions, timings, tokens/cache, retries, errors and exit reason.',
    exit_signal: 'Every benchmark run produces a schema-valid summary.',
  },
  {
    priority: 'P2',
    workstream: 'Regression and reproducibility',
    proposed_change: 'Pin the minimal preset manifest and repeat the matched matrix with deterministic recovery fixtures.',
    exit_signal: 'One-shot and capability gains hold across n>=20 and injected failures.',
  },
];

const acceptanceGates = [
  {
    gate: 'One-shot completion',
    observed: '4/4 DSH cases',
    preview_exit_target: 'Maintain >=95% across n>=20',
    measurement: 'Completed artifact without manual continuation',
  },
  {
    gate: 'Manual continuation',
    observed: '0 messages',
    preview_exit_target: 'Maintain 0 in unattended mode',
    measurement: 'Continuation messages after canonical prompt',
  },
  {
    gate: 'Capability mismatch',
    observed: '0 incompatible tool calls',
    preview_exit_target: 'Maintain 0 under capability regression tests',
    measurement: 'Permanent mismatch calls by class',
  },
  {
    gate: 'Recovery fixtures',
    observed: 'Not measured',
    preview_exit_target: '100% within bounded retry budget',
    measurement: 'Injected stream and stale-edit scenarios',
  },
  {
    gate: 'Outcome normalization',
    observed: '8 non-zero exits not flagged as errors',
    preview_exit_target: '0 unflagged actionable failures',
    measurement: 'Non-zero exits vs tool status',
  },
  {
    gate: 'Semantic validation',
    observed: '1/4 critical geometry defect escaped',
    preview_exit_target: '0 critical defects accepted by render validation',
    measurement: 'Orientation, viewport and label-collision assertions',
  },
  {
    gate: 'Permission stability',
    observed: '1 mid-run change',
    preview_exit_target: '0 in headless mode',
    measurement: 'Permission-mode transitions per run',
  },
  {
    gate: 'Telemetry completeness',
    observed: 'No stable summary contract',
    preview_exit_target: '100% schema-valid summaries',
    measurement: 'JSON schema validation and explicit exit reason',
  },
];

const recommendationSource = {
  id: 'dsh_recommendation_review',
  label: 'DSH preview CLI recommendation review',
  path: 'analysis/dsh-preview-cli-recommendations.md',
  query: {
    engine: 'manual-reviewed',
    id: 'dsh-preview-cli-recommendations-v1',
    language: 'markdown',
    executed_at: generatedAt,
    description:
      'Evidence-backed preview CLI recommendations, prioritized roadmap, and proposed acceptance gates.',
    tables_used: [
      'analysis/dsh-preview-cli-recommendations.md',
      'analysis/analyze-runs.mjs',
      'analysis/quality-assessment.md',
    ],
    filters: [
      'Recommendations limited to observed harness behavior and proposed regression tests',
      'Product targets are labeled as proposed, not observed measurements',
    ],
    metric_definitions: [
      'Preview exit targets are proposed acceptance thresholds and are not measured results.',
      'Semantic render validation means an external harness oracle returns structured text or JSON; it does not add image input to the DeepSeek model.',
    ],
  },
};

const errorSql = await readFile(path.join(analysisDir, 'dsh-error-classes.sql'), 'utf8');
const lifecycleSql = await readFile(path.join(analysisDir, 'dsh-lifecycle-events.sql'), 'utf8');
const recommendationSql = await readFile(
  path.join(analysisDir, 'dsh-recommendation-plan.sql'),
  'utf8',
);
const acceptanceSql = await readFile(
  path.join(analysisDir, 'dsh-preview-exit-gates.sql'),
  'utf8',
);
const errorSource = {
  id: 'dsh_error_class_query',
  label: 'Reviewed DSH tool-error taxonomy',
  path: 'analysis/dsh-error-classes.sql',
  query: {
    engine: 'sqlite',
    id: 'dsh-error-classes-v1',
    language: 'sql',
    sql: errorSql,
    executed_at: generatedAt,
    description:
      'Materializes 9 observable actionable failures by class, affected cases, and failure surface.',
    tables_used: [
      'analysis/dsh-error-classes.sql',
      'analysis/audit-dsh-errors.mjs',
      'runs/dsh/*/session.jsonl',
    ],
    filters: [
      'Four DSH benchmark sessions; no sampling',
      'Harness-declared errors plus non-zero command exits',
      'Benign GPU/Chrome stderr noise with successful exits excluded',
    ],
    metric_definitions: [
      'Actionable failure count includes harness-declared tool failures and non-zero command exits returned without a failure flag.',
      'Stream timeouts and LLM retries are tracked separately as lifecycle events.',
      'Affected cases count distinct DSH benchmark cases containing the error class.',
    ],
  },
};

const errorAuditSource = {
  id: 'dsh_error_audit',
  label: 'DSH session error audit',
  path: 'analysis/audit-dsh-errors.mjs',
  query: {
    engine: 'node',
    id: 'dsh-error-audit-v1',
    language: 'javascript',
    executed_at: generatedAt,
    description:
      'Audits every DSH tool-result envelope and separates the stale-file conflict from non-zero exits embedded in successful results.',
    tables_used: ['analysis/audit-dsh-errors.mjs', 'runs/dsh/*/session.jsonl'],
    filters: [
      'Four DSH benchmark sessions; no sampling',
      'Declared isError results and non-zero exit markers',
      'GPU performance logs and other successful-exit stderr noise excluded',
    ],
    metric_definitions: [
      'Harness-declared tool failure: tool-result item has isError=true.',
      'Command/runtime failure: a non-zero exit is present while the tool-result is not marked as an error.',
      'Actionable failure total = harness-declared tool failures + command/runtime failures.',
    ],
  },
};

const lifecycleSource = {
  id: 'dsh_lifecycle_query',
  label: 'DSH lifecycle event totals',
  path: 'analysis/dsh-lifecycle-events.sql',
  query: {
    engine: 'sqlite',
    id: 'dsh-lifecycle-events-v1',
    language: 'sql',
    sql: lifecycleSql,
    executed_at: generatedAt,
    description:
      'Materializes one-shot completion, retry, timeout, continuation, and permission-transition totals across four DSH minimal-preset sessions.',
    tables_used: [
      'analysis/dsh-lifecycle-events.sql',
      'analysis/analyze-runs.mjs',
      'runs/dsh/*/session.jsonl',
    ],
    filters: ['Four DSH benchmark sessions; no sampling'],
    metric_definitions: [
      'Stream timeout occurrences include retryable timeout events and terminal timeout turn endings.',
      'Manual continuations count user messages whose trimmed content is exactly 继续.',
      'Permission mode changes count transitions between distinct recorded sandbox modes.',
    ],
  },
};

const recommendationQuerySource = {
  id: 'dsh_recommendation_query',
  label: 'Prioritized DSH recommendation plan',
  path: 'analysis/dsh-recommendation-plan.sql',
  query: {
    engine: 'sqlite',
    id: 'dsh-recommendation-plan-v1',
    language: 'sql',
    sql: recommendationSql,
    executed_at: generatedAt,
    description: 'Materializes the prioritized roadmap and preview exit signal for each workstream.',
    tables_used: [
      'analysis/dsh-recommendation-plan.sql',
      'analysis/dsh-preview-cli-recommendations.md',
    ],
    filters: ['Roadmap items backed by observed benchmark evidence or labeled product targets'],
    metric_definitions: [
      'Priority is a product recommendation: P0 blocks unattended reliability, P1 hardens operations, and P2 improves reproducibility and UX.',
    ],
  },
};

const acceptanceQuerySource = {
  id: 'dsh_acceptance_query',
  label: 'Proposed DSH preview exit gates',
  path: 'analysis/dsh-preview-exit-gates.sql',
  query: {
    engine: 'sqlite',
    id: 'dsh-preview-exit-gates-v1',
    language: 'sql',
    sql: acceptanceSql,
    executed_at: generatedAt,
    description: 'Materializes observed baselines, proposed targets, and measurement definitions.',
    tables_used: [
      'analysis/dsh-preview-exit-gates.sql',
      'analysis/dsh-preview-cli-recommendations.md',
    ],
    filters: ['Targets are explicitly proposed and are not presented as current measurements'],
    metric_definitions: [
      'Preview exit targets are product acceptance recommendations, not statistical estimates from the n=1-per-cell benchmark.',
    ],
  },
};

const artifact = {
  surface: 'report',
  manifest: {
    version: 1,
    surface: 'report',
    title: 'DSH 修改意见：Preview CLI 优化建议',
    description:
      'An evidence-backed update on the DSH minimal preset, its closed reliability gaps, remaining semantic-validation risks, and next preview exit gates.',
    generatedAt,
    sources: [
      clonedSource('benchmark_analysis'),
      clonedSource('quality_review'),
      clonedSource('joined_results'),
      clonedSource('report_query'),
      clonedSource('harness_summary_query'),
      errorAuditSource,
      lifecycleSource,
      errorSource,
      recommendationSource,
      recommendationQuerySource,
      acceptanceQuerySource,
    ],
    cards: [],
    charts: [
      {
        id: 'one_shot_chart',
        title: 'One-shot completion rate by harness',
        subtitle: 'All three DeepSeek harnesses are 4/4 in the current single-run matrix; repetition is still required.',
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
            { field: 'manual_continues', type: 'quantitative', label: 'Manual continuations', format: 'number' },
          ],
        },
        yAxisTitle: 'One-shot completion rate',
        valueFormat: 'percent',
        maxRows: 3,
        layout: 'full',
      },
      {
        id: 'lifecycle_event_chart',
        title: 'DSH minimal lifecycle signals',
        subtitle: 'Four one-shot completions, three retries, one permission change, and no timeout or continuation.',
        showDescription: true,
        type: 'horizontalBar',
        dataset: 'lifecycle_events',
        sourceId: 'dsh_lifecycle_query',
        encodings: {
          x: { field: 'event', type: 'nominal', label: 'Event' },
          y: { field: 'count', type: 'quantitative', label: 'Observed count' },
          tooltip: [
            { field: 'interpretation', type: 'nominal', label: 'Interpretation' },
            { field: 'count', type: 'quantitative', label: 'Count', format: 'number' },
          ],
        },
        yAxisTitle: 'Observed event count',
        valueFormat: 'number',
        maxRows: 5,
        layout: 'full',
      },
      {
        id: 'dsh_time_chart',
        title: 'DSH adjusted completion time',
        subtitle: 'Current minimal-preset range is 18.5–59.3 minutes; only Flash/high excludes 1.96 seconds of retry backoff.',
        showDescription: true,
        type: 'horizontalBar',
        dataset: 'dsh_cases',
        sourceId: 'report_query',
        encodings: {
          x: { field: 'case_label', type: 'nominal', label: 'Model tier / effort' },
          y: { field: 'duration_min', type: 'quantitative', label: 'Adjusted completion time', unit: 'min' },
          tooltip: [
            { field: 'duration_min', type: 'quantitative', label: 'Adjusted minutes', format: 'number' },
            { field: 'wall_duration_min', type: 'quantitative', label: 'Wall minutes', format: 'number' },
            { field: 'quality_score', type: 'quantitative', label: 'Quality score', format: 'number' },
          ],
        },
        yAxisTitle: 'Adjusted minutes',
        valueFormat: 'number',
        maxRows: 4,
        layout: 'full',
      },
    ],
    tables: [
      {
        id: 'dsh_case_evidence',
        title: 'DSH case evidence',
        subtitle: 'All four cases are one-shot; exact time, quality, retry, failure, and continuation evidence remains visible.',
        showDescription: true,
        dataset: 'dsh_cases',
        sourceId: 'report_query',
        density: 'compact',
        layout: 'full',
        columns: [
          { field: 'case_label', label: 'Tier / effort', type: 'text' },
          { field: 'quality_status', label: 'Quality', type: 'text' },
          { field: 'duration_pair', label: 'Adjusted / wall', type: 'text' },
          { field: 'retry_timeout_pair', label: 'Retries / timeouts', type: 'text' },
          { field: 'failure_summary', label: 'Failures (declared + command)', type: 'text' },
          { field: 'manual_continues', label: 'Continues', type: 'number', format: 'number', align: 'right' },
        ],
      },
      {
        id: 'tool_error_classes',
        title: 'Observable DSH execution failures by class',
        subtitle: '9 actionable failures: 1 stale-file conflict plus 8 non-zero exits not flagged as tool errors.',
        showDescription: true,
        dataset: 'error_classes',
        sourceId: 'dsh_error_class_query',
        density: 'compact',
        layout: 'full',
        defaultSort: { field: 'incidents', direction: 'desc' },
        columns: [
          { field: 'error_class', label: 'Error class', type: 'text' },
          { field: 'incidents', label: 'Incidents', type: 'number', format: 'number', align: 'right' },
          { field: 'affected_cases', label: 'Cases', type: 'number', format: 'number', align: 'right' },
          { field: 'failure_surface', label: 'Failure surface', type: 'text' },
          { field: 'recommended_handler', label: 'Harness handler', type: 'text' },
        ],
      },
      {
        id: 'recommendation_plan',
        title: 'Prioritized recommendation plan',
        subtitle: 'P0 protects unattended completion; P1 hardens contracts and operations; P2 improves reproducibility and UX.',
        showDescription: true,
        dataset: 'recommendations',
        sourceId: 'dsh_recommendation_query',
        density: 'compact',
        layout: 'full',
        columns: [
          { field: 'priority', label: 'Priority', type: 'text' },
          { field: 'workstream', label: 'Workstream', type: 'text' },
          { field: 'proposed_change', label: 'Proposed change', type: 'text' },
          { field: 'exit_signal', label: 'Exit signal', type: 'text' },
        ],
      },
      {
        id: 'acceptance_gates',
        title: 'Proposed preview exit gates',
        subtitle: 'Targets are recommendations, not results measured by the current benchmark.',
        showDescription: true,
        dataset: 'acceptance_gates',
        sourceId: 'dsh_acceptance_query',
        density: 'compact',
        layout: 'full',
        columns: [
          { field: 'gate', label: 'Gate', type: 'text' },
          { field: 'observed', label: 'Observed', type: 'text' },
          { field: 'preview_exit_target', label: 'Proposed exit target', type: 'text' },
          { field: 'measurement', label: 'Measurement', type: 'text' },
        ],
      },
    ],
    blocks: [
      { id: 'title', type: 'markdown', body: '# DSH 修改意见：Preview CLI 优化建议' },
      {
        id: 'technical_summary',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## Technical Summary\n\nDSH 的 `minimal` preset 已经完成关键可靠性跃迁：当前四组为 **4/4 one-shot、0 次 manual continuation、0 次 stream timeout、0 次 capability mismatch**。剩余 P0 不再是 turn continuity，而是 **outcome normalization 与 semantic render validation**：277 次工具调用中仍有 8 个 non-zero exit 被包装为成功；最快的 Flash/max 虽只需 18.5 分钟，却把磁片与 Hub 旋成竖直面。建议默认使用 Flash/high（22.4 分钟、90/100），不要因速度选择 Flash/max，也不要自动升级到 Pro/max。',
      },
      {
        id: 'product_posture',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## 建议的 Preview CLI 定位\n\n建议把 `minimal` 描述为“已通过当前 one-shot 回归、正在强化语义验收与长期稳定性的 Preview preset”。这既承认 4/4 的实质进步，也避免把单次矩阵误写成稳定成功率。',
      },
      {
        id: 'one_shot_finding',
        type: 'markdown',
        sourceId: 'harness_summary_query',
        body: '## 已关闭的基线缺口：DSH minimal 达到 4/4 one-shot\n\n当前 DeepSeek 矩阵中，Pi、Codex、DSH 都是 4/4 one-shot；DSH 也没有 manual continuation 或 stream timeout。这个结果足以把 turn continuity 从当前 P0 移出，但每格只有一次，下一步应通过 n>=20 与 synthetic interruption fixtures 证明它可持续。',
      },
      { id: 'one_shot_visual', type: 'chart', chartId: 'one_shot_chart', layout: 'full' },
      {
        id: 'sol_control_boundary',
        type: 'markdown',
        sourceId: 'joined_results',
        body: `## 第二套同模型对照：Sol 交叉验证 Pi/Codex harness 影响\n\nPi/Codex × GPT-5.6 Sol high/xhigh/max 六组都使用同一 prompt：${solControlDescription}。三个 effort 档位均提供 Pi/Codex matched pair，工具路径、验证深度与恢复行为随 harness 改变。这组 matched control 支持“同一模型也会因 harness 改变执行路径”的工程假设；由于没有 DSH/Sol case，DSH 的直接归因仍以上面的 12-case DeepSeek 三方矩阵为准。`,
      },
      {
        id: 'error_accounting',
        type: 'markdown',
        sourceId: 'dsh_error_audit',
        body: '## 当前错误口径：1 个显式工具错误，9 个可操作失败\n\n四份 minimal session 只有 1 个 `isError=true` stale-file conflict；另有 8 个 non-zero command exit 被返回为 `isError=false`。因此统一口径是 9/277（3.2%），并保留 1/8 分层。结果标准化仍是 P0，因为错误 flag 决定 harness 能否可靠分配恢复预算。',
      },
      {
        id: 'lifecycle_finding',
        type: 'markdown',
        sourceId: 'benchmark_analysis',
        body: '## 生命周期证据：自动恢复已闭合到完成\n\n四组 DSH 合计 4 次 one-shot completion、3 次 LLM retry、0 次 stream timeout、0 次人工继续和 1 次运行中权限变更。当前恢复路径能够完成任务；剩余的 preflight 缺口是让无人值守 run 不在中途改变权限模式。',
      },
      { id: 'lifecycle_visual', type: 'chart', chartId: 'lifecycle_event_chart', layout: 'full' },
      {
        id: 'time_finding',
        type: 'markdown',
        sourceId: 'report_query',
        body: '## 时间主线：Flash/high 可用，Pro 档工具循环过长\n\nDSH 当前用时为 18.5–59.3 分钟，只有 Flash/high 扣除 1.96 秒 retry backoff，其余 adjusted 与 wall time 相同。Flash/high 在 22.4 分钟达到 90 分；Pro/high 用 82 次 model call、80 次 tool call 和 8.65M 输入只多 1 分。优先压缩重复 model/tool round trip，而不是调整当前未触发的 timeout。',
      },
      { id: 'time_visual', type: 'chart', chartId: 'dsh_time_chart', layout: 'full' },
      { id: 'case_table', type: 'table', tableId: 'dsh_case_evidence', layout: 'full' },
      {
        id: 'capability_section',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## 已改善 — 能力协商保持为回归护栏\n\n四组 text-only DeepSeek session 都没有调用 `read_image`，前一轮的 capability mismatch 已消失。应把 model-profile tool filtering 固化为 regression test；视觉验收继续由 harness 的外部 oracle 提供结构化文本/JSON，而不是向主模型暴露不可执行工具。',
      },
      {
        id: 'continuity_section',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## P0 — Semantic render validation：页面能跑不等于几何正确\n\nFlash/max 通过加载、Space 往返和语法检查，却把磁片与 Hub 旋成竖直面。外部 `render_validate` 应返回关键部件法向/包围盒、viewport 占用、标签碰撞、状态转换和三处 shutter channel 对齐断言。纯文本主模型消费 JSON 即可；必要时再接独立 vision evaluator。',
      },
      {
        id: 'tool_contract_section',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## P0 — Typed tool contract：8 个 non-zero exit 不能伪装成成功\n\n`bash` adapter 必须返回失败状态、exit code、stderr 与 retry class，不能只把 `[exit code: 1]` 塞进 `isError=false` 文本。错误分类至少覆盖 `retryable`、`permanent`、`permission_denied` 与 `stale_revision`；唯一的 stale conflict 用 revision token + 一次 bounded re-read/replay 处理。',
      },
      { id: 'error_class_table', type: 'table', tableId: 'tool_error_classes', layout: 'full' },
      {
        id: 'headless_section',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## P1 — Headless preflight：消除最后一次权限漂移\n\n提供显式 `--sandbox`、`--approval`、`--non-interactive` 与 capability preflight；一次性解析工作目录、可写路径、浏览器能力和工具清单。当前仅 Pro/high 记录 1 次权限变更，目标是无人值守 run 中保持为 0。',
      },
      {
        id: 'observability_section',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## P1 — Observability：让 minimal preset 的收益可持续比较\n\n建议稳定输出 `--json-summary`：selected preset、resolved CLI/model version、effort、adjusted/wall time、TTFT、token/cache、model/tool calls、tool errors by class、retries、exit reason 与 artifact paths。产品门槛同时看 one-shot、semantic acceptance 与 automatic recovery；cache hit 只描述复用比例。',
      },
      {
        id: 'implementation_sequence',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## 推荐实现顺序\n\n`typed tool adapter → semantic render validator → safe edit replay → tool-loop budget → headless preflight → JSON summary → repeated regression`\n\n前两项直接覆盖当前 8 个错误 flag 缺口与 Flash/max critical defect；随后压缩 Pro 档成本，并把本轮 one-shot/capability 收益固化为可重复证据。',
      },
      { id: 'recommendation_table', type: 'table', tableId: 'recommendation_plan', layout: 'full' },
      {
        id: 'acceptance_section',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## 建议的 Preview exit gates\n\n下列阈值是下一轮开发验收建议，不是当前 n=1-per-cell 数据得出的统计结论。当前 4/4 one-shot、0 continuation、0 timeout 与 0 capability mismatch 都是待保持的绿色基线；8 个 unflagged exit、1 个 semantic escape 与 1 次权限变更仍是明确红项。',
      },
      { id: 'acceptance_table', type: 'table', tableId: 'acceptance_gates', layout: 'full' },
      {
        id: 'scope_methodology',
        type: 'markdown',
        body: '## Scope, definitions, and methodology\n\n核心证据来自相同 canonical prompt 的 12 次 DeepSeek 执行：Pi、Codex、DSH 各 4 个模型档位/effort 组合，每格 n=1；当前 DSH 四组均使用 `minimal` agent preset。另有 Pi/Codex × GPT-5.6 Sol high/xhigh/max 六次 matched control，用于交叉检查 Pi/Codex harness 行为。DSH adjusted time 从 first user 到 completed turn 的墙钟时间中扣除可识别等待；本轮只有 Flash/high 扣除 1.96 秒 retry backoff。质量分采用功能 30、规格 30、视觉 25、验证/可维护性 15 的 rubric。',
      },
      {
        id: 'limitations',
        type: 'markdown',
        body: '## Limitations and robustness\n\n每格仅一次执行，无法估计方差或显著性；本报告把差异用于定位工程风险，不宣称统计因果。各 harness 的工具结果 schema 不完全一致，因此 9 个 DSH 可操作失败用于 DSH 内部诊断，不直接换算成严格的跨 harness 排名。Sol 的 Pi/Codex 比较不包含 DSH，也不能与 DeepSeek 聚合。当前质量复核使用本地 headless Chrome 生成 1280×720 截图后人工检查；DSH 主模型不具备图像输入能力。',
      },
      {
        id: 'further_questions',
        type: 'markdown',
        body: '## Further questions\n\n1. `bash` adapter 能否在 wrapper 层可靠提取 exit code，并把 stderr 与 retry class 标准化？\n2. `render_validate` 的最小 contract 是否应先覆盖法向/包围盒、viewport、label collision 与 state transition？\n3. Pro 档能否设置 model/tool round budget，并在不降质量的前提下压缩稳定上下文？\n4. Preview release 是否愿意把 one-shot、semantic acceptance 与 synthetic recovery fixtures 同时设为阻断门槛？',
      },
    ],
  },
  snapshot: {
    version: 1,
    status: 'ready',
    generatedAt,
    datasets: {
      dsh_cases: dshCases,
      harness_summary: harnessSummary,
      lifecycle_events: lifecycleEvents,
      error_classes: errorClasses,
      recommendations,
      acceptance_gates: acceptanceGates,
    },
  },
};

await mkdir(outputDir, { recursive: true });
const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
await writeFile(artifactPath, serialized);
await writeFile(portableArtifactPath, serialized);
console.log(`Wrote ${path.relative(workspace, artifactPath)}`);
console.log(`Wrote ${path.relative(workspace, portableArtifactPath)}`);
