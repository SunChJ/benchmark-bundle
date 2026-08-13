#!/usr/bin/env python3
"""Run isolated DeepSeek harness/reasoning benchmark cases."""

from __future__ import annotations

import argparse
import concurrent.futures
import dataclasses
import datetime as dt
import hashlib
import json
import os
import platform
import re
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


CONFIG_SCHEMA_VERSION = 1
DEFAULT_CONFIG = Path(__file__).with_name("benchmark.config.json")
MAX_CONCURRENCY = 2
_ACTIVE_PROCESSES: set = set()
_ACTIVE_PROCESSES_LOCK = threading.Lock()


class ConfigurationError(ValueError):
    pass


class SetupError(RuntimeError):
    pass


@dataclasses.dataclass(frozen=True)
class Case:
    name: str
    harness: str
    model_tier: str
    model_id: str
    reasoning: str
    harness_config: Dict[str, Any]


def load_config(path: Path) -> Dict[str, Any]:
    path = path.expanduser().resolve()
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ConfigurationError(f"Config not found: {path}") from error
    except json.JSONDecodeError as error:
        raise ConfigurationError(f"Invalid JSON in {path}: {error}") from error

    if config.get("schema_version") != CONFIG_SCHEMA_VERSION:
        raise ConfigurationError(
            f"Unsupported schema_version: {config.get('schema_version')!r}"
        )
    if not isinstance(config.get("harnesses"), dict):
        raise ConfigurationError("Config must contain a harnesses object")
    if not isinstance(config.get("matrix"), list) or not config["matrix"]:
        raise ConfigurationError("Config must contain a non-empty matrix array")
    return config


def build_cases(config: Dict[str, Any]) -> List[Case]:
    cases: List[Case] = []
    names = set()
    for index, entry in enumerate(config["matrix"]):
        try:
            harness = entry["harness"]
            model_tier = entry["model"]
            reasoning = entry["reasoning"]
            harness_config = config["harnesses"][harness]
            model_id = harness_config["models"][model_tier]
        except (KeyError, TypeError) as error:
            raise ConfigurationError(f"Invalid matrix entry at index {index}") from error

        if harness not in ("pi", "codex-ds"):
            raise ConfigurationError(f"Unsupported harness: {harness}")
        if reasoning not in ("high", "max"):
            raise ConfigurationError(f"Unsupported reasoning level: {reasoning}")
        name = f"{harness}-{model_tier}-{reasoning}"
        if name in names:
            raise ConfigurationError(f"Duplicate case: {name}")
        names.add(name)
        cases.append(
            Case(
                name=name,
                harness=harness,
                model_tier=model_tier,
                model_id=model_id,
                reasoning=reasoning,
                harness_config=harness_config,
            )
        )
    return cases


def build_command(
    case: Case,
    binary: str,
    workspace: Path,
    result_dir: Path,
    prompt: str,
) -> List[str]:
    del prompt  # Both harnesses receive the exact prompt over stdin.
    if case.harness == "pi":
        return [
            binary,
            "--provider",
            "deepseek",
            "--model",
            case.model_id,
            "--thinking",
            case.reasoning,
            "--mode",
            "json",
            "--no-extensions",
            "--no-skills",
            "--no-prompt-templates",
            "--no-themes",
            "--no-context-files",
            "--no-approve",
            "--offline",
        ]

    if case.harness == "codex-ds":
        profile = case.harness_config.get("profile", "deepseek")
        return [
            binary,
            "--profile",
            profile,
            "--model",
            case.model_id,
            "-c",
            f'model_reasoning_effort="{case.reasoning}"',
            "exec",
            "--skip-git-repo-check",
            "--ignore-user-config",
            "--ignore-rules",
            "--color",
            "never",
            "--json",
            "--sandbox",
            "workspace-write",
            "--ask-for-approval",
            "never",
            "-C",
            str(workspace),
            "--output-last-message",
            str(result_dir / "final.md"),
            "-",
        ]

    raise ConfigurationError(f"Unsupported harness: {case.harness}")


def _resolve_file(value: str, config_dir: Path) -> Path:
    expanded = Path(os.path.expandvars(os.path.expanduser(value)))
    if not expanded.is_absolute():
        expanded = config_dir / expanded
    return expanded.resolve()


def _resolve_binary(value: str, config_dir: Path) -> Optional[str]:
    expanded = os.path.expandvars(os.path.expanduser(value))
    if os.sep in expanded:
        candidate = Path(expanded)
        if not candidate.is_absolute():
            candidate = config_dir / candidate
        candidate = candidate.resolve()
        return str(candidate) if candidate.is_file() and os.access(candidate, os.X_OK) else None
    return shutil.which(expanded)


def _write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _now() -> dt.datetime:
    return dt.datetime.now().astimezone()


def _timestamp_directory_name(now: Optional[dt.datetime] = None) -> str:
    value = now or _now()
    return value.strftime("%Y-%m-%dT%H-%M-%S.%f%z")


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _select_cases(cases: Sequence[Case], selected: Optional[Sequence[str]]) -> List[Case]:
    if not selected:
        return list(cases)
    requested = set(selected)
    known = {case.name for case in cases}
    unknown = requested - known
    if unknown:
        raise ConfigurationError(f"Unknown case(s): {', '.join(sorted(unknown))}")
    return [case for case in cases if case.name in requested]


def _command_version(binary: str) -> str:
    try:
        result = subprocess.run(
            [binary, "--version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return f"unavailable ({error})"
    first_line = result.stdout.strip().splitlines()
    return first_line[0] if first_line else f"unknown (exit {result.returncode})"


def _prepare_pi_home(case: Case, runtime_home: Path, config_dir: Path) -> Dict[str, str]:
    runtime_home.mkdir(mode=0o700)
    auth_value = case.harness_config.get("auth_file")
    if not auth_value:
        raise SetupError("pi.auth_file is required for an isolated run")
    auth_source = _resolve_file(auth_value, config_dir)
    if not auth_source.is_file():
        raise SetupError(f"pi auth file not found: {auth_source}")
    auth_target = runtime_home / "auth.json"
    try:
        source_auth = json.loads(auth_source.read_text(encoding="utf-8"))
        deepseek_auth = source_auth["deepseek"]
    except (json.JSONDecodeError, KeyError, TypeError) as error:
        raise SetupError(f"pi auth file has no valid deepseek credential: {auth_source}") from error
    auth_target.write_text(
        json.dumps({"deepseek": deepseek_auth}, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    auth_target.chmod(0o600)
    return {
        "PI_CODING_AGENT_DIR": str(runtime_home),
        "PI_CODING_AGENT_SESSION_DIR": str(runtime_home / "sessions"),
        "PI_OFFLINE": "1",
        "PI_TELEMETRY": "0",
    }


def _minimal_codex_profile(profile: str, catalog_target: Path) -> str:
    provider_match = re.search(r'(?m)^model_provider\s*=\s*("[^"\n]+")\s*$', profile)
    if not provider_match:
        raise SetupError("Codex profile has no top-level model_provider")
    provider_literal = provider_match.group(1)
    provider_name = json.loads(provider_literal)
    section_pattern = re.compile(
        rf"(?ms)^\[model_providers\.{re.escape(provider_name)}\]\s*\n(.*?)(?=^\[|\Z)"
    )
    section_match = section_pattern.search(profile)
    if not section_match:
        raise SetupError(f"Codex profile has no model_providers.{provider_name} section")
    section_body = section_match.group(1).rstrip()
    return (
        f"model_provider = {provider_literal}\n"
        f"model_catalog_json = {json.dumps(str(catalog_target))}\n\n"
        f"[model_providers.{provider_name}]\n"
        f"{section_body}\n"
    )


def _prepare_codex_home(case: Case, runtime_home: Path, config_dir: Path) -> Dict[str, str]:
    runtime_home.mkdir(mode=0o700)
    profile_value = case.harness_config.get("profile_file")
    catalog_value = case.harness_config.get("model_catalog")
    if not profile_value or not catalog_value:
        raise SetupError("codex-ds.profile_file and model_catalog are required")

    profile_source = _resolve_file(profile_value, config_dir)
    catalog_source = _resolve_file(catalog_value, config_dir)
    if not profile_source.is_file():
        raise SetupError(f"Codex profile not found: {profile_source}")
    if not catalog_source.is_file():
        raise SetupError(f"Codex model catalog not found: {catalog_source}")

    catalog_target = runtime_home / "models.json"
    shutil.copyfile(str(catalog_source), str(catalog_target))
    catalog_target.chmod(0o600)

    profile_name = case.harness_config.get("profile", "deepseek")
    profile_target = runtime_home / f"{profile_name}.config.toml"
    profile = profile_source.read_text(encoding="utf-8")
    profile_target.write_text(
        _minimal_codex_profile(profile, catalog_target), encoding="utf-8"
    )
    profile_target.chmod(0o600)
    return {"CODEX_HOME": str(runtime_home)}


def _clean_environment(workspace: Path, runtime_home: Path) -> Dict[str, str]:
    inherited_keys = ("PATH", "SHELL", "LANG", "LC_ALL", "LC_CTYPE", "USER", "LOGNAME")
    environment = {key: os.environ[key] for key in inherited_keys if key in os.environ}
    temp_dir = runtime_home / "tmp"
    xdg_config = runtime_home / ".config"
    xdg_cache = runtime_home / ".cache"
    xdg_data = runtime_home / ".local" / "share"
    for directory in (temp_dir, xdg_config, xdg_cache, xdg_data):
        directory.mkdir(parents=True, exist_ok=True)
    environment.update(
        {
            "HOME": str(runtime_home),
            "TMPDIR": str(temp_dir),
            "XDG_CONFIG_HOME": str(xdg_config),
            "XDG_CACHE_HOME": str(xdg_cache),
            "XDG_DATA_HOME": str(xdg_data),
            "PWD": str(workspace),
            "TERM": "dumb",
            "NO_COLOR": "1",
            "CI": "1",
            "GIT_CONFIG_GLOBAL": "/dev/null",
            "GIT_CONFIG_NOSYSTEM": "1",
        }
    )
    return environment


def _extract_text_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts = []
    for item in content:
        if isinstance(item, dict) and item.get("type") in ("text", "output_text"):
            text = item.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "\n".join(parts)


def _extract_final_from_events(events_path: Path) -> str:
    final = ""
    try:
        lines = events_path.read_text(encoding="utf-8", errors="replace").splitlines()
    except FileNotFoundError:
        return final
    for line in lines:
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "message_end":
            message = event.get("message", {})
            if message.get("role") == "assistant":
                text = _extract_text_content(message.get("content"))
                if text:
                    final = text
        elif event.get("type") == "item.completed":
            item = event.get("item", {})
            if item.get("type") == "agent_message" and isinstance(item.get("text"), str):
                final = item["text"]
    return final


def _extract_usage_from_events(events_path: Path) -> Optional[Dict[str, Any]]:
    usage: Optional[Dict[str, Any]] = None
    try:
        lines = events_path.read_text(encoding="utf-8", errors="replace").splitlines()
    except FileNotFoundError:
        return None
    for line in lines:
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "turn.completed" and isinstance(event.get("usage"), dict):
            usage = event["usage"]
        elif event.get("type") == "message_end":
            message = event.get("message", {})
            if message.get("role") == "assistant" and isinstance(message.get("usage"), dict):
                usage = message["usage"]
    return usage


def _extract_session_id_from_events(events_path: Path) -> Optional[str]:
    try:
        lines = events_path.read_text(encoding="utf-8", errors="replace").splitlines()
    except FileNotFoundError:
        return None
    for line in lines:
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "session" and isinstance(event.get("id"), str):
            return event["id"]
        if event.get("type") == "thread.started" and isinstance(
            event.get("thread_id"), str
        ):
            return event["thread_id"]
    return None


def _session_id_from_file(path: Path) -> Optional[str]:
    try:
        with path.open(encoding="utf-8", errors="replace") as stream:
            for _ in range(5):
                line = stream.readline()
                if not line:
                    break
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event.get("type") == "session" and isinstance(event.get("id"), str):
                    return event["id"]
                if event.get("type") == "session_meta":
                    payload = event.get("payload", {})
                    if isinstance(payload.get("id"), str):
                        return payload["id"]
    except OSError:
        return None
    return None


def _archive_sessions(
    runtime_home: Path,
    result_dir: Path,
    session_id: Optional[str],
) -> Tuple[Optional[str], Optional[str]]:
    source = runtime_home / "sessions"
    if not source.is_dir():
        return session_id, None
    archive = result_dir / "session" / "sessions"
    shutil.copytree(str(source), str(archive), symlinks=True)
    files = sorted(archive.rglob("*.jsonl"))
    selected_file: Optional[Path] = None
    if session_id:
        selected_file = next((path for path in files if session_id in path.name), None)
    for path in files:
        file_session_id = _session_id_from_file(path)
        if session_id is None and file_session_id:
            session_id = file_session_id
            selected_file = path
            break
        if session_id == file_session_id:
            selected_file = path
            break
    relative_file = (
        str(selected_file.relative_to(result_dir)) if selected_file is not None else None
    )
    return session_id, relative_file


def _register_process(process: subprocess.Popen) -> None:
    with _ACTIVE_PROCESSES_LOCK:
        _ACTIVE_PROCESSES.add(process)


def _unregister_process(process: subprocess.Popen) -> None:
    with _ACTIVE_PROCESSES_LOCK:
        _ACTIVE_PROCESSES.discard(process)


def _terminate_all_active_processes() -> None:
    with _ACTIVE_PROCESSES_LOCK:
        processes = list(_ACTIVE_PROCESSES)
    for process in processes:
        _terminate_process_group(process)


def _terminate_process_group(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=3)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        try:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=3)
        except ProcessLookupError:
            pass


def _terminate_remaining_children(process_group_id: int) -> None:
    try:
        os.killpg(process_group_id, 0)
    except ProcessLookupError:
        return
    try:
        os.killpg(process_group_id, signal.SIGTERM)
    except ProcessLookupError:
        pass


def _run_case(
    case: Case,
    config_path: Path,
    config_dir: Path,
    run_dir: Path,
    prompt: str,
    prompt_sha256: str,
    timeout_seconds: int,
) -> Dict[str, Any]:
    case_dir = run_dir / case.name
    workspace = case_dir / "workspace"
    result_dir = case_dir / "result"
    result_dir.mkdir(parents=True)

    binary = _resolve_binary(case.harness_config["binary"], config_dir)
    started = _now()
    metadata: Dict[str, Any] = {
        "case": case.name,
        "harness": case.harness,
        "model_tier": case.model_tier,
        "model_id": case.model_id,
        "reasoning": case.reasoning,
        "prompt_sha256": prompt_sha256,
        "started_at": started.isoformat(),
        "timeout_seconds": timeout_seconds,
        "status": "setting_up",
    }
    _write_json(result_dir / "metadata.json", metadata)

    if not binary:
        metadata.update(
            status="setup_failed",
            error=f"Executable not found: {case.harness_config['binary']}",
            exit_code=None,
        )
        _write_json(result_dir / "metadata.json", metadata)
        return metadata

    with tempfile.TemporaryDirectory(
        prefix=f"dsbench-home-{case.name}-"
    ) as home_temp, tempfile.TemporaryDirectory(
        prefix=f"dsbench-workspace-{case.name}-"
    ) as workspace_temp:
        runtime_home = Path(home_temp) / "home"
        runtime_workspace = Path(workspace_temp) / "workspace"
        runtime_workspace.mkdir()
        metadata["runtime_home"] = str(runtime_home)
        metadata["runtime_workspace"] = str(runtime_workspace)
        try:
            if case.harness == "pi":
                isolated_values = _prepare_pi_home(case, runtime_home, config_dir)
            else:
                isolated_values = _prepare_codex_home(case, runtime_home, config_dir)
        except (OSError, SetupError) as error:
            metadata.update(status="setup_failed", error=str(error), exit_code=None)
            _write_json(result_dir / "metadata.json", metadata)
            return metadata

        environment = _clean_environment(runtime_workspace, runtime_home)
        environment.update(isolated_values)
        command = build_command(case, binary, runtime_workspace, result_dir, prompt)
        metadata.update(
            command=command,
            binary=binary,
            harness_version=_command_version(binary),
            status="running",
        )
        _write_json(result_dir / "metadata.json", metadata)

        events_path = result_dir / "events.jsonl"
        stderr_path = result_dir / "stderr.log"
        start_monotonic = time.monotonic()
        timed_out = False
        interrupted = False
        exit_code: Optional[int] = None
        error_message: Optional[str] = None
        try:
            with events_path.open("w", encoding="utf-8") as stdout_file, stderr_path.open(
                "w", encoding="utf-8"
            ) as stderr_file:
                process = subprocess.Popen(
                    command,
                    cwd=str(runtime_workspace),
                    env=environment,
                    stdin=subprocess.PIPE,
                    stdout=stdout_file,
                    stderr=stderr_file,
                    text=True,
                    start_new_session=True,
                )
                _register_process(process)
                try:
                    process.communicate(prompt, timeout=timeout_seconds)
                except subprocess.TimeoutExpired:
                    timed_out = True
                    _terminate_process_group(process)
                except KeyboardInterrupt:
                    interrupted = True
                    _terminate_process_group(process)
                except BaseException:
                    _terminate_process_group(process)
                    raise
                finally:
                    _unregister_process(process)
                exit_code = process.returncode
                _terminate_remaining_children(process.pid)
        except OSError as error:
            error_message = str(error)

        duration = time.monotonic() - start_monotonic
        final_path = result_dir / "final.md"
        if not final_path.exists() or final_path.stat().st_size == 0:
            extracted = _extract_final_from_events(events_path)
            final_path.write_text(
                extracted.rstrip() + ("\n" if extracted else ""), encoding="utf-8"
            )
        usage = _extract_usage_from_events(events_path)
        session_id = _extract_session_id_from_events(events_path)
        session_file: Optional[str] = None
        session_capture_error: Optional[str] = None
        try:
            session_id, session_file = _archive_sessions(
                runtime_home, result_dir, session_id
            )
        except OSError as error:
            session_capture_error = str(error)

        if interrupted:
            status = "interrupted"
        elif timed_out:
            status = "timed_out"
        elif error_message is not None:
            status = "execution_failed"
        elif exit_code == 0:
            status = "succeeded"
        else:
            status = "failed"
        if status == "succeeded" and (session_id is None or session_file is None):
            status = "session_capture_failed"

        resume_command: Optional[str] = None
        native_resume_argv: Optional[List[str]] = None
        if session_id and session_file:
            benchmark_executable = Path(__file__).with_name("benchmark").resolve()
            resume_command = shlex.join(
                [
                    str(benchmark_executable),
                    "--config",
                    str(config_path),
                    "resume",
                    str(case_dir),
                ]
            )
            if case.harness == "pi":
                native_resume_argv = [
                    binary,
                    "--model",
                    case.model_id,
                    "--thinking",
                    case.reasoning,
                    "--session",
                    str(result_dir / session_file),
                ]
            else:
                native_resume_argv = [
                    binary,
                    "--profile",
                    case.harness_config.get("profile", "deepseek"),
                    "--model",
                    case.model_id,
                    "-c",
                    f'model_reasoning_effort="{case.reasoning}"',
                    "-C",
                    str(workspace),
                    "resume",
                    session_id,
                ]

        metadata.update(
            status=status,
            exit_code=exit_code,
            timed_out=timed_out,
            interrupted=interrupted,
            duration_seconds=round(duration, 3),
            finished_at=_now().isoformat(),
            workspace=str(workspace),
            result_dir=str(result_dir),
            session_id=session_id,
            session_file=session_file,
            resume_command=resume_command,
            native_resume_argv=native_resume_argv,
        )
        if usage is not None:
            metadata["usage"] = usage
        if error_message is not None:
            metadata["error"] = error_message
        if session_capture_error is not None:
            metadata["session_capture_error"] = session_capture_error
        try:
            shutil.copytree(str(runtime_workspace), str(workspace), symlinks=True)
        except OSError as error:
            metadata["status"] = "artifact_copy_failed"
            metadata["artifact_copy_error"] = str(error)
        _write_json(result_dir / "metadata.json", metadata)

    return metadata


def run_benchmark(
    config: Dict[str, Any],
    config_path: Path,
    prompt: str,
    selected_cases: Optional[Sequence[str]],
    output_root: Optional[Path],
    timeout_seconds: Optional[int],
    jobs: Optional[int] = None,
) -> Tuple[Path, bool]:
    if not prompt.strip():
        raise ConfigurationError("Prompt must not be empty")
    config_path = config_path.expanduser().resolve()
    config_dir = config_path.parent
    cases = _select_cases(build_cases(config), selected_cases)
    configured_timeout = config.get("defaults", {}).get("timeout_seconds", 7200)
    timeout = timeout_seconds if timeout_seconds is not None else configured_timeout
    if not isinstance(timeout, int) or timeout <= 0:
        raise ConfigurationError("timeout_seconds must be a positive integer")
    configured_jobs = config.get("defaults", {}).get("jobs", MAX_CONCURRENCY)
    concurrency = jobs if jobs is not None else configured_jobs
    if (
        isinstance(concurrency, bool)
        or not isinstance(concurrency, int)
        or not 1 <= concurrency <= MAX_CONCURRENCY
    ):
        raise ConfigurationError(
            f"jobs must be between 1 and {MAX_CONCURRENCY} (inclusive)"
        )

    if output_root is None:
        output_value = config.get("output_root", "runs")
        root = _resolve_file(output_value, config_dir)
    else:
        root = output_root.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    run_dir = root / _timestamp_directory_name()
    run_dir.mkdir()

    prompt_sha256 = _sha256_text(prompt)
    (run_dir / "prompt.md").write_text(prompt, encoding="utf-8")
    started = _now()
    manifest: Dict[str, Any] = {
        "schema_version": CONFIG_SCHEMA_VERSION,
        "started_at": started.isoformat(),
        "status": "running",
        "prompt_sha256": prompt_sha256,
        "jobs": concurrency,
        "case_order": [case.name for case in cases],
        "host": {
            "platform": platform.platform(),
            "machine": platform.machine(),
            "python": platform.python_version(),
        },
        "results": [],
    }
    _write_json(run_dir / "manifest.json", manifest)

    all_succeeded = True
    results_by_case: Dict[str, Dict[str, Any]] = {}
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=concurrency)
    futures: Dict[concurrent.futures.Future, Tuple[int, Case]] = {}
    try:
        for position, case in enumerate(cases, start=1):
            print(f"[queued {position}/{len(cases)}] {case.name}", flush=True)
            future = executor.submit(
                _run_case,
                case=case,
                config_path=config_path,
                config_dir=config_dir,
                run_dir=run_dir,
                prompt=prompt,
                prompt_sha256=prompt_sha256,
                timeout_seconds=timeout,
            )
            futures[future] = (position, case)

        for future in concurrent.futures.as_completed(futures):
            position, case = futures[future]
            try:
                result = future.result()
            except Exception as error:
                result_path = run_dir / case.name / "result" / "metadata.json"
                result_path.parent.mkdir(parents=True, exist_ok=True)
                result = {
                    "case": case.name,
                    "harness": case.harness,
                    "model_id": case.model_id,
                    "reasoning": case.reasoning,
                    "status": "runner_failed",
                    "exit_code": None,
                    "error": repr(error),
                    "finished_at": _now().isoformat(),
                }
                _write_json(result_path, result)

            summary = {
                "case": case.name,
                "status": result["status"],
                "exit_code": result.get("exit_code"),
                "duration_seconds": result.get("duration_seconds"),
                "session_id": result.get("session_id"),
                "resume_command": result.get("resume_command"),
            }
            results_by_case[case.name] = summary
            manifest["results"] = [
                results_by_case[item.name]
                for item in cases
                if item.name in results_by_case
            ]
            _write_json(run_dir / "manifest.json", manifest)
            if result["status"] != "succeeded":
                all_succeeded = False
            duration = result.get("duration_seconds")
            suffix = (
                f" ({duration:.1f}s)" if isinstance(duration, (int, float)) else ""
            )
            print(
                f"[done {position}/{len(cases)}] {case.name}: "
                f"{result['status']}{suffix}",
                flush=True,
            )
            if result.get("session_id"):
                print(f"      session: {result['session_id']}", flush=True)
            if result.get("resume_command"):
                print(f"      resume:  {result['resume_command']}", flush=True)
            if result["status"] == "interrupted":
                raise KeyboardInterrupt
    except KeyboardInterrupt:
        _terminate_all_active_processes()
        for future in futures:
            future.cancel()
        manifest.update(status="interrupted", finished_at=_now().isoformat())
        _write_json(run_dir / "manifest.json", manifest)
        executor.shutdown(wait=True, cancel_futures=True)
        raise
    else:
        executor.shutdown(wait=True)

    manifest.update(
        status="succeeded" if all_succeeded else "completed_with_failures",
        finished_at=_now().isoformat(),
    )
    _write_json(run_dir / "manifest.json", manifest)
    return run_dir, all_succeeded


def _catalog_contains_models(path: Path, model_ids: Iterable[str]) -> bool:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return False
    return all(model_id in text for model_id in model_ids)


def doctor_checks(
    config: Dict[str, Any],
    config_path: Path,
    selected_cases: Optional[Sequence[str]] = None,
) -> List[Tuple[bool, str]]:
    config_dir = config_path.expanduser().resolve().parent
    checks: List[Tuple[bool, str]] = []
    cases = _select_cases(build_cases(config), selected_cases)
    by_harness: Dict[str, Case] = {}
    for case in cases:
        by_harness.setdefault(case.harness, case)

    for harness, case in by_harness.items():
        binary = _resolve_binary(case.harness_config["binary"], config_dir)
        if binary:
            checks.append((True, f"{harness} binary: {binary} ({_command_version(binary)})"))
        else:
            checks.append((False, f"{harness} binary not found: {case.harness_config['binary']}"))

        if harness == "pi":
            auth = _resolve_file(case.harness_config.get("auth_file", ""), config_dir)
            auth_ok = False
            if auth.is_file():
                try:
                    auth_data = json.loads(auth.read_text(encoding="utf-8"))
                    auth_ok = isinstance(auth_data.get("deepseek"), dict)
                except (OSError, json.JSONDecodeError, AttributeError):
                    pass
            checks.append((auth_ok, f"pi DeepSeek auth: {auth}"))
        else:
            profile = _resolve_file(case.harness_config.get("profile_file", ""), config_dir)
            catalog = _resolve_file(case.harness_config.get("model_catalog", ""), config_dir)
            profile_ok = False
            if profile.is_file():
                try:
                    _minimal_codex_profile(
                        profile.read_text(encoding="utf-8"), Path("/isolated/models.json")
                    )
                    profile_ok = True
                except (OSError, SetupError):
                    pass
            checks.append(
                (profile_ok, f"Codex DeepSeek profile: {profile}")
            )
            model_ids = case.harness_config.get("models", {}).values()
            checks.append(
                (
                    catalog.is_file() and _catalog_contains_models(catalog, model_ids),
                    f"Codex catalog contains configured models: {catalog}",
                )
            )
    return checks


def _interactive_environment(workspace: Path, runtime_home: Path) -> Dict[str, str]:
    environment = _clean_environment(workspace, runtime_home)
    environment.pop("CI", None)
    environment.pop("NO_COLOR", None)
    for key in ("TERM", "COLORTERM", "TERM_PROGRAM", "TERM_PROGRAM_VERSION"):
        if key in os.environ:
            environment[key] = os.environ[key]
    environment.setdefault("TERM", "xterm-256color")
    return environment


def resume_case(config: Dict[str, Any], config_path: Path, case_path: Path) -> int:
    config_path = config_path.expanduser().resolve()
    config_dir = config_path.parent
    case_dir = case_path.expanduser().resolve()
    if case_dir.name == "result" and (case_dir / "metadata.json").is_file():
        case_dir = case_dir.parent
    result_dir = case_dir / "result"
    metadata_path = result_dir / "metadata.json"
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ConfigurationError(f"Case metadata not found: {metadata_path}") from error
    except json.JSONDecodeError as error:
        raise ConfigurationError(f"Invalid case metadata: {metadata_path}") from error

    case_name = metadata.get("case")
    case = next((item for item in build_cases(config) if item.name == case_name), None)
    if case is None:
        raise ConfigurationError(f"Case is not present in current config: {case_name}")
    session_id = metadata.get("session_id")
    session_file_value = metadata.get("session_file")
    if not isinstance(session_id, str) or not isinstance(session_file_value, str):
        raise ConfigurationError(f"Case has no resumable session: {case_dir}")
    archived_sessions = result_dir / "session" / "sessions"
    if not archived_sessions.is_dir():
        raise ConfigurationError(f"Session archive not found: {archived_sessions}")
    workspace = case_dir / "workspace"
    if not workspace.is_dir():
        raise ConfigurationError(f"Workspace snapshot not found: {workspace}")

    binary = _resolve_binary(case.harness_config["binary"], config_dir)
    if not binary:
        raise SetupError(f"Executable not found: {case.harness_config['binary']}")

    with tempfile.TemporaryDirectory(prefix=f"dsbench-resume-{case.name}-") as temp:
        runtime_home = Path(temp) / "home"
        if case.harness == "pi":
            isolated_values = _prepare_pi_home(case, runtime_home, config_dir)
        else:
            isolated_values = _prepare_codex_home(case, runtime_home, config_dir)
        runtime_sessions = runtime_home / "sessions"
        shutil.copytree(str(archived_sessions), str(runtime_sessions), dirs_exist_ok=True)
        environment = _interactive_environment(workspace, runtime_home)
        environment.update(isolated_values)

        if case.harness == "pi":
            archived_session_file = result_dir / session_file_value
            try:
                relative_session_file = archived_session_file.relative_to(archived_sessions)
            except ValueError as error:
                raise ConfigurationError(
                    f"Session file is outside the archive: {archived_session_file}"
                ) from error
            runtime_session_file = runtime_sessions / relative_session_file
            command = [
                binary,
                "--provider",
                "deepseek",
                "--model",
                case.model_id,
                "--thinking",
                case.reasoning,
                "--session",
                str(runtime_session_file),
                "--session-dir",
                str(runtime_sessions),
                "--no-extensions",
                "--no-skills",
                "--no-prompt-templates",
                "--no-themes",
                "--no-context-files",
                "--no-approve",
                "--offline",
            ]
        else:
            command = [
                binary,
                "--profile",
                case.harness_config.get("profile", "deepseek"),
                "--model",
                case.model_id,
                "-c",
                f'model_reasoning_effort="{case.reasoning}"',
                "-C",
                str(workspace),
                "--sandbox",
                "workspace-write",
                "--ask-for-approval",
                "never",
                "resume",
                session_id,
            ]

        print(f"Resuming {case.harness} session {session_id}")
        print(f"Command: {shlex.join(command)}")
        try:
            exit_code = subprocess.call(command, cwd=str(workspace), env=environment)
        finally:
            shutil.copytree(
                str(runtime_sessions),
                str(archived_sessions),
                dirs_exist_ok=True,
                symlinks=True,
            )

    metadata["resume_count"] = int(metadata.get("resume_count", 0)) + 1
    metadata["last_resumed_at"] = _now().isoformat()
    metadata["last_resume_exit_code"] = exit_code
    _write_json(metadata_path, metadata)
    return exit_code


def _parse_case_values(values: Optional[Sequence[str]]) -> Optional[List[str]]:
    if not values:
        return None
    result: List[str] = []
    for value in values:
        result.extend(item.strip() for item in value.split(",") if item.strip())
    return result


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="benchmark",
        description="Run isolated pi/codex-ds DeepSeek benchmark cases.",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG,
        help="JSON configuration path (default: benchmark.config.json)",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list", help="List configured benchmark cases")
    subparsers.add_parser("doctor", help="Validate local setup without calling a model")
    resume = subparsers.add_parser("resume", help="Resume a captured case session")
    resume.add_argument("case", type=Path, help="Case directory or its result directory")

    run = subparsers.add_parser("run", help="Run the benchmark matrix")
    run.add_argument("prompt", type=Path, help="UTF-8 prompt file, or - for stdin")
    run.add_argument(
        "--case",
        action="append",
        dest="cases",
        help="Run one case; repeat or use comma-separated names",
    )
    run.add_argument("--output", type=Path, help="Override the configured output root")
    run.add_argument("--timeout", type=int, help="Per-case timeout in seconds")
    run.add_argument(
        "--jobs",
        type=int,
        choices=range(1, MAX_CONCURRENCY + 1),
        help=f"Concurrent cases (maximum: {MAX_CONCURRENCY})",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        config_path = args.config.expanduser().resolve()
        config = load_config(config_path)
        cases = build_cases(config)

        if args.command == "list":
            for case in cases:
                print(f"{case.name:27} {case.model_id:20} reasoning={case.reasoning}")
            return 0

        if args.command == "doctor":
            checks = doctor_checks(config, config_path)
            for ok, message in checks:
                print(f"[{'ok' if ok else 'fail'}] {message}")
            return 0 if all(ok for ok, _ in checks) else 2

        if args.command == "resume":
            return resume_case(config, config_path, args.case)

        selected = _parse_case_values(args.cases)
        _select_cases(cases, selected)
        checks = doctor_checks(config, config_path, selected)
        failed_checks = [message for ok, message in checks if not ok]
        if failed_checks:
            for message in failed_checks:
                print(f"[fail] {message}", file=sys.stderr)
            print("Preflight failed; no model calls were made.", file=sys.stderr)
            return 2
        if str(args.prompt) == "-":
            prompt = sys.stdin.read()
        else:
            try:
                prompt = args.prompt.expanduser().read_text(encoding="utf-8")
            except OSError as error:
                raise ConfigurationError(f"Cannot read prompt: {error}") from error
        run_dir, success = run_benchmark(
            config=config,
            config_path=config_path,
            prompt=prompt,
            selected_cases=selected,
            output_root=args.output,
            timeout_seconds=args.timeout,
            jobs=args.jobs,
        )
        print(f"Run directory: {run_dir}")
        return 0 if success else 1
    except (ConfigurationError, SetupError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
