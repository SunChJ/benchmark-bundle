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
const lifecycleEvents = [
  { event: 'Stream timeout occurrence', count: 20, interpretation: 'Turn continuity signal' },
  { event: 'LLM retry', count: 15, interpretation: 'Automatic retry attempt' },
  { event: 'Manual continuation', count: 8, interpretation: 'Unattended completion failure' },
  { event: 'Permission mode change', count: 3, interpretation: 'Preflight contract gap' },
];
const errorClassHandlers = {
  'non-zero command exit': 'Return a typed error envelope with exit code and stderr',
  'stale file revision': 'Re-read and replay once with a revision token',
  'runtime exception without failure flag': 'Detect process failure and set the tool error flag',
  'image capability mismatch': 'Hide read_image and route to render_validate',
  'unsupported regex feature': 'Return an executable compatibility hint',
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
    workstream: 'Turn continuity',
    proposed_change: 'Progress-aware watchdog, same-turn resume, idempotent steps, atomic completion marker.',
    exit_signal: 'Synthetic stream interruptions recover without user continuation.',
  },
  {
    priority: 'P0',
    workstream: 'Capability negotiation',
    proposed_change: 'Resolve model capabilities before the turn and hide incompatible tools.',
    exit_signal: 'Zero permanent capability-mismatch tool calls.',
  },
  {
    priority: 'P0',
    workstream: 'Visual validation',
    proposed_change: 'Add a text/JSON render_validate oracle for console, DOM, viewport, state and image statistics.',
    exit_signal: 'Pure-text models verify visual tasks without direct image input.',
  },
  {
    priority: 'P1',
    workstream: 'Typed tool recovery',
    proposed_change: 'Normalize non-zero exits/runtime exceptions into typed failures; make stale edits revision-aware.',
    exit_signal: 'No actionable subprocess failure is returned as success.',
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
    proposed_change: 'Emit a stable JSON summary for versions, timings, tokens/cache, retries, errors and exit reason.',
    exit_signal: 'Every benchmark run produces a schema-valid summary.',
  },
  {
    priority: 'P2',
    workstream: 'Reproducibility and UX',
    proposed_change: 'Pin resolved CLI integrity, add dsh resume, and explain automatic recovery states.',
    exit_signal: 'A run can be reproduced and resumed from its manifest.',
  },
];

const acceptanceGates = [
  {
    gate: 'One-shot completion',
    observed: '0/4 DSH cases',
    preview_exit_target: '4/4 regression; then >=95% across n>=20',
    measurement: 'Completed artifact without manual continuation',
  },
  {
    gate: 'Manual continuation',
    observed: '8 messages',
    preview_exit_target: '0 in unattended mode',
    measurement: 'Continuation messages after canonical prompt',
  },
  {
    gate: 'Capability mismatch',
    observed: '3 read_image failures',
    preview_exit_target: '0 after preflight',
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
    observed: '14 failures not flagged as tool errors',
    preview_exit_target: '0 unflagged actionable failures',
    measurement: 'Non-zero exits and runtime exceptions vs tool status',
  },
  {
    gate: 'Permission stability',
    observed: '3 mid-run changes',
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
      'Visual validation means an external harness oracle returns structured text or JSON; it does not add image input to the DeepSeek model.',
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
      'Materializes 23 observable actionable failures by class, affected cases, and failure surface.',
    tables_used: [
      'analysis/dsh-error-classes.sql',
      'analysis/audit-dsh-errors.mjs',
      'runs/dsh/*/session.jsonl',
    ],
    filters: [
      'Four DSH benchmark sessions; no sampling',
      'Harness-declared errors plus non-zero command exits and runtime exceptions',
      'Benign GPU/Chrome stderr noise with successful exits excluded',
    ],
    metric_definitions: [
      'Actionable failure count includes harness-declared tool failures, non-zero command exits, and runtime exceptions returned without a failure flag.',
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
      'Audits every DSH tool-result envelope and separates harness-declared failures from command/runtime failures embedded in successful results.',
    tables_used: ['analysis/audit-dsh-errors.mjs', 'runs/dsh/*/session.jsonl'],
    filters: [
      'Four DSH benchmark sessions; no sampling',
      'Declared isError results, non-zero exit markers, and JavaScript runtime exceptions',
      'GPU performance logs and other successful-exit stderr noise excluded',
    ],
    metric_definitions: [
      'Harness-declared tool failure: tool-result item has isError=true.',
      'Command/runtime failure: non-zero exit or runtime exception is present while the tool-result is not marked as an error.',
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
      'Materializes stream timeout, retry, continuation, and permission-transition totals across four DSH sessions.',
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
      'A friendly, evidence-backed improvement plan for the DSH preview CLI, benchmarked against Pi and Codex using the same DeepSeek model tiers.',
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
        subtitle: 'Four cases per harness; same canonical prompt and matching DeepSeek model tiers/effort.',
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
        title: 'DSH lifecycle events',
        subtitle: 'Observed totals across four DSH sessions; counts are events, not rates.',
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
        maxRows: 4,
        layout: 'full',
      },
      {
        id: 'dsh_time_chart',
        title: 'DSH adjusted completion time',
        subtitle: 'Minutes after removing explicit stream-idle, retry-backoff, and disconnect waits; every case still required two continuations.',
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
        subtitle: 'Adjusted/wall time and retry/timeout pairs are shown as compact exact values.',
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
        subtitle: '23 actionable failures: 9 harness-declared plus 14 command/runtime failures not flagged as tool errors.',
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
        body: '## Technical Summary\n\nDSH 已经能产出有竞争力的结果：4 个实现全部通过质量 rubric，最高 88/100；但它尚未形成可靠的无人值守执行闭环。相同 DeepSeek 模型档位下，DSH 0/4 one-shot，Pi/Codex 合计 8/8。重新审计四份 DSH session 后，共识别出 **23 个可操作失败**：9 个 harness-declared tool failures，以及 14 个被包装在“成功” tool-result 里的 command/runtime failures。最高优先级应是 turn 生命周期、失败结果标准化、自动恢复与能力协商，而不是把问题简单归因于模型。',
      },
      {
        id: 'product_posture',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## 建议的 Preview CLI 定位\n\n建议把 DSH 描述为“生成质量已具备竞争力、执行可靠性仍在 hardening 的 Preview CLI”。这既尊重当前成果，也把改进目标落到 harness 可控制的边界：恢复、工具契约、权限预检与可观测性。',
      },
      {
        id: 'one_shot_finding',
        type: 'markdown',
        sourceId: 'harness_summary_query',
        body: '## 首要缺口：任务完成语义，而非错误发生率\n\nPi 与 Codex 的 8 个 case 都能在原始 prompt 后自动完成；DSH 4 个 case 均需要两次人工继续。该对比控制了模型档位和 effort，最合理的工程假设是 harness 的 turn supervisor 与恢复状态机尚不完整。',
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
        body: '## 先修正错误口径：9 个显式工具错误，23 个可操作失败\n\n你指出的 `read_image` capability mismatch、stale-file edit 与 regex rejection 均已计入 9 个 `isError=true` 事件。进一步审计还发现 10 个 non-zero command exit 和 4 个 JavaScript runtime exception 被返回为 `isError=false`。因此只看 9/178（5.1%）会低估真实失败面；报告以下统一使用 23 个可操作失败，同时保留 9/14 分层，避免把模型脚本错误和 harness 工具契约错误混在一起。',
      },
      {
        id: 'lifecycle_finding',
        type: 'markdown',
        sourceId: 'benchmark_analysis',
        body: '## 生命周期证据：自动 retry 没有闭合到自动 completion\n\n四组 DSH 合计出现 20 次 stream-timeout occurrence、15 次 LLM retry、8 次人工继续和 3 次运行中权限变更。系统已经尝试恢复，但恢复结果没有可靠地回到同一个 turn 并写入完成状态。',
      },
      { id: 'lifecycle_visual', type: 'chart', chartId: 'lifecycle_event_chart', layout: 'full' },
      {
        id: 'time_finding',
        type: 'markdown',
        sourceId: 'report_query',
        body: '## 去掉断线和重试等待后，仍需压缩有效工作路径\n\n按要求扣除可识别的 300 秒 stream-idle timeout、retry backoff 和错误轮次间隔后，DSH 仍需 40.3–72.1 分钟。高 cache hit 并未抵消重复上下文重放；优先减少无效 model/tool round trip，比继续放宽 timeout 更有效。',
      },
      { id: 'time_visual', type: 'chart', chartId: 'dsh_time_chart', layout: 'full' },
      { id: 'case_table', type: 'table', tableId: 'dsh_case_evidence', layout: 'full' },
      {
        id: 'capability_section',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## P0 — 能力协商：纯文本模型不应看到不可执行工具\n\nDeepSeek V4 Flash/Pro 不接受图像输入。DSH 应在首个 turn 前按 model capability registry 过滤工具，隐藏 `read_image`；视觉验收改由 harness 提供 `render_validate` 外部 oracle，向模型返回 console error、DOM/viewport 边界、状态转换断言和图像统计的文本/JSON。需要语义审图时可接独立 vision evaluator，但不要把它伪装成主模型能力。',
      },
      {
        id: 'continuity_section',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## P0 — Turn supervisor：让恢复留在同一任务里\n\n把固定 idle timeout 改为 progress-aware watchdog：token、reasoning、tool heartbeat 任一前进就续租；断连后以幂等 step/turn ID 在同一 turn 内 resume，并由 harness 原子写入 completion marker。建议给每类恢复设置总预算，预算耗尽时才向用户报告明确的可恢复状态。',
      },
      {
        id: 'tool_contract_section',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## P1 — Typed tool contract：先让失败成为结构化事实\n\n`bash` 的 non-zero exit 与 runtime exception 必须返回失败状态、exit code、stderr 和 retry class，不能只把 `[exit code: 1]` 塞进 `isError=false` 的文本。再统一错误分类为 `retryable`、`permanent`、`capability_mismatch`、`permission_denied` 和 `stale_revision`。文件 edit 携带 revision token；冲突时自动 re-read + 单次 replay。',
      },
      { id: 'error_class_table', type: 'table', tableId: 'tool_error_classes', layout: 'full' },
      {
        id: 'headless_section',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## P1 — Headless preflight：首个模型调用前固定运行契约\n\n提供显式 `--sandbox`、`--approval`、`--non-interactive` 与 capability preflight；一次性解析工作目录、可写路径、浏览器能力和工具清单。无人值守 run 中不应临时切换权限模式，也不应让模型通过失败来发现环境约束。',
      },
      {
        id: 'observability_section',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## P1 — Observability：让回归指标可直接比较\n\n建议稳定输出 `--json-summary`：resolved CLI/model version、effort、adjusted/wall time、TTFT、token/cache、tool errors by class、retries、timeouts、exit reason 和 artifact paths。产品门槛先看 one-shot 与 automatic recovery，再看 raw error rate；cache hit 只描述复用比例，不应当作效率结论。',
      },
      {
        id: 'implementation_sequence',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## 推荐实现顺序\n\n`model profile → capability-filtered tools → turn supervisor → typed tool adapter → external render validator → JSON summary`\n\n先完成前两项 P0，即可消除最明显的永久失败和人工续跑；P1 再把恢复与观测固化成可回归的产品契约。',
      },
      { id: 'recommendation_table', type: 'table', tableId: 'recommendation_plan', layout: 'full' },
      {
        id: 'acceptance_section',
        type: 'markdown',
        sourceId: 'dsh_recommendation_review',
        body: '## 建议的 Preview exit gates\n\n下列阈值是下一轮开发验收建议，不是当前 n=1-per-cell 数据得出的统计结论。先用 deterministic fixtures 封住恢复语义，再把 benchmark 扩展到每格至少 20 次以报告 p50/p90 与 one-shot rate。',
      },
      { id: 'acceptance_table', type: 'table', tableId: 'acceptance_gates', layout: 'full' },
      {
        id: 'scope_methodology',
        type: 'markdown',
        body: '## Scope, definitions, and methodology\n\n核心证据来自相同 canonical prompt 的 12 次 DeepSeek 执行：Pi、Codex、DSH 各 4 个模型档位/effort 组合，每格 n=1；另有 Pi/Codex × GPT-5.6 Sol high/xhigh/max 六次 matched control，用于交叉检查 Pi/Codex harness 行为。DSH adjusted time 从 first user 到 completed turn 的墙钟时间中扣除日志明确记录的 300 秒 stream-idle timeout、retry backoff 和 error-end-to-next-turn disconnect gap。质量分采用功能 30、规格 30、视觉 25、验证/可维护性 15 的 rubric。',
      },
      {
        id: 'limitations',
        type: 'markdown',
        body: '## Limitations and robustness\n\n每格仅一次执行，无法估计方差或显著性；本报告把差异用于定位工程风险，不宣称统计因果。各 harness 的工具结果 schema 不完全一致，因此 23 个 DSH 可操作失败用于 DSH 内部诊断，不直接换算成跨 harness 失败率排名。DSH adjusted time 仍是保守近似。Sol 的 Pi/Codex 比较是 matched harness 对照，但不包含 DSH，也不能与 DeepSeek 聚合。Pi/Codex 的成功也不代表 DeepSeek 主模型具备视觉能力；建议的视觉方案明确依赖 harness 外部 oracle。',
      },
      {
        id: 'further_questions',
        type: 'markdown',
        body: '## Further questions\n\n1. DSH 的 transport 是否能提供 heartbeat、resume cursor 与幂等 request ID？\n2. 当前 tool registry 是否能读取模型 capability profile，并在 prompt 构建前完成过滤？\n3. `read_image` 的产品目标是 host-side vision evaluator，还是应完全从纯文本模型 profile 移除？\n4. Preview release 是否愿意把 one-shot 与 synthetic recovery fixture 设为阻断门槛？',
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
