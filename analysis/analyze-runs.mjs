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
  const harness = caseName.startsWith('ds-harness-')
    ? 'DSH'
    : caseName.startsWith('codex-')
      ? 'Codex'
      : 'Pi';
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

function canonicalPromptHash(text) {
  const canonical = text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trimEnd();
  return createHash('sha256').update(canonical).digest('hex');
}

function isoDurationMs(start, end) {
  return new Date(end).getTime() - new Date(start).getTime();
}

function percentage(numerator, denominator) {
  return denominator ? numerator / denominator : null;
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
  const toolResults = messages.filter((event) => event.message?.role === 'toolResult');
  const toolFailureCount = toolResults.filter((event) => event.message?.isError === true).length;

  const totalInputTokens = usage.uncachedInputTokens + usage.cachedInputTokens;
  return {
    durationMs: isoDurationMs(firstUser.timestamp, lastAssistant.timestamp),
    wallDurationMs: isoDurationMs(firstUser.timestamp, lastAssistant.timestamp),
    excludedWaitMs: 0,
    firstModelResponseCompletionMs: isoDurationMs(firstUser.timestamp, firstAssistant.timestamp),
    timeToFirstTokenMs: null,
    ...usage,
    totalInputTokens,
    cacheHitRate: totalInputTokens ? usage.cachedInputTokens / totalInputTokens : null,
    modelCalls: assistantMessages.length,
    toolCalls: toolNames.length,
    toolNames,
    toolFailureCount,
    toolFailureRate: percentage(toolFailureCount, toolNames.length),
    oneShotCompleted: true,
    completionMode: 'one-shot',
    manualContinueCount: 0,
    streamTimeoutCount: 0,
    llmRetryCount: 0,
    permissionChangeCount: 0,
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
  const toolOutputEvents = events.filter(
    (event) =>
      event.type === 'response_item' &&
      ['function_call_output', 'custom_tool_call_output'].includes(event.payload?.type),
  );
  const toolFailureCount = toolOutputEvents.filter((event) => {
    const output = typeof event.payload?.output === 'string' ? event.payload.output : '';
    return (
      /Process exited with code [1-9]\d*/i.test(output) ||
      /Exit code:\s*[1-9]\d*/i.test(output) ||
      /exec_command failed/i.test(output) ||
      /CreateProcess \{ message: "Rejected/i.test(output)
    );
  }).length;
  const totalInputTokens = tokenUsage.input_tokens ?? 0;
  const cachedInputTokens = tokenUsage.cached_input_tokens ?? 0;

  return {
    durationMs:
      taskComplete?.payload?.duration_ms ??
      isoDurationMs(taskStarted.timestamp, taskComplete.timestamp),
    wallDurationMs:
      taskComplete?.payload?.duration_ms ??
      isoDurationMs(taskStarted.timestamp, taskComplete.timestamp),
    excludedWaitMs: 0,
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
    toolFailureCount,
    toolFailureRate: percentage(toolFailureCount, toolEvents.length),
    oneShotCompleted: true,
    completionMode: 'one-shot',
    manualContinueCount: 0,
    streamTimeoutCount: 0,
    llmRetryCount: 0,
    permissionChangeCount: 0,
    startedAt: taskStarted?.timestamp ?? null,
    completedAt: taskComplete?.timestamp ?? null,
    finalStopReason: taskComplete ? 'task_complete' : null,
  };
}

function textItems(message) {
  return (message?.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');
}

function dshToolFailureCategory(event) {
  const text = (event.data?.message?.content ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');
  if (/does not declare image input/i.test(text)) return 'model-capability mismatch';
  if (/file changed since it was read/i.test(text)) return 'stale file version';
  if (/look-around.*not supported|regex parse error/i.test(text)) return 'unsupported regex';
  return 'other';
}

function summarizeDsh(events) {
  const userMessages = events.filter(
    (event) => event.type === 'user/message' && event.data?.source?.kind === 'user',
  );
  const assistantMessages = events.filter((event) => event.type === 'assistant/message');
  const toolCalls = events.filter((event) => event.type === 'tool/call');
  const toolResults = events.filter((event) => event.type === 'tool/result');
  const retries = events.filter((event) => event.type === 'llm/retry');
  const turnEnds = events.filter((event) => event.type === 'turn/end');
  const completedTurn = turnEnds.findLast((event) => event.data?.reason?.kind === 'completed');
  const firstUser = userMessages[0];
  const firstAssistant = assistantMessages[0];

  const usage = assistantMessages.reduce(
    (totals, event) => {
      const current = event.data?.usage ?? {};
      totals.uncachedInputTokens += current.inputTokens ?? 0;
      totals.cachedInputTokens += current.cacheReadTokens ?? 0;
      totals.cacheWriteTokens += current.cacheWriteTokens ?? 0;
      totals.outputTokens += current.outputTokens ?? 0;
      totals.reasoningOutputTokens += current.reasoningTokens ?? 0;
      return totals;
    },
    {
      uncachedInputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    },
  );

  const totalInputTokens = usage.uncachedInputTokens + usage.cachedInputTokens;
  const failedToolResults = toolResults.filter((event) =>
    (event.data?.message?.content ?? []).some(
      (item) => item.type === 'tool-result' && item.isError === true,
    ),
  );
  const toolFailureCount = failedToolResults.length;
  const toolFailureCategories = Object.fromEntries(
    [...new Set(failedToolResults.map(dshToolFailureCategory))].map((category) => [
      category,
      failedToolResults.filter((event) => dshToolFailureCategory(event) === category).length,
    ]),
  );
  const manualContinueCount = userMessages.filter(
    (event) => textItems(event.data).trim() === '继续',
  ).length;
  const streamTimeoutCount = retries.filter(
    (event) => event.data?.failure?.code === 'TIMEOUT',
  ).length;
  const permissionChangeCount = Math.max(
    0,
    new Set(events.filter((event) => event.type === 'sandbox/mode').map((event) => event.data?.mode))
      .size - 1,
  );
  const promptText = textItems(firstUser?.data);
  const retryTimeoutWaitMs = retries.reduce((total, event) => {
    const match = event.data?.failure?.message?.match(/timeout after (\d+)ms/i);
    return total + (match ? Number(match[1]) : 0);
  }, 0);
  const terminalTimeoutWaitMs = turnEnds.reduce((total, event) => {
    if (event.data?.reason?.error?.code !== 'TIMEOUT') return total;
    const match = event.data?.reason?.error?.message?.match(/timeout after (\d+)ms/i);
    return total + (match ? Number(match[1]) : 0);
  }, 0);
  const retryBackoffWaitMs = retries.reduce(
    (total, event) => total + (event.data?.delayMs ?? 0),
    0,
  );
  const turnStarts = events.filter((event) => event.type === 'turn/start');
  const disconnectWaitMs = turnEnds.reduce((total, turnEnd) => {
    if (turnEnd.data?.reason?.kind !== 'error') return total;
    const nextTurn = turnStarts.find(
      (turnStart) => turnStart.data?.turn > turnEnd.data?.turn && turnStart.time > turnEnd.time,
    );
    return total + (nextTurn ? nextTurn.time - turnEnd.time : 0);
  }, 0);
  const wallDurationMs = completedTurn?.time - firstUser?.time;
  const excludedWaitMs =
    retryTimeoutWaitMs + terminalTimeoutWaitMs + retryBackoffWaitMs + disconnectWaitMs;

  return {
    durationMs: Math.max(0, wallDurationMs - excludedWaitMs),
    wallDurationMs,
    excludedWaitMs,
    retryTimeoutWaitMs: retryTimeoutWaitMs + terminalTimeoutWaitMs,
    retryBackoffWaitMs,
    disconnectWaitMs,
    firstModelResponseCompletionMs:
      firstAssistant && firstUser ? firstAssistant.time - firstUser.time : null,
    timeToFirstTokenMs: null,
    ...usage,
    totalTokens: totalInputTokens + usage.outputTokens,
    loggedCostUsd: null,
    totalInputTokens,
    cacheHitRate: percentage(usage.cachedInputTokens, totalInputTokens),
    modelCalls: assistantMessages.length,
    toolCalls: toolCalls.length,
    toolNames: toolCalls.map((event) => event.data?.name),
    toolFailureCount,
    toolFailureRate: percentage(toolFailureCount, toolCalls.length),
    toolFailureCategories,
    oneShotCompleted: turnEnds[0]?.data?.reason?.kind === 'completed',
    completionMode: manualContinueCount ? `human-assisted (${manualContinueCount} continues)` : 'one-shot',
    manualContinueCount,
    streamTimeoutCount:
      streamTimeoutCount +
      turnEnds.filter((event) => event.data?.reason?.error?.code === 'TIMEOUT').length,
    llmRetryCount: retries.length,
    permissionChangeCount,
    startedAt: firstUser ? new Date(firstUser.time).toISOString() : null,
    completedAt: completedTurn ? new Date(completedTurn.time).toISOString() : null,
    finalStopReason: completedTurn ? 'completed' : turnEnds.at(-1)?.data?.reason?.kind ?? null,
    promptHash: createHash('sha256').update(promptText).digest('hex'),
    canonicalPromptHash: canonicalPromptHash(promptText),
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
    let normalizedPromptHash = null;
    try {
      const promptText = await readFile(promptPath, 'utf8');
      promptHash = createHash('sha256').update(promptText).digest('hex');
      normalizedPromptHash = canonicalPromptHash(promptText);
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
        canonicalPromptHash: normalizedPromptHash,
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

  const dshRoot = path.join(runsRoot, 'dsh');
  for (const caseDir of await directories(dshRoot)) {
    const caseName = path.basename(caseDir);
    const sessionFiles = (await readdir(caseDir))
      .filter((file) => file.endsWith('.jsonl'))
      .map((file) => path.join(caseDir, file));
    const outputFiles = (await readdir(caseDir))
      .filter((file) => file.endsWith('.html'))
      .map((file) => path.join(caseDir, file));
    if (sessionFiles.length !== 1 || outputFiles.length !== 1) continue;

    const events = parseJsonLines(await readFile(sessionFiles[0], 'utf8'));
    const outputHtml = await readFile(outputFiles[0], 'utf8');
    const outputStat = await stat(outputFiles[0]);
    const metrics = summarizeDsh(events);

    rows.push({
      case: caseName,
      batch: 'dsh',
      promptHash: metrics.promptHash,
      outputPath: path.relative(workspace, outputFiles[0]),
      sessionPath: path.relative(workspace, sessionFiles[0]),
      outputBytes: outputStat.size,
      outputLines: outputHtml.split('\n').length,
      ...parseCaseName(caseName),
      ...metrics,
      implementation: scanImplementation(outputHtml),
    });
  }

  rows.sort((a, b) => a.case.localeCompare(b.case));
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
}

await main();
