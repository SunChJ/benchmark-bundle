# DeepSeek CLI Harness Benchmark

Run the same prompt through `pi` and `codex-ds` with the DeepSeek V4 Flash/Pro
models at `high` and `max` reasoning levels. Every invocation starts from an
empty workspace and writes auditable raw output plus execution metadata.

## Quick start

```bash
./benchmark doctor
./benchmark list
./benchmark run /absolute/path/to/prompt.md
```

The prompt can also be piped without creating a file first:

```bash
pbpaste | ./benchmark run -
```

Resume one captured session interactively:

```bash
./benchmark resume runs/<timestamp>/pi-flash-high
./benchmark resume runs/<timestamp>/codex-ds-pro-max
```

The canonical resume command is also printed after each case and stored in both
`manifest.json` and the case's `metadata.json`.

Run only selected cases:

```bash
./benchmark run prompt.md \
  --case pi-flash-high \
  --case codex-ds-flash-high
```

Comma-separated case names are also accepted. The default per-case timeout is
two hours; override it with `--timeout SECONDS`. Use `--output PATH` to change
the result root for one run. The default concurrency is two; use `--jobs 1` for
strictly sequential execution. Values above two are rejected.

`codex-ds` is currently a shell alias rather than an executable. The runner
therefore invokes `codex --profile deepseek` directly and explicitly overrides
the model and reasoning level for every case.

## Matrix

The ordered matrix lives in `benchmark.config.json`:

1. `pi-flash-high`
2. `pi-flash-max`
3. `pi-pro-high`
4. `pi-pro-max`
5. `codex-ds-flash-high`
6. `codex-ds-flash-max`
7. `codex-ds-pro-high`
8. `codex-ds-pro-max`

At most two cases run concurrently. This bounds API and machine pressure while
keeping an eight-case run practical.

## Output

Each command creates one timezone-qualified timestamp directory:

```text
runs/2026-08-13T16-30-00.123456+0800/
├── prompt.md
├── manifest.json
├── pi-flash-high/
│   ├── workspace/
│   └── result/
│       ├── events.jsonl
│       ├── final.md
│       ├── metadata.json
│       ├── session/
│       │   └── sessions/...
│       └── stderr.log
└── codex-ds-pro-max/
    ├── workspace/
    └── result/
        └── ...
```

- `workspace/` is the preserved snapshot of files created by the model.
- `events.jsonl` is the harness-native event stream.
- `final.md` is the final assistant message.
- `metadata.json` records the exact model, reasoning level, sanitized command,
  CLI version, prompt hash, token usage when exposed, duration, exit status,
  session ID, native resume arguments, and the canonical resume command.
- `session/sessions/` preserves only the harness's resumable session artifacts;
  credentials and the rest of the temporary CLI home are not copied.
- `manifest.json` summarizes case order and completion state for the whole run.

## Isolation contract

For every case the runner:

- creates a new, empty workspace under a random system temporary directory,
  then copies its final snapshot to the case's `workspace/` result directory;
- passes the prompt over stdin and does not place it in the workspace;
- creates disposable `HOME`, `TMPDIR`, and `XDG_*` directories;
- passes a small environment allowlist, excluding inherited API keys and other
  credentials;
- copies only the DeepSeek credential into pi's disposable home;
- disables pi extensions, skills, prompt templates, themes, context files,
  project trust, and startup network refreshes while saving a new isolated
  session;
- creates a minimal Codex home containing only the DeepSeek provider profile and
  model catalog, while using `--ignore-user-config` and `--ignore-rules`;
- copies the workspace and session artifacts back to the result directory,
  terminates remaining child processes, and only then deletes both temporary
  roots.

`./benchmark resume` reconstructs another minimal temporary home from the saved
session, opens the matching CLI in the preserved workspace, copies the updated
session back on exit, and deletes the resume-time temporary home. The installed
pi CLI's native form is `pi --session <file>`; Codex's native form is
`codex resume <session-id>`. The wrapper is canonical because it restores the
isolated authentication/profile state needed by both forms.

The Codex flags follow the official [`codex exec` command
reference](https://learn.chatgpt.com/docs/developer-commands#codex-exec).

This is context/configuration isolation, not a hostile-code containment boundary.
In particular, pi does not provide an OS-level filesystem sandbox. A prompt that
explicitly asks the agent to inspect an absolute path could still reach data
outside its temporary workspace; normal benchmark prompts receive no path or
discovered resource from this repository.

## Interpreting results

The comparison intentionally includes each harness's built-in system prompt and
tool implementation; those are part of the harness effect being measured. Keep
the prompt, model endpoint, machine, and verification procedure fixed.

One run is one sample. For conclusions about small differences, run the same
prompt several times in separate timestamp directories and compare both task
quality and token/time distributions. Two simultaneously running cases can still
share backend-load or local-resource noise; use `--jobs 1` when measuring latency
or cost rather than task quality.

## Development checks

```bash
python3 -m unittest discover -s tests -v
python3 -m py_compile benchmark_runner.py
```

The tests use fake harness executables and do not make model API calls.
