#!/usr/bin/env node

import { chromium } from '/Users/samsoncj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  throw new Error('Usage: export-report-pdf.mjs <report.html> <report.pdf>');
}

const input = path.resolve(inputArg);
const output = path.resolve(outputArg);
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});

try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(input).href, { waitUntil: 'networkidle' });
  await page.addStyleTag({
    content: `
      @media print {
        html,
        body,
        #data-analytics-portable-reader,
        #data-analytics-portable-reader * {
          --codex-font-sans: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif !important;
          --ds-font: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif !important;
          --ds-font-heading: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif !important;
          font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif !important;
        }
        [data-artifact-id="case_detail"] table,
        [data-artifact-id="quality_detail"] table {
          width: 100% !important;
          min-width: 0 !important;
          table-layout: fixed !important;
        }
        [data-artifact-id="case_detail"] th,
        [data-artifact-id="case_detail"] td,
        [data-artifact-id="quality_detail"] th,
        [data-artifact-id="quality_detail"] td {
          padding-right: 6px !important;
          overflow: visible !important;
          overflow-wrap: anywhere !important;
          white-space: normal !important;
          text-overflow: clip !important;
        }
        [data-artifact-id="case_detail"] th:nth-child(1) { width: 21%; }
        [data-artifact-id="case_detail"] th:nth-child(2) { width: 8%; }
        [data-artifact-id="case_detail"] th:nth-child(3) { width: 8%; }
        [data-artifact-id="case_detail"] th:nth-child(4) { width: 22%; }
        [data-artifact-id="case_detail"] th:nth-child(5) { width: 14%; }
        [data-artifact-id="case_detail"] th:nth-child(6) { width: 10%; }
        [data-artifact-id="case_detail"] th:nth-child(7) { width: 8%; }
        [data-artifact-id="case_detail"] th:nth-child(8) { width: 9%; }
        [data-artifact-id="quality_detail"] th:nth-child(1) { width: 24%; }
        [data-artifact-id="quality_detail"] th:nth-child(2) { width: 8%; }
        [data-artifact-id="quality_detail"] th:nth-child(3) { width: 10%; }
        [data-artifact-id="quality_detail"] th:nth-child(4) { width: 58%; }
      }
    `,
  });
  await page.pdf({
    path: output,
    format: 'Letter',
    printBackground: true,
    displayHeaderFooter: false,
  });
} finally {
  await browser.close();
}
