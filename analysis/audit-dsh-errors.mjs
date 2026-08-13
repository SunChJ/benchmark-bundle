#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  extractDshActionableFailures,
  summarizeDshActionableFailures,
} from './dsh-error-audit-lib.mjs';

const workspace = path.resolve(import.meta.dirname, '..');
const dshRoot = path.join(workspace, 'runs/dsh');

function parseJsonLines(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const caseDirectories = (await readdir(dshRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const events = [];
for (const caseName of caseDirectories) {
  const sessionPath = path.join(dshRoot, caseName, 'session.jsonl');
  const session = parseJsonLines(await readFile(sessionPath, 'utf8'));
  events.push(...extractDshActionableFailures(session, caseName));
}

const summary = summarizeDshActionableFailures(events);

console.log(JSON.stringify({ summary, events }, null, 2));
