# DeepSeek CLI Harness Benchmark

This repository prepares reproducible case directories and prints interactive
CLI commands. It does not launch a terminal, submit the prompt, monitor the
process, or collect result metadata.

Install the harnesses you want to compare. Claude Code can be installed with
`npm install -g @anthropic-ai/claude-code`; Claude cases also use the existing
Pi DeepSeek credential through Pi's credential helper.

## Run

Paste the benchmark prompt into `prompts.md`, then prepare a timestamped run:

```bash
./prepare.sh
```

This creates `runs/YYYYMMDDHHMMSS/prompts.md` and records that directory as the
current run. Generate a command for one case:

```bash
./run-case pi-flash-high
```

`run-case` creates an empty `runs/YYYYMMDDHHMMSS/<case>/` directory and prints
one shell command. Copy that command into any terminal. When the interactive
CLI is ready, paste the contents of the displayed `prompts.md` path manually.
The command keeps the normal user `HOME` but confines all filesystem writes to
the case directory with macOS Seatbelt.

Repeat `run-case` while its case directory is empty to print the same command
again. Once the directory contains output, prepare a new timestamped run rather
than reusing the sample.

An explicit prompt file or stdin can also be used:

```bash
./prepare.sh /absolute/path/to/prompt.md
pbpaste | ./prepare.sh -
```

## Cases

- `pi-flash-high`
- `pi-flash-max`
- `pi-pro-high`
- `pi-pro-max`
- `codex-ds-flash-high`
- `codex-ds-flash-max`
- `codex-ds-pro-high`
- `codex-ds-pro-max`
- `claude-ds-flash-high`
- `claude-ds-flash-max`
- `claude-ds-pro-high`
- `claude-ds-pro-max`

## Launch configuration

Commands use the normal user `HOME`, so Keychain and normal shell behavior are
unchanged. Harness state is redirected to
`<case>/.benchmark-runtime/{pi,codex,claude}`, and `TMPDIR`, `TMP`, `TEMP`, XDG cache,
npm, pip, uv, and Playwright paths are redirected below
`<case>/.benchmark-runtime/`. There is no benchmark-specific system or
developer prompt.

Pi explicitly disables extensions, skills, prompt templates, themes, context
files, and project-local approval resources. Its credential is resolved once
through Pi's own auth command before launch and passed only to the sandboxed
process; settings, model caches, and sessions remain case-local. The host's
`~/.pi/agent/settings.json` and `auth.json` are never writable.
Codex uses the existing `deepseek` profile through a case-local `CODEX_HOME`,
overrides model and reasoning effort on the command line, disables project
instruction ingestion and optional integrations, and does not load the host
`config.toml` or its MCP server definitions. Its profile is copied into the
case instead of symlinked, so TUI persistence cannot reach the host profile.
The detected Git root is pre-marked trusted only in the disposable base config
to skip the startup trust prompt; the outer Seatbelt still prevents writes
outside the case. No incomplete MCP overrides are generated in the clean
runtime.

Claude Code uses DeepSeek's Anthropic-compatible endpoint and a case-local
`CLAUDE_CONFIG_DIR`. It launches with `--bare`, an explicit empty MCP config,
slash skills disabled, Chrome disabled, and nonessential network traffic
disabled. The selected DeepSeek model and effort are set in both the documented
environment variables and CLI flags. The API token is resolved through Pi's
credential helper before launch and scrubbed from Claude's tool subprocesses.
The environment follows DeepSeek's
[Claude Code integration guide](https://api-docs.deepseek.com/zh-cn/quick_start/agent_integrations/claude_code/),
while isolation flags follow the current
[Claude Code CLI reference](https://code.claude.com/docs/en/cli-usage).

All three harnesses run in YOLO mode. Pi's built-in tools execute directly;
Codex uses `--dangerously-bypass-approvals-and-sandbox`, and Claude Code uses
`--dangerously-skip-permissions`. An outer macOS Seatbelt profile remains active
for the entire process tree and rejects every resolved filesystem write outside
the case directory. Absolute paths such as `/tmp/three-test` therefore fail
with `Operation not permitted`.

Reads, networking, and process execution remain available. This is a write
boundary, not complete containment: the process can still read files available
to the current macOS user and contact the network. The Seatbelt profile depends
on macOS's deprecated `sandbox-exec`; the launcher fails closed when it is not
available.

## Development checks

```bash
zsh -n prepare.sh run-case run-sandboxed-case tests/test_scripts.sh
./tests/test_scripts.sh
```

The tests use fake harness executables, verify case-local runtime/temp paths,
and confirm that writes to `/private/tmp` are denied. They make no model API
calls.
