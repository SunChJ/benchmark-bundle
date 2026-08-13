#!/bin/zsh
set -euo pipefail

ROOT=${0:A:h:h}
TEMP_ROOT=$(command mktemp -d "${TMPDIR:-/tmp}/benchmark-scripts-test.XXXXXX")
trap 'command rm -rf -- "$TEMP_ROOT"' EXIT

FAKE_HOME=$TEMP_ROOT/home
BIN_DIR=$TEMP_ROOT/bin
RUNS_ROOT=$TEMP_ROOT/runs
PI_OUTSIDE=/private/tmp/benchmark-sandbox-pi-$$
CODEX_OUTSIDE=/private/tmp/benchmark-sandbox-codex-$$
CLAUDE_OUTSIDE=/private/tmp/benchmark-sandbox-claude-$$
command mkdir -p "$FAKE_HOME/.pi/agent" "$FAKE_HOME/.codex" \
  "$FAKE_HOME/.claude" "$BIN_DIR"

print -r -- '{"deepseek":{"type":"api_key","key":"test"}}' > "$FAKE_HOME/.pi/agent/auth.json"
print -r -- '{"sentinel":"must-not-change"}' > "$FAKE_HOME/.pi/agent/settings.json"
print -r -- '{"models":[]}' > "$FAKE_HOME/.pi/agent/models.json"
print -r -- '{"models":[]}' > "$FAKE_HOME/.pi/agent/models-store.json"
pi_settings_sha=$(command shasum -a 256 "$FAKE_HOME/.pi/agent/settings.json" | command awk '{print $1}')
pi_auth_sha=$(command shasum -a 256 "$FAKE_HOME/.pi/agent/auth.json" | command awk '{print $1}')

print -r -- '
model_provider = "deepseek"
[model_providers.deepseek]
name = "DeepSeek"
base_url = "https://example.invalid"
wire_api = "responses"
experimental_bearer_token = "test"
' > "$FAKE_HOME/.codex/deepseek.config.toml"
print -r -- '{"models":[]}' > "$FAKE_HOME/.codex/models.json"
codex_profile_sha=$(command shasum -a 256 "$FAKE_HOME/.codex/deepseek.config.toml" | command awk '{print $1}')

print -r -- '{"sentinel":"must-not-change"}' > "$FAKE_HOME/.claude/settings.json"
claude_settings_sha=$(command shasum -a 256 "$FAKE_HOME/.claude/settings.json" | command awk '{print $1}')

print -r -- '#!/bin/zsh
set -euo pipefail
if [[ "$*" == "auth print-api-key --provider deepseek" ]]; then
  print -r -- "test-deepseek-key"
  exit 0
fi
print -r -- "$PWD" > pi-cwd.txt
print -r -- "$HOME" > pi-home.txt
print -r -- "$PI_CODING_AGENT_DIR" > pi-runtime.txt
print -r -- "$TMPDIR" > pi-tmp.txt
print -rl -- "$@" > pi-args.txt
if command mkdir "__PI_OUTSIDE__" 2>/dev/null; then
  print -u2 -r -- "outside write unexpectedly succeeded"
  exit 80
fi
' > "$BIN_DIR/pi"
command sed -i '' "s|__PI_OUTSIDE__|$PI_OUTSIDE|" "$BIN_DIR/pi"

print -r -- '#!/bin/zsh
set -euo pipefail
if [[ "$*" == "--profile deepseek mcp list --json" ]]; then
  print -r -- '\''[
    {"name":"node_repl","enabled":true},
    {"name":"docs-server","enabled":true}
  ]'\''
  exit 0
fi
print -r -- "$PWD" > codex-cwd.txt
print -r -- "$HOME" > codex-home.txt
print -r -- "$CODEX_HOME" > codex-runtime.txt
print -r -- "$TMPDIR" > codex-tmp.txt
print -rl -- "$@" > codex-args.txt
print -r -- "# case-local write" >> "$CODEX_HOME/deepseek.config.toml"
if command mkdir "__CODEX_OUTSIDE__" 2>/dev/null; then
  print -u2 -r -- "outside write unexpectedly succeeded"
  exit 81
fi
' > "$BIN_DIR/codex"
command sed -i '' "s|__CODEX_OUTSIDE__|$CODEX_OUTSIDE|" "$BIN_DIR/codex"

print -r -- '#!/bin/zsh
set -euo pipefail
print -r -- "$PWD" > claude-cwd.txt
print -r -- "$HOME" > claude-home.txt
print -r -- "$CLAUDE_CONFIG_DIR" > claude-runtime.txt
print -r -- "$TMPDIR" > claude-tmp.txt
print -r -- "$ANTHROPIC_BASE_URL" > claude-base-url.txt
print -r -- "$ANTHROPIC_MODEL" > claude-model.txt
print -r -- "$CLAUDE_CODE_EFFORT_LEVEL" > claude-effort.txt
[[ "$ANTHROPIC_AUTH_TOKEN" == "test-deepseek-key" ]]
[[ "$CLAUDE_CODE_SUBPROCESS_ENV_SCRUB" == "1" ]]
[[ "$ENABLE_CLAUDEAI_MCP_SERVERS" == "false" ]]
print -rl -- "$@" > claude-args.txt
if command mkdir "__CLAUDE_OUTSIDE__" 2>/dev/null; then
  print -u2 -r -- "outside write unexpectedly succeeded"
  exit 82
fi
' > "$BIN_DIR/claude"
command sed -i '' "s|__CLAUDE_OUTSIDE__|$CLAUDE_OUTSIDE|" "$BIN_DIR/claude"
command chmod +x "$BIN_DIR/pi" "$BIN_DIR/codex" "$BIN_DIR/claude"

prompt=$TEMP_ROOT/prompt.md
print -r -- "Create the requested artifact." > "$prompt"

common_environment=(
  "HOME=$FAKE_HOME"
  "PATH=$BIN_DIR:$PATH"
  "BENCHMARK_RUNS_ROOT=$RUNS_ROOT"
  "BENCHMARK_PROMPT_FILE=$prompt"
  "PI_BINARY=$BIN_DIR/pi"
  "CODEX_BINARY=$BIN_DIR/codex"
  "CLAUDE_BINARY=$BIN_DIR/claude"
  "PI_AUTH_FILE=$FAKE_HOME/.pi/agent/auth.json"
  "CODEX_PROFILE_FILE=$FAKE_HOME/.codex/deepseek.config.toml"
  "CODEX_MODEL_CATALOG=$FAKE_HOME/.codex/models.json"
)

prepared=$(command env $common_environment "$ROOT/prepare.sh")
run_dir=$(<"$RUNS_ROOT/.current")
[[ ${run_dir:t} == <-> && ${#${run_dir:t}} == 14 ]]
[[ -f $run_dir/prompts.md ]]
[[ $(<"$run_dir/prompts.md") == "Create the requested artifact." ]]
print -r -- "$prepared" | command grep -Fq './run-case codex-ds-pro-max'
print -r -- "$prepared" | command grep -Fq './run-case claude-ds-pro-max'

pi_output=$(command env $common_environment "$ROOT/run-case" pi-flash-high)
pi_case_dir=$run_dir/pi-flash-high
[[ -d $pi_case_dir ]]
[[ -z $(command ls -A "$pi_case_dir") ]]
print -r -- "$pi_output" | command grep -Fq "Prepared: $pi_case_dir"
print -r -- "$pi_output" | command grep -Fq "Prompt:   $run_dir/prompts.md"
print -r -- "$pi_output" | command grep -Fq "cd $pi_case_dir && $ROOT/run-sandboxed-case pi"
! print -r -- "$pi_output" | command grep -Fq -- '--offline'
! print -r -- "$pi_output" | command grep -Fq -- 'Ghostty'
! print -r -- "$pi_output" | command grep -Fq -- 'Create the requested artifact.'

# An untouched case can be printed repeatedly.
command env $common_environment "$ROOT/run-case" pi-flash-high >/dev/null

pi_command=$(print -r -- "$pi_output" | command sed -n '/^Run this command:$/ { n; p; }')
command env $common_environment /bin/zsh -c "$pi_command"

[[ $(<"$pi_case_dir/pi-cwd.txt") == "$pi_case_dir" ]]
[[ $(<"$pi_case_dir/pi-home.txt") == "$FAKE_HOME" ]]
[[ $(<"$pi_case_dir/pi-runtime.txt") == "$pi_case_dir/.benchmark-runtime/pi" ]]
[[ $(<"$pi_case_dir/pi-tmp.txt") == "$pi_case_dir/.benchmark-runtime/tmp/" ]]
[[ ! -e $PI_OUTSIDE ]]
[[ $(command shasum -a 256 "$FAKE_HOME/.pi/agent/settings.json" | command awk '{print $1}') == "$pi_settings_sha" ]]
[[ $(command shasum -a 256 "$FAKE_HOME/.pi/agent/auth.json" | command awk '{print $1}') == "$pi_auth_sha" ]]
[[ ! -e $pi_case_dir/.benchmark-runtime/pi/auth.json ]]
pi_args=$pi_case_dir/pi-args.txt
for expected in \
  '--provider' 'deepseek' \
  '--model' 'deepseek-v4-flash' \
  '--thinking' 'high' \
  '--no-extensions' \
  '--no-skills' \
  '--no-prompt-templates' \
  '--no-themes' \
  '--no-context-files' \
  '--no-approve' \
  '--tui-mode' 'regular'; do
  command grep -Fxq -- "$expected" "$pi_args"
done
! command grep -Fxq -- '--offline' "$pi_args"

codex_output=$(command env $common_environment "$ROOT/run-case" codex-ds-pro-max)
codex_case_dir=$run_dir/codex-ds-pro-max
[[ -d $codex_case_dir ]]
[[ -z $(command ls -A "$codex_case_dir") ]]
print -r -- "$codex_output" | command grep -Fq "cd $codex_case_dir && $ROOT/run-sandboxed-case codex"
! print -r -- "$codex_output" | command grep -Fq -- 'Ghostty'
! print -r -- "$codex_output" | command grep -Fq -- 'Create the requested artifact.'

codex_command=$(print -r -- "$codex_output" | command sed -n '/^Run this command:$/ { n; p; }')
command env $common_environment /bin/zsh -c "$codex_command"

[[ $(<"$codex_case_dir/codex-cwd.txt") == "$codex_case_dir" ]]
[[ $(<"$codex_case_dir/codex-home.txt") == "$FAKE_HOME" ]]
[[ $(<"$codex_case_dir/codex-runtime.txt") == "$codex_case_dir/.benchmark-runtime/codex" ]]
[[ $(<"$codex_case_dir/codex-tmp.txt") == "$codex_case_dir/.benchmark-runtime/tmp/" ]]
[[ ! -e $CODEX_OUTSIDE ]]
[[ -f $codex_case_dir/.benchmark-runtime/codex/deepseek.config.toml ]]
[[ ! -L $codex_case_dir/.benchmark-runtime/codex/deepseek.config.toml ]]
[[ -f $codex_case_dir/.benchmark-runtime/codex/config.toml ]]
command grep -Fxq -- "[projects.\"$codex_case_dir\"]" \
  "$codex_case_dir/.benchmark-runtime/codex/config.toml"
command grep -Fxq -- 'trust_level = "trusted"' \
  "$codex_case_dir/.benchmark-runtime/codex/config.toml"
[[ $(command shasum -a 256 "$FAKE_HOME/.codex/deepseek.config.toml" | command awk '{print $1}') == "$codex_profile_sha" ]]
codex_args=$codex_case_dir/codex-args.txt
for expected in \
  '--profile' 'deepseek' \
  '--model' 'deepseek-v4-pro' \
  'model_reasoning_effort="max"' \
  'project_doc_max_bytes=0' \
  'project_doc_fallback_filenames=[]' \
  'agents.enabled=false' \
  'features.plugins=false' \
  'features.skill_search=false' \
  'features.multi_agent=false' \
  'features.workspace_dependencies=false' \
  'features.computer_use=false' \
  'tools.web_search=false' \
  '--dangerously-bypass-approvals-and-sandbox' \
  '--no-alt-screen'; do
  command grep -Fxq -- "$expected" "$codex_args"
done
command grep -Fxq -- "projects.\"$codex_case_dir\".trust_level=\"trusted\"" "$codex_args"
! command grep -Fq -- 'mcp_servers.' "$codex_args"

claude_output=$(command env $common_environment "$ROOT/run-case" claude-ds-pro-max)
claude_case_dir=$run_dir/claude-ds-pro-max
[[ -d $claude_case_dir ]]
[[ -z $(command ls -A "$claude_case_dir") ]]
print -r -- "$claude_output" | command grep -Fq \
  "cd $claude_case_dir && $ROOT/run-sandboxed-case claude"
! print -r -- "$claude_output" | command grep -Fq -- 'Ghostty'
! print -r -- "$claude_output" | command grep -Fq -- 'Create the requested artifact.'

claude_command=$(print -r -- "$claude_output" | command sed -n '/^Run this command:$/ { n; p; }')
command env $common_environment /bin/zsh -c "$claude_command"

[[ $(<"$claude_case_dir/claude-cwd.txt") == "$claude_case_dir" ]]
[[ $(<"$claude_case_dir/claude-home.txt") == "$FAKE_HOME" ]]
[[ $(<"$claude_case_dir/claude-runtime.txt") == "$claude_case_dir/.benchmark-runtime/claude" ]]
[[ $(<"$claude_case_dir/claude-tmp.txt") == "$claude_case_dir/.benchmark-runtime/tmp/" ]]
[[ $(<"$claude_case_dir/claude-base-url.txt") == "https://api.deepseek.com/anthropic" ]]
[[ $(<"$claude_case_dir/claude-model.txt") == 'deepseek-v4-pro[1m]' ]]
[[ $(<"$claude_case_dir/claude-effort.txt") == "max" ]]
[[ ! -e $CLAUDE_OUTSIDE ]]
[[ -f $claude_case_dir/.benchmark-runtime/claude/empty-mcp.json ]]
[[ $(<"$claude_case_dir/.benchmark-runtime/claude/empty-mcp.json") == '{"mcpServers":{}}' ]]
[[ $(command shasum -a 256 "$FAKE_HOME/.claude/settings.json" | command awk '{print $1}') == "$claude_settings_sha" ]]
claude_args=$claude_case_dir/claude-args.txt
for expected in \
  '--model' 'deepseek-v4-pro[1m]' \
  '--effort' 'max' \
  '--bare' \
  '--strict-mcp-config' \
  '--disable-slash-commands' \
  '--no-chrome' \
  '--dangerously-skip-permissions'; do
  command grep -Fxq -- "$expected" "$claude_args"
done
command grep -Fxq -- "$claude_case_dir/.benchmark-runtime/claude/empty-mcp.json" \
  "$claude_args"

# Commands printed before the MCP fix remain runnable; trailing host MCP names
# are ignored instead of becoming incomplete case-local MCP definitions.
command env $common_environment "$ROOT/run-sandboxed-case" \
  codex "$codex_case_dir" "$BIN_DIR/codex" deepseek-v4-pro max \
  "$FAKE_HOME/.codex/deepseek.config.toml" "$FAKE_HOME/.codex/models.json" \
  computer-use node_repl openaiDeveloperDocs
! command grep -Fq -- 'mcp_servers.' "$codex_args"

if command env $common_environment "$ROOT/run-case" pi-flash-high >/dev/null 2>&1; then
  print -u2 -r -- "non-empty case unexpectedly succeeded"
  exit 1
fi

if command env $common_environment "$ROOT/run-case" unknown >/dev/null 2>&1; then
  print -u2 -r -- "unknown case unexpectedly succeeded"
  exit 1
fi

print -r -- "All shell benchmark tests passed."
