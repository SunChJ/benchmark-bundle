#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const workspace = path.resolve(import.meta.dirname, '..');
const runsRoot = path.join(workspace, 'runs');

async function directories(root) {
  return (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .sort();
}

async function filesRecursively(root, predicate) {
  const found = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['cache', 'tmp', 'node_modules', 'skills'].includes(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (predicate(absolutePath)) found.push(absolutePath);
    }
  }
  await visit(root);
  return found.sort();
}

function parseCaseName(caseName) {
  const harness = caseName.startsWith('codex-') ? 'Codex' : 'Pi';
  const model = caseName.includes('-pro-') ? 'DeepSeek V4 Pro' : 'DeepSeek V4 Flash';
  const effort = caseName.endsWith('-max') ? 'max' : 'high';
  return { harness, model, effort };
}

function parseJsonLines(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function isoDurationMs(start, end) {
  return new Date(end).getTime() - new Date(start).getTime();
}

function summarizePi(events) {
  const messages = events.filter((event) => event.type === 'message');
  const userMessages = messages.filter((event) => event.message?.role === 'user');
  const assistantMessages = messages.filter((event) => event.message?.role === 'assistant');
  const firstUser = userMessages[0];
  const firstAssistant = assistantMessages[0];
  const lastAssistant = assistantMessages.at(-1);

  const usage = assistantMessages.reduce(
    (totals, event) => {
      const current = event.message?.usage ?? {};
      totals.uncachedInputTokens += current.input ?? 0;
      totals.cachedInputTokens += current.cacheRead ?? 0;
      totals.cacheWriteTokens += current.cacheWrite ?? 0;
      totals.outputTokens += current.output ?? 0;
      totals.reasoningOutputTokens += current.reasoning ?? 0;
      totals.totalTokens += current.totalTokens ?? 0;
      totals.loggedCostUsd += current.cost?.total ?? 0;
      return totals;
    },
    {
      uncachedInputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
      loggedCostUsd: 0,
    },
  );

  const toolNames = assistantMessages.flatMap((event) =>
    (event.message?.content ?? [])
      .filter((item) => item.type === 'toolCall')
      .map((item) => item.name),
  );

  const totalInputTokens = usage.uncachedInputTokens + usage.cachedInputTokens;
  return {
    durationMs: isoDurationMs(firstUser.timestamp, lastAssistant.timestamp),
    firstModelResponseCompletionMs: isoDurationMs(firstUser.timestamp, firstAssistant.timestamp),
    timeToFirstTokenMs: null,
    ...usage,
    totalInputTokens,
    cacheHitRate: totalInputTokens ? usage.cachedInputTokens / totalInputTokens : null,
    modelCalls: assistantMessages.length,
    toolCalls: toolNames.length,
    toolNames,
    startedAt: firstUser.timestamp,
    completedAt: lastAssistant.timestamp,
    finalStopReason: lastAssistant.message?.stopReason ?? null,
  };
}

function summarizeCodex(events) {
  const taskStarted = events.find(
    (event) => event.type === 'event_msg' && event.payload?.type === 'task_started',
  );
  const taskComplete = events.findLast(
    (event) => event.type === 'event_msg' && event.payload?.type === 'task_complete',
  );
  const tokenEvents = events.filter(
    (event) =>
      event.type === 'event_msg' &&
      event.payload?.type === 'token_count' &&
      event.payload?.info?.total_token_usage,
  );
  const tokenUsage = tokenEvents.at(-1)?.payload.info.total_token_usage ?? {};
  const toolEvents = events.filter(
    (event) =>
      event.type === 'response_item' &&
      ['function_call', 'custom_tool_call'].includes(event.payload?.type),
  );
  const reasoningItems = events.filter(
    (event) => event.type === 'response_item' && event.payload?.type === 'reasoning',
  );
  const totalInputTokens = tokenUsage.input_tokens ?? 0;
  const cachedInputTokens = tokenUsage.cached_input_tokens ?? 0;

  return {
    durationMs:
      taskComplete?.payload?.duration_ms ??
      isoDurationMs(taskStarted.timestamp, taskComplete.timestamp),
    firstModelResponseCompletionMs: null,
    timeToFirstTokenMs: taskComplete?.payload?.time_to_first_token_ms ?? null,
    uncachedInputTokens: totalInputTokens - cachedInputTokens,
    cachedInputTokens,
    cacheWriteTokens: tokenUsage.cache_write_input_tokens ?? 0,
    totalInputTokens,
    outputTokens: tokenUsage.output_tokens ?? 0,
    reasoningOutputTokens: tokenUsage.reasoning_output_tokens ?? 0,
    totalTokens: tokenUsage.total_tokens ?? 0,
    loggedCostUsd: null,
    cacheHitRate: totalInputTokens ? cachedInputTokens / totalInputTokens : null,
    modelCalls: reasoningItems.length,
    toolCalls: toolEvents.length,
    toolNames: toolEvents.map((event) => event.payload.name ?? event.payload.tool_name),
    startedAt: taskStarted?.timestamp ?? null,
    completedAt: taskComplete?.timestamp ?? null,
    finalStopReason: taskComplete ? 'task_complete' : null,
  };
}

function scanImplementation(html) {
  const requiredLabels = [
    'HD NOTCH',
    'TOP SHELL',
    'DUST LINER',
    'MAGNETIC DISK',
    'HUB',
    'BOTTOM SHELL',
    'LIFTER',
    'SHUTTER SPRING',
    'WRITE PROTECT NOTCH',
    'SHUTTER',
    'WRITE PROTECT TAB',
  ];

  return {
    hasThreeJs: /three(?:\.module)?\.js|from ['"]three['"]/.test(html),
    hasOrbitControls: /OrbitControls/.test(html),
    hasCss2D: /CSS2DRenderer/.test(html) && /CSS2DObject/.test(html),
    hasOrthographicCamera: /OrthographicCamera/.test(html),
    hasRequiredCameraPosition: /position\.set\(\s*100\s*,\s*80\s*,\s*100\s*\)/.test(html),
    hasCanvasDotGrid: /getContext\(['"]2d['"]\)/.test(html) && /arc\s*\(/.test(html),
    hasEdgesGeometry: /EdgesGeometry/.test(html),
    hasExtrudedShells: /ExtrudeGeometry/.test(html),
    hasShapeHoles: /\.holes\.(push|unshift)\s*\(/.test(html),
    hasExplicitMouseMapping:
      /mouseButtons\.LEFT\s*=\s*THREE\.MOUSE\.ROTATE/.test(html) &&
      /mouseButtons\.RIGHT\s*=\s*THREE\.MOUSE\.PAN/.test(html) &&
      /enableZoom\s*=\s*true/.test(html),
    hasContextMenuSuppression: /contextmenu/.test(html) && /preventDefault/.test(html),
    hasZoomBounds: /minZoom/.test(html) && /maxZoom/.test(html),
    hasPanClamp: /clamp|Math\.(min|max).*controls\.target|target\.length\(\)/i.test(html),
    hasFourStates: ['assembled', 'exploding', 'exploded', 'collapsing'].every((state) =>
      html.includes(`'${state}'`) || html.includes(`"${state}"`),
    ),
    hasCubicEasing: /easeInOutCubic/.test(html),
    hasThreeSecondDuration: /(?:3000|3_000)/.test(html),
    hasEightyMsStagger: /(?:delay|stagger)[^\n]{0,80}80|\*\s*80/.test(html),
    hasOpacityInterpolation: /opacity/.test(html) && /lerp|fromOpacity|explodedOpacity|assembledOpacity/i.test(html),
    hasDashedLines: /LineDashedMaterial/.test(html) && /computeLineDistances/.test(html),
    labelsPresent: requiredLabels.filter((label) => html.includes(label)).length,
    hasResizeHandling: /addEventListener\(['"]resize['"]/.test(html),
    hasSelfCheck: /self.?check|自检/i.test(html),
  };
}

async function main() {
  const rows = [];
  for (const batchDir of await directories(runsRoot)) {
    const promptPath = path.join(batchDir, 'prompts.md');
    let promptHash = null;
    try {
      promptHash = createHash('sha256').update(await readFile(promptPath)).digest('hex');
    } catch {
      continue;
    }

    for (const caseDir of await directories(batchDir)) {
      const caseName = path.basename(caseDir);
      const sessionFiles = await filesRecursively(
        caseDir,
        (file) => file.endsWith('.jsonl') && file.split(path.sep).includes('sessions'),
      );
      const outputFiles = (await readdir(caseDir))
        .filter((file) => file.endsWith('.html') && !file.startsWith('pi-session-'))
        .map((file) => path.join(caseDir, file));
      if (sessionFiles.length !== 1 || outputFiles.length !== 1) continue;

      const events = parseJsonLines(await readFile(sessionFiles[0], 'utf8'));
      const outputHtml = await readFile(outputFiles[0], 'utf8');
      const outputStat = await stat(outputFiles[0]);
      const identity = parseCaseName(caseName);
      const metrics = identity.harness === 'Pi' ? summarizePi(events) : summarizeCodex(events);

      rows.push({
        case: caseName,
        batch: path.basename(batchDir),
        promptHash,
        outputPath: path.relative(workspace, outputFiles[0]),
        sessionPath: path.relative(workspace, sessionFiles[0]),
        outputBytes: outputStat.size,
        outputLines: outputHtml.split('\n').length,
        ...identity,
        ...metrics,
        implementation: scanImplementation(outputHtml),
      });
    }
  }

  rows.sort((a, b) => a.case.localeCompare(b.case));
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
}

await main();
