#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [caseDirectoryArgument, outputName = 'index.html'] = process.argv.slice(2);

if (!caseDirectoryArgument) {
  throw new Error('usage: materialize-codex-html.mjs <case-directory> [output-name]');
}

const caseDirectory = path.resolve(caseDirectoryArgument);
const sessionsRoot = path.join(caseDirectory, '.benchmark-runtime/codex/sessions');

async function findJsonLines(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await findJsonLines(entryPath)));
    else if (entry.name.endsWith('.jsonl')) files.push(entryPath);
  }

  return files;
}

const sessionFiles = await findJsonLines(sessionsRoot);
if (sessionFiles.length !== 1) {
  throw new Error(`expected one Codex session, found ${sessionFiles.length}`);
}

const events = (await readFile(sessionFiles[0], 'utf8'))
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const taskComplete = events.findLast(
  (event) => event.type === 'event_msg' && event.payload?.type === 'task_complete',
);

let html = taskComplete?.payload?.last_agent_message?.trim();
if (!html) throw new Error('completed Codex response is missing');

const fencedMatch = html.match(/^```(?:html)?\s*\n([\s\S]*?)\n```$/i);
if (fencedMatch) html = fencedMatch[1].trim();
if (!/^<!doctype html>/i.test(html)) {
  throw new Error('completed Codex response is not a standalone HTML document');
}

await mkdir(caseDirectory, { recursive: true });
const outputPath = path.join(caseDirectory, outputName);
await writeFile(outputPath, `${html}\n`, 'utf8');
process.stdout.write(`${outputPath}\n`);
