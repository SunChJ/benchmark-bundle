import json
import os
import stat
import tempfile
import unittest
from pathlib import Path

import benchmark_runner


EXPECTED_CASES = [
    "pi-flash-high",
    "pi-flash-max",
    "pi-pro-high",
    "pi-pro-max",
    "codex-ds-flash-high",
    "codex-ds-flash-max",
    "codex-ds-pro-high",
    "codex-ds-pro-max",
]


class BenchmarkRunnerTests(unittest.TestCase):
    def test_default_matrix_has_the_eight_requested_cases(self):
        config = benchmark_runner.load_config(Path("benchmark.config.json"))

        self.assertEqual(
            [case.name for case in benchmark_runner.build_cases(config)],
            EXPECTED_CASES,
        )

    def test_commands_disable_resource_discovery_and_keep_isolated_sessions(self):
        config = benchmark_runner.load_config(Path("benchmark.config.json"))
        cases = {case.name: case for case in benchmark_runner.build_cases(config)}

        pi = benchmark_runner.build_command(
            cases["pi-flash-high"],
            binary="/usr/local/bin/pi",
            workspace=Path("/tmp/workspace"),
            result_dir=Path("/tmp/result"),
            prompt="benchmark prompt",
        )
        self.assertNotIn("--no-session", pi)
        self.assertIn("--no-extensions", pi)
        self.assertIn("--no-skills", pi)
        self.assertIn("--no-context-files", pi)
        self.assertIn("--offline", pi)
        self.assertNotIn("benchmark prompt", pi)

        codex = benchmark_runner.build_command(
            cases["codex-ds-pro-max"],
            binary="/usr/local/bin/codex",
            workspace=Path("/tmp/workspace"),
            result_dir=Path("/tmp/result"),
            prompt="benchmark prompt",
        )
        self.assertNotIn("--ephemeral", codex)
        self.assertIn("--ignore-user-config", codex)
        self.assertIn("--ignore-rules", codex)
        self.assertIn("workspace-write", codex)
        self.assertNotIn("benchmark prompt", codex)

    def test_end_to_end_run_uses_empty_workspaces_and_disposable_homes(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            fake_pi = root / "fake-pi"
            fake_codex = root / "fake-codex"
            self._write_fake_pi(fake_pi)
            self._write_fake_codex(fake_codex)

            pi_auth = root / "pi-auth.json"
            pi_auth.write_text('{"deepseek":{"type":"api_key","key":"test"}}')
            codex_profile = root / "deepseek.config.toml"
            codex_profile.write_text(
                'model_provider = "deepseek"\n'
                'model_catalog_json = "unused.json"\n'
                '[model_providers.deepseek]\n'
                'base_url = "https://example.invalid"\n'
                'wire_api = "responses"\n'
                'experimental_bearer_token = "test"\n'
            )
            codex_catalog = root / "models.json"
            codex_catalog.write_text(
                json.dumps(
                    {
                        "models": [
                            {"slug": "deepseek-v4-flash"},
                            {"slug": "deepseek-v4-pro"},
                        ]
                    }
                )
            )
            config_path = root / "config.json"
            config_path.write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "output_root": str(root / "runs"),
                        "defaults": {"timeout_seconds": 30},
                        "harnesses": {
                            "pi": {
                                "binary": str(fake_pi),
                                "auth_file": str(pi_auth),
                                "models": {"flash": "deepseek-v4-flash"},
                            },
                            "codex-ds": {
                                "binary": str(fake_codex),
                                "profile": "deepseek",
                                "profile_file": str(codex_profile),
                                "model_catalog": str(codex_catalog),
                                "models": {"flash": "deepseek-v4-flash"},
                            },
                        },
                        "matrix": [
                            {
                                "harness": "pi",
                                "model": "flash",
                                "reasoning": "high",
                            },
                            {
                                "harness": "codex-ds",
                                "model": "flash",
                                "reasoning": "max",
                            },
                        ],
                    }
                )
            )

            config = benchmark_runner.load_config(config_path)
            run_dir, success = benchmark_runner.run_benchmark(
                config=config,
                config_path=config_path,
                prompt="Create the requested artifact.",
                selected_cases=None,
                output_root=None,
                timeout_seconds=None,
            )

            self.assertTrue(success)
            self.assertEqual((run_dir / "prompt.md").read_text(), "Create the requested artifact.")
            for case_name in ("pi-flash-high", "codex-ds-flash-max"):
                case_dir = run_dir / case_name
                result_dir = case_dir / "result"
                metadata = json.loads((result_dir / "metadata.json").read_text())
                self.assertEqual(metadata["status"], "succeeded")
                self.assertEqual(metadata["exit_code"], 0)
                self.assertTrue(metadata["session_id"])
                self.assertIn("benchmark", metadata["resume_command"])
                self.assertTrue((result_dir / metadata["session_file"]).is_file())
                self.assertTrue((result_dir / "final.md").read_text().strip())
                self.assertEqual(
                    (case_dir / "workspace" / "initial-entry-count.txt").read_text(),
                    "0",
                )
                self.assertFalse(Path(metadata["runtime_home"]).exists())
                runtime_workspace = Path(
                    (case_dir / "workspace" / "runtime-cwd.txt").read_text()
                )
                self.assertNotEqual(runtime_workspace, case_dir / "workspace")
                self.assertFalse(runtime_workspace.exists())

            for case_name in ("pi-flash-high", "codex-ds-flash-max"):
                case_dir = run_dir / case_name
                self.assertEqual(
                    benchmark_runner.resume_case(config, config_path, case_dir), 0
                )
                self.assertTrue((case_dir / "workspace" / "resumed.txt").is_file())
                resumed_metadata = json.loads(
                    (case_dir / "result" / "metadata.json").read_text()
                )
                self.assertEqual(resumed_metadata["resume_count"], 1)

    def test_runtime_configuration_keeps_only_deepseek_credentials(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source_auth = root / "auth.json"
            source_auth.write_text(
                json.dumps(
                    {
                        "deepseek": {"type": "api_key", "key": "deepseek-test"},
                        "unrelated": {"type": "api_key", "key": "must-not-copy"},
                    }
                )
            )
            case = benchmark_runner.Case(
                name="pi-flash-high",
                harness="pi",
                model_tier="flash",
                model_id="deepseek-v4-flash",
                reasoning="high",
                harness_config={"auth_file": str(source_auth)},
            )
            runtime_home = root / "runtime"

            benchmark_runner._prepare_pi_home(case, runtime_home, root)

            copied = json.loads((runtime_home / "auth.json").read_text())
            self.assertEqual(list(copied), ["deepseek"])

    def test_codex_profile_removes_unrelated_sections(self):
        source = (
            'model = "deepseek-v4-pro"\n'
            'model_provider = "deepseek"\n'
            '[model_providers.deepseek]\n'
            'base_url = "https://example.invalid"\n'
            'wire_api = "responses"\n'
            'experimental_bearer_token = "test"\n'
            '[projects."/private/existing-project"]\n'
            'trust_level = "trusted"\n'
            '[tui]\n'
            'status_line = ["model"]\n'
        )

        isolated = benchmark_runner._minimal_codex_profile(
            source, Path("/tmp/isolated/models.json")
        )

        self.assertIn('model_provider = "deepseek"', isolated)
        self.assertIn('experimental_bearer_token = "test"', isolated)
        self.assertIn('/tmp/isolated/models.json', isolated)
        self.assertNotIn("existing-project", isolated)
        self.assertNotIn("[tui]", isolated)

    def test_clean_environment_does_not_inherit_credentials(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            old_value = os.environ.get("UNRELATED_API_KEY")
            os.environ["UNRELATED_API_KEY"] = "must-not-inherit"
            try:
                environment = benchmark_runner._clean_environment(
                    root / "workspace", root / "runtime"
                )
            finally:
                if old_value is None:
                    os.environ.pop("UNRELATED_API_KEY", None)
                else:
                    os.environ["UNRELATED_API_KEY"] = old_value

            self.assertNotIn("UNRELATED_API_KEY", environment)
            self.assertEqual(environment["HOME"], str(root / "runtime"))
            self.assertEqual(environment["TMPDIR"], str(root / "runtime" / "tmp"))

    def test_concurrency_cannot_exceed_two(self):
        config_path = Path("benchmark.config.json").resolve()
        config = benchmark_runner.load_config(config_path)

        with self.assertRaises(benchmark_runner.ConfigurationError):
            benchmark_runner.run_benchmark(
                config=config,
                config_path=config_path,
                prompt="test",
                selected_cases=["pi-flash-high"],
                output_root=None,
                timeout_seconds=30,
                jobs=3,
            )

    @staticmethod
    def _make_executable(path: Path):
        path.chmod(path.stat().st_mode | stat.S_IXUSR)

    @classmethod
    def _write_fake_pi(cls, path: Path):
        path.write_text(
            "#!/usr/bin/env python3\n"
            "import json, os, pathlib, sys\n"
            "if '--version' in sys.argv:\n"
            "    print('fake-pi 1.0')\n"
            "    raise SystemExit\n"
            "if '--session' in sys.argv:\n"
            "    pathlib.Path.cwd().joinpath('resumed.txt').write_text('pi')\n"
            "    raise SystemExit\n"
            "session_id = '11111111-1111-7111-8111-111111111111'\n"
            "session_dir = pathlib.Path(os.environ['PI_CODING_AGENT_SESSION_DIR']) / 'fake'\n"
            "session_dir.mkdir(parents=True)\n"
            "session_file = session_dir / ('session-' + session_id + '.jsonl')\n"
            "session_file.write_text(json.dumps({'type':'session','id':session_id,'cwd':str(pathlib.Path.cwd())}) + '\\n')\n"
            "cwd = pathlib.Path.cwd()\n"
            "(cwd / 'initial-entry-count.txt').write_text(str(len(list(cwd.iterdir()))))\n"
            "(cwd / 'runtime-cwd.txt').write_text(str(cwd))\n"
            "print(json.dumps({'type':'session','id':session_id,'cwd':str(cwd)}))\n"
            "print(json.dumps({'type':'message_end','message':{'role':'assistant','content':[{'type':'text','text':'pi done'}]}}))\n"
        )
        cls._make_executable(path)

    @classmethod
    def _write_fake_codex(cls, path: Path):
        path.write_text(
            "#!/usr/bin/env python3\n"
            "import json, os, pathlib, sys\n"
            "if '--version' in sys.argv:\n"
            "    print('fake-codex 1.0')\n"
            "    raise SystemExit\n"
            "if 'resume' in sys.argv:\n"
            "    pathlib.Path(sys.argv[sys.argv.index('-C') + 1]).joinpath('resumed.txt').write_text('codex')\n"
            "    raise SystemExit\n"
            "session_id = '22222222-2222-7222-8222-222222222222'\n"
            "session_dir = pathlib.Path(os.environ['CODEX_HOME']) / 'sessions' / '2026' / '08' / '13'\n"
            "session_dir.mkdir(parents=True)\n"
            "session_file = session_dir / ('rollout-' + session_id + '.jsonl')\n"
            "session_file.write_text(json.dumps({'type':'session_meta','payload':{'id':session_id}}) + '\\n')\n"
            "cwd = pathlib.Path(sys.argv[sys.argv.index('-C') + 1])\n"
            "(cwd / 'initial-entry-count.txt').write_text(str(len(list(cwd.iterdir()))))\n"
            "(cwd / 'runtime-cwd.txt').write_text(str(cwd))\n"
            "out = pathlib.Path(sys.argv[sys.argv.index('--output-last-message') + 1])\n"
            "out.write_text('codex done\\n')\n"
            "print(json.dumps({'type':'thread.started','thread_id':session_id}))\n"
            "print(json.dumps({'type':'item.completed','item':{'type':'agent_message','text':'codex done'}}))\n"
        )
        cls._make_executable(path)


if __name__ == "__main__":
    unittest.main()
