#!/bin/zsh
set -euo pipefail

SCRIPT_DIR=${0:A:h}
RUNS_ROOT=${BENCHMARK_RUNS_ROOT:-$SCRIPT_DIR/runs}
DEFAULT_PROMPT=${BENCHMARK_PROMPT_FILE:-$SCRIPT_DIR/prompts.md}

die() {
  print -u2 -r -- "error: $*"
  exit 2
}

usage() {
  print -u2 -r -- "usage: ./prepare.sh [path/to/prompt.md]"
  print -u2 -r -- "       pbpaste | ./prepare.sh -"
  exit 2
}

(( $# <= 1 )) || usage
prompt_argument=${1:-$DEFAULT_PROMPT}

if [[ $prompt_argument != '-' ]]; then
  prompt_source=${prompt_argument:A}
  [[ -f $prompt_source ]] || die "prompt not found: $prompt_source"
  command grep -q '[^[:space:]]' "$prompt_source" || die "prompt must not be empty"
fi

command mkdir -p "$RUNS_ROOT"
timestamp=$(command date +'%Y%m%d%H%M%S')
run_dir=$RUNS_ROOT/$timestamp
command mkdir "$run_dir" 2>/dev/null || die "run already exists: $run_dir"
run_dir=$(builtin cd "$run_dir" && pwd -P)

if [[ $prompt_argument == '-' ]]; then
  command tee "$run_dir/prompts.md" >/dev/null
else
  command cp "$prompt_source" "$run_dir/prompts.md"
fi
command grep -q '[^[:space:]]' "$run_dir/prompts.md" || die "prompt must not be empty"

current_run_tmp=$RUNS_ROOT/.current.$$
print -r -- "$run_dir" > "$current_run_tmp"
command mv "$current_run_tmp" "$RUNS_ROOT/.current"

if [[ ${RUNS_ROOT:A} == "$SCRIPT_DIR/runs" ]]; then
  run_display=runs/${run_dir:t}
else
  run_display=$run_dir
fi

print -r -- "Prepared: $run_display"
print -r -- ""
print -r -- "  ./run-case pi-flash-high"
print -r -- "  ./run-case pi-flash-max"
print -r -- "  ./run-case pi-pro-high"
print -r -- "  ./run-case pi-pro-max"
print -r -- "  ./run-case codex-ds-flash-high"
print -r -- "  ./run-case codex-ds-flash-max"
print -r -- "  ./run-case codex-ds-pro-high"
print -r -- "  ./run-case codex-ds-pro-max"
print -r -- "  ./run-case claude-ds-flash-high"
print -r -- "  ./run-case claude-ds-flash-max"
print -r -- "  ./run-case claude-ds-pro-high"
print -r -- "  ./run-case claude-ds-pro-max"
