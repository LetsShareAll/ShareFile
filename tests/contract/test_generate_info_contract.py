import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "packages/cli"))

from lib import config_loader
from lib.types import GenerateInfoOptions


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def run_command(command, args, cwd=REPO_ROOT, env=None) -> None:
    result = subprocess.run(
        [command, *args],
        cwd=cwd,
        env={**os.environ, **(env or {})},
        text=True,
        capture_output=True,
    )

    if result.returncode != 0:
        details = "\n".join(part for part in [result.stdout, result.stderr] if part)
        raise AssertionError(f"{command} {' '.join(args)} failed\n{details}")


def run_generator(fixture_root: Path, *extra_args: str) -> None:
    run_command(
        sys.executable,
        [
            str(REPO_ROOT / "packages/cli/generate-info.py"),
            str(fixture_root),
            *extra_args,
        ],
    )


class GenerateInfoContractTest(unittest.TestCase):
    def test_ignore_patterns_default_is_not_shared(self):
        first = GenerateInfoOptions()
        second = GenerateInfoOptions()

        first.ignore_patterns.append(r"^tmp$")

        self.assertEqual(second.ignore_patterns, [])

    def test_null_ignore_patterns_config_normalizes_to_empty_list(self):
        with tempfile.TemporaryDirectory(prefix="share-file-info-config-") as work_dir:
            config_path = Path(work_dir) / "config.yaml"
            config_path.write_text("generate_info:\n  ignore_patterns:\n", encoding="utf-8")

            original_loader = config_loader.load_yaml_config
            config_loader.load_yaml_config = lambda _: {
                "generate_info": {"ignore_patterns": None}
            }

            try:
                options = config_loader.load_generate_info_config(str(config_path))
            finally:
                config_loader.load_yaml_config = original_loader

            self.assertEqual(options.ignore_patterns, [])

    def test_generates_metadata_contract(self):
        with tempfile.TemporaryDirectory(prefix="share-file-info-contract-") as work_dir:
            fixture_root = Path(work_dir) / "fixture"
            self.create_fixture(fixture_root)

            run_generator(fixture_root, "--no-git", "--no-hash")

            root_info = read_json(fixture_root / "._info.json")
            subdir_info = read_json(fixture_root / "subdir/._info.json")

            self.assertEqual(root_info["self"]["description"], "当前目录")
            self.assertEqual(root_info["children"]["README.md"]["hidden"], False)
            self.assertEqual(root_info["children"]["README.md"]["size"], 123)
            self.assertEqual(root_info["children"]["README.md"]["md5"], "old-md5")
            self.assertEqual(root_info["children"]["README.md"]["sha256"], "old-sha256")
            self.assertEqual(root_info["children"]["notes.abc"]["description"], "ABC 文件")
            self.assertEqual(root_info["children"]["notes.abc"]["size"], 4)
            self.assertEqual(root_info["children"][".secret"]["hidden"], True)
            self.assertEqual(root_info["children"]["subdir"]["description"], "文件夹")
            self.assertNotIn("size", root_info["children"]["subdir"])
            self.assertNotIn("md5", root_info["children"]["subdir"])
            self.assertNotIn("version", root_info["children"]["subdir"])
            self.assertEqual(root_info["children"]["virtual-link"]["description"], "文件")
            self.assertEqual(root_info["children"]["virtual-mount"]["description"], "文件夹")
            self.assertNotIn("missing-file.txt", root_info["children"])
            self.assertEqual(subdir_info["self"]["description"], "当前目录")
            self.assertEqual(subdir_info["children"]["nested.txt"]["description"], "纯文本文件")

    def test_normalizes_git_timestamps_to_utc(self):
        with tempfile.TemporaryDirectory(prefix="share-file-info-contract-") as work_dir:
            git_root = Path(work_dir) / "git-fixture"
            committed_at = "2024-01-02T03:04:05+08:00"

            git_root.mkdir(parents=True)
            (git_root / "tracked.txt").write_text("tracked\n", encoding="utf-8")

            run_command("git", ["init"], cwd=git_root)
            run_command("git", ["config", "user.email", "contract@example.test"], cwd=git_root)
            run_command("git", ["config", "user.name", "Contract Test"], cwd=git_root)
            run_command("git", ["add", "tracked.txt"], cwd=git_root)
            run_command(
                "git",
                ["commit", "-m", "add tracked file"],
                cwd=git_root,
                env={
                    "GIT_AUTHOR_DATE": committed_at,
                    "GIT_COMMITTER_DATE": committed_at,
                },
            )

            run_generator(git_root, "--no-hash")

            root_info = read_json(git_root / "._info.json")
            self.assertEqual(
                root_info["children"]["tracked.txt"]["created_at"],
                "2024-01-01T19:04:05.000Z",
            )
            self.assertEqual(
                root_info["children"]["tracked.txt"]["updated_at"],
                "2024-01-01T19:04:05.000Z",
            )

    @staticmethod
    def create_fixture(root_dir: Path) -> None:
        (root_dir / "subdir").mkdir(parents=True)

        (root_dir / "README.md").write_text("# Root\n", encoding="utf-8")
        (root_dir / "notes.abc").write_text("abc\n", encoding="utf-8")
        (root_dir / ".secret").write_text("hidden\n", encoding="utf-8")
        (root_dir / "subdir/nested.txt").write_text("nested\n", encoding="utf-8")

        write_json(
            root_dir / "._info.json",
            {
                "self": {},
                "children": {
                    "README.md": {
                        "type": "file",
                        "description": "旧入口文档",
                        "hidden": False,
                        "hold": {"size": True},
                        "version": "2.0.0",
                        "size": 123,
                        "md5": "old-md5",
                        "sha256": "old-sha256",
                    },
                    "subdir": {
                        "type": "folder",
                        "size": 999,
                        "md5": "folder-md5",
                        "version": "should-be-removed",
                    },
                    "virtual-link": {
                        "type": "file",
                        "redirect": {
                            "url": "https://example.test/tool",
                            "type": "direct",
                        },
                    },
                    "virtual-mount": {
                        "type": "folder",
                        "mount_source": {
                            "provider": "github",
                            "repository": "LetsShareAll/ShareFile",
                            "branch": "file",
                            "sub_path": "/public",
                            "access_cdn": "raw",
                            "use_cdn_index": False,
                        },
                    },
                    "missing-file.txt": {
                        "type": "file",
                        "description": "应该被清理",
                    },
                },
            },
        )


if __name__ == "__main__":
    unittest.main()
