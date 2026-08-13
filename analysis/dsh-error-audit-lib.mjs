function resultText(item) {
  return (item.content ?? [])
    .filter((content) => content.type === 'text')
    .map((content) => content.text)
    .join('\n');
}

function classifyDeclaredFailure(text) {
  if (/does not declare image input/i.test(text)) return 'image capability mismatch';
  if (/file changed since it was read/i.test(text)) return 'stale file revision';
  if (/regex parse error|look-around.*not supported/is.test(text)) return 'unsupported regex feature';
  return 'other declared tool failure';
}

function classifyExecutionFailure(text) {
  if (/\[exit code:\s*[1-9]\d*\]/i.test(text)) return 'non-zero command exit';
  if (/(?:^|\n)(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|Error):\s/m.test(text)) {
    return 'runtime exception without failure flag';
  }
  return null;
}

export function extractDshActionableFailures(events, caseName = null) {
  const callNames = new Map(
    events
      .filter((event) => event.type === 'tool/call')
      .map((event) => [event.data?.callId, event.data?.name]),
  );
  const failures = [];

  for (const event of events.filter((candidate) => candidate.type === 'tool/result')) {
    for (const item of event.data?.message?.content ?? []) {
      if (item.type !== 'tool-result') continue;
      const text = resultText(item);
      const declared = item.isError === true;
      const executionClass = declared ? null : classifyExecutionFailure(text);
      if (!declared && !executionClass) continue;
      failures.push({
        case: caseName,
        call_id: item.toolCallId,
        tool: callNames.get(item.toolCallId) ?? 'unknown',
        failure_surface: declared ? 'harness-declared tool failure' : 'command/runtime failure',
        error_class: declared ? classifyDeclaredFailure(text) : executionClass,
        is_error_flag: declared,
        excerpt: text.replace(/\s+/g, ' ').trim().slice(0, 240),
      });
    }
  }

  return failures;
}

export function summarizeDshActionableFailures(failures) {
  const countBy = (field) =>
    Object.fromEntries(
      [...new Set(failures.map((failure) => failure[field]))]
        .sort()
        .map((value) => [value, failures.filter((failure) => failure[field] === value).length]),
    );

  return {
    total_actionable_failures: failures.length,
    unique_failed_tool_calls: new Set(failures.map((failure) => failure.call_id)).size,
    by_surface: countBy('failure_surface'),
    by_class: countBy('error_class'),
    by_case: countBy('case'),
  };
}
