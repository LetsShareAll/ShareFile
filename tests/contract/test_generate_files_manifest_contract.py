import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import contextmanager, redirect_stderr, redirect_stdout
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CLI_DIR = REPO_ROOT / "packages/cli"
SCRIPT_PATH = CLI_DIR / "generate-files-manifest.py"
CDN_URL = "https://cdn.example.test/files"

sys.path.insert(0, str(CLI_DIR))


def load_manifest_module():
    spec = importlib.util.spec_from_file_location("generate_files_manifest", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)

    return module


MANIFEST = load_manifest_module()


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_rows(path: Path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def folder(node_id: str, name: str, parent, children) -> dict:
    return {
        "id": node_id,
        "name": name,
        "type": "folder",
        "parent": parent,
        "children": children,
        "redirect_url": None,
    }


def file_node(node_id: str, name: str, parent: str, size, url=None, redirect_url=None) -> dict:
    node = {
        "id": node_id,
        "name": name,
        "type": "file",
        "parent": parent,
        "children": [],
        "redirect_url": redirect_url,
        "size": size,
    }

    if url is not None:
        node["url"] = url

    return node


def local_index() -> dict:
    """本地索引 fixture：物理文件 + 一个虚拟重定向节点 + 一个外挂挂载点。"""
    return {
        "root_id": "root",
        "path_index": {
            "/": "root",
            "/docs": "docs",
            "/docs/Alpha.txt": "docs/Alpha.txt",
            "/docs/guide.txt": "docs/guide.txt",
            "/docs/virtual-link": "docs/virtual-link",
            "/docs/空 白.txt": "docs/空 白.txt",
            "/mounted": "mounted",
            "/mounted/local.txt": "mounted/local.txt",
        },
        "nodes": {
            "root": folder("root", "/", None, ["docs", "mounted"]),
            "docs": folder(
                "docs",
                "docs",
                "root",
                ["docs/guide.txt", "docs/Alpha.txt", "docs/virtual-link", "docs/空 白.txt"],
            ),
            "docs/guide.txt": file_node("docs/guide.txt", "guide.txt", "docs", 6),
            "docs/Alpha.txt": file_node("docs/Alpha.txt", "Alpha.txt", "docs", 5),
            "docs/空 白.txt": file_node("docs/空 白.txt", "空 白.txt", "docs", 3),
            "docs/virtual-link": file_node(
                "docs/virtual-link",
                "virtual-link",
                "docs",
                None,
                redirect_url="https://example.test/download",
            ),
            "mounted": {
                **folder("mounted", "mounted", "root", ["mounted/local.txt"]),
                "mount_source": {
                    "provider": "github",
                    "repository": "LetsShareAll/ShareFile",
                    "branch": "file",
                    "sub_path": "/public",
                    "access_cdn": "jsdelivr",
                    "use_cdn_index": True,
                },
            },
            "mounted/local.txt": file_node("mounted/local.txt", "local.txt", "mounted", 4),
        },
    }


def cdn_index() -> dict:
    """CDN 索引 fixture：guide.txt 有直链，Alpha.txt 的 url 为 null，空 白.txt 整条缺失。"""
    data = local_index()
    nodes = data["nodes"]

    nodes["docs/guide.txt"]["url"] = f"{CDN_URL}/docs/guide.txt"
    nodes["docs/Alpha.txt"]["url"] = None
    nodes["mounted/local.txt"]["url"] = f"{CDN_URL}/mounted/local.txt"
    nodes.pop("docs/空 白.txt")
    nodes.pop("docs/virtual-link")

    return data


def external_index() -> dict:
    """外部仓库索引 fixture：sub_path 之外的节点与重定向节点都必须被过滤掉。"""
    return {
        "root_id": "root",
        "path_index": {
            "/": "root",
            "/public": "public",
            "/public/softwares": "public/softwares",
            "/private": "private",
        },
        "nodes": {
            "root": folder("root", "/", None, ["public", "private"]),
            "public": folder("public", "public", "root", ["public/softwares"]),
            "public/softwares": folder(
                "public/softwares",
                "softwares",
                "public",
                ["public/softwares/tool.bin", "public/softwares/evil.bin", "public/softwares/link"],
            ),
            "public/softwares/tool.bin": file_node(
                "public/softwares/tool.bin",
                "tool.bin",
                "public/softwares",
                1024,
                url="https://cdn.jsdelivr.net/gh/LetsShareAll/ShareFile@file/public/softwares/tool.bin",
            ),
            "public/softwares/evil.bin": file_node(
                "public/softwares/evil.bin",
                "evil.bin",
                "public/softwares",
                2048,
                url="https://evil.example.test/evil.bin",
            ),
            "public/softwares/link": file_node(
                "public/softwares/link",
                "link",
                "public/softwares",
                None,
                redirect_url="https://example.test/tool",
            ),
            "private": folder("private", "private", "root", ["private/notes.txt"]),
            "private/notes.txt": file_node("private/notes.txt", "notes.txt", "private", 8),
        },
    }


def create_fixture(data_dir: Path) -> None:
    write_json(data_dir / "share-file.json", local_index())
    write_json(data_dir / "share-file.cdn.json", cdn_index())


def run_generator(data_dir: Path, output_path: Path, *extra_args: str):
    return subprocess.run(
        [sys.executable, str(SCRIPT_PATH), str(data_dir), str(output_path), *extra_args],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
    )


def build_patched_program(data_dir: Path, output_path: Path, fetch_body: str, extra_args) -> str:
    lines = [
        "import importlib.util, json, sys",
        f"sys.path.insert(0, {str(CLI_DIR)!r})",
        f"spec = importlib.util.spec_from_file_location('generate_files_manifest', {str(SCRIPT_PATH)!r})",
        "module = importlib.util.module_from_spec(spec)",
        "sys.modules[spec.name] = module",
        "spec.loader.exec_module(module)",
        "def patched_fetch(mount_source, use_cdn_index):",
    ]
    lines.extend(f"    {line}" for line in fetch_body.splitlines())
    lines.extend(
        [
            "module.fetch_external_index = patched_fetch",
            "sys.argv = ['generate-files-manifest.py', "
            f"{str(data_dir)!r}, {str(output_path)!r}"
            + "".join(f", {arg!r}" for arg in extra_args)
            + "]",
            "raise SystemExit(module.main())",
        ]
    )

    return "\n".join(lines)


def run_patched_generator(data_dir: Path, output_path: Path, fetch_body: str, *extra_args: str):
    program = build_patched_program(data_dir, output_path, fetch_body, extra_args)
    return subprocess.run(
        [sys.executable, "-c", program],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
    )


@contextmanager
def patched_fetch(replacement):
    original = MANIFEST.fetch_external_index
    MANIFEST.fetch_external_index = replacement

    try:
        yield
    finally:
        MANIFEST.fetch_external_index = original


@contextmanager
def cli_args(values):
    original = sys.argv
    sys.argv = list(values)

    try:
        yield
    finally:
        sys.argv = original


def run_main_in_process(data_dir: Path, output_path: Path, *extra_args: str):
    stdout = io.StringIO()
    stderr = io.StringIO()

    with cli_args(["generate-files-manifest.py", str(data_dir), str(output_path), *extra_args]):
        with redirect_stdout(stdout), redirect_stderr(stderr):
            try:
                code = MANIFEST.main()
            except SystemExit as error:
                code = error.code if isinstance(error.code, int) else 1

    return code, stdout.getvalue() + stderr.getvalue()


class GenerateFilesManifestContractTest(unittest.TestCase):
    def test_rows_are_sorted_and_virtual_nodes_are_skipped(self):
        with tempfile.TemporaryDirectory(prefix="files-manifest-contract-") as work_dir:
            data_dir = Path(work_dir) / "data"
            output_path = Path(work_dir) / "out/files.jsonl"
            create_fixture(data_dir)

            result = run_generator(data_dir, output_path, "--offline")

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

            rows = read_rows(output_path)
            self.assertEqual(
                [row["path"] for row in rows],
                [
                    "/docs/Alpha.txt",
                    "/docs/guide.txt",
                    "/docs/空 白.txt",
                    "/mounted/local.txt",
                ],
            )
            self.assertEqual(sorted(row["path"] for row in rows), [row["path"] for row in rows])
            self.assertEqual([row["id"] for row in rows], [row["path"][1:] for row in rows])
            self.assertNotIn("docs/virtual-link", [row["id"] for row in rows])
            self.assertTrue(all(row["source"] == "local" for row in rows))
            self.assertTrue(all(row["mount_point"] is None for row in rows))

    def test_local_urls_come_from_cdn_index(self):
        with tempfile.TemporaryDirectory(prefix="files-manifest-contract-") as work_dir:
            data_dir = Path(work_dir) / "data"
            output_path = Path(work_dir) / "out/files.jsonl"
            create_fixture(data_dir)

            result = run_generator(data_dir, output_path, "--offline")

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

            rows = {row["id"]: row for row in read_rows(output_path)}

            self.assertEqual(rows["docs/guide.txt"]["url"], f"{CDN_URL}/docs/guide.txt")
            self.assertEqual(rows["mounted/local.txt"]["url"], f"{CDN_URL}/mounted/local.txt")
            self.assertIsNone(rows["docs/Alpha.txt"]["url"])
            self.assertIsNone(rows["docs/空 白.txt"]["url"])
            self.assertEqual(
                sorted(rows["docs/guide.txt"].keys()),
                ["id", "mount_point", "name", "path", "size", "source", "url"],
            )

    def test_explicit_cdn_base_only_fills_missing_urls(self):
        with tempfile.TemporaryDirectory(prefix="files-manifest-contract-") as work_dir:
            data_dir = Path(work_dir) / "data"
            output_path = Path(work_dir) / "out/files.jsonl"
            create_fixture(data_dir)

            result = run_generator(data_dir, output_path, "--offline", "--cdn-url", CDN_URL)

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

            rows = {row["id"]: row for row in read_rows(output_path)}

            self.assertEqual(rows["docs/guide.txt"]["url"], f"{CDN_URL}/docs/guide.txt")
            self.assertEqual(rows["docs/Alpha.txt"]["url"], f"{CDN_URL}/docs/Alpha.txt")
            self.assertEqual(
                rows["docs/空 白.txt"]["url"],
                f"{CDN_URL}/docs/%E7%A9%BA%20%E7%99%BD.txt",
            )

    def test_offline_never_fetches_external_sources(self):
        with tempfile.TemporaryDirectory(prefix="files-manifest-contract-") as work_dir:
            data_dir = Path(work_dir) / "data"
            output_path = Path(work_dir) / "out/files.jsonl"
            create_fixture(data_dir)

            calls = []

            def forbidden_fetch(mount_source, use_cdn_index):
                calls.append(mount_source)
                raise AssertionError("--offline 不应抓取外部挂载源")

            with patched_fetch(forbidden_fetch):
                code, output = run_main_in_process(data_dir, output_path, "--offline")

            self.assertEqual(code, 0, output)
            self.assertEqual(calls, [])

            rows = read_rows(output_path)
            self.assertTrue(all(row["source"] == "local" for row in rows))

    def test_external_files_are_rewritten_from_mounted_index(self):
        with tempfile.TemporaryDirectory(prefix="files-manifest-contract-") as work_dir:
            data_dir = Path(work_dir) / "data"
            output_path = Path(work_dir) / "out/files.jsonl"
            fetch_fixture = Path(work_dir) / "external.json"
            create_fixture(data_dir)
            write_json(fetch_fixture, external_index())

            result = run_patched_generator(
                data_dir,
                output_path,
                f"with open({str(fetch_fixture)!r}, encoding='utf-8') as handle:\n    return json.load(handle)",
            )

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

            rows = read_rows(output_path)

            self.assertEqual(
                [row["id"] for row in rows],
                [
                    "docs/Alpha.txt",
                    "docs/guide.txt",
                    "docs/空 白.txt",
                    "mounted/local.txt",
                    "mounted/softwares/evil.bin",
                    "mounted/softwares/tool.bin",
                ],
            )
            self.assertEqual(
                [row for row in rows if row["source"] == "external"],
                [
                    {
                        "id": "mounted/softwares/evil.bin",
                        "name": "evil.bin",
                        "path": "/mounted/softwares/evil.bin",
                        "size": 2048,
                        "url": "https://cdn.jsdelivr.net/gh/LetsShareAll/ShareFile@file/public/softwares/evil.bin",
                        "source": "external",
                        "mount_point": "mounted",
                    },
                    {
                        "id": "mounted/softwares/tool.bin",
                        "name": "tool.bin",
                        "path": "/mounted/softwares/tool.bin",
                        "size": 1024,
                        "url": "https://cdn.jsdelivr.net/gh/LetsShareAll/ShareFile@file/public/softwares/tool.bin",
                        "source": "external",
                        "mount_point": "mounted",
                    },
                ],
            )
            self.assertNotIn("private/notes.txt", [row["id"] for row in rows])
            self.assertNotIn("mounted/softwares/link", [row["id"] for row in rows])

    def test_external_fetch_failure_warns_and_exits_zero(self):
        with tempfile.TemporaryDirectory(prefix="files-manifest-contract-") as work_dir:
            data_dir = Path(work_dir) / "data"
            output_path = Path(work_dir) / "out/files.jsonl"
            create_fixture(data_dir)

            result = run_patched_generator(
                data_dir,
                output_path,
                "raise RuntimeError('模拟外部源抓取失败')",
            )

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("跳过外部挂载源 mounted", result.stdout)

            rows = read_rows(output_path)
            self.assertEqual(len(rows), 4)
            self.assertTrue(all(row["source"] == "local" for row in rows))

    def test_failed_mount_source_keeps_existing_rows_of_that_mount_point(self):
        with tempfile.TemporaryDirectory(prefix="files-manifest-contract-") as work_dir:
            data_dir = Path(work_dir) / "data"
            output_path = Path(work_dir) / "out/files.jsonl"
            fetch_fixture = Path(work_dir) / "external.json"
            create_fixture(data_dir)
            write_json(fetch_fixture, external_index())

            healthy = run_patched_generator(
                data_dir,
                output_path,
                f"with open({str(fetch_fixture)!r}, encoding='utf-8') as handle:\n    return json.load(handle)",
            )

            self.assertEqual(healthy.returncode, 0, healthy.stdout + healthy.stderr)

            healthy_bytes = output_path.read_bytes()
            healthy_external = [
                row for row in read_rows(output_path) if row["source"] == "external"
            ]

            self.assertEqual(len(healthy_external), 2)

            failing_body = "raise RuntimeError('模拟外部源抓取失败')"
            failed = run_patched_generator(data_dir, output_path, failing_body)

            self.assertEqual(failed.returncode, 0, failed.stdout + failed.stderr)
            self.assertIn("外部挂载源 mounted 本轮抓取失败", failed.stdout)
            self.assertIn("模拟外部源抓取失败", failed.stdout)
            self.assertIn("保留既有清单中的 2 行", failed.stdout)

            offline_path = Path(work_dir) / "offline.jsonl"
            self.assertEqual(run_generator(data_dir, offline_path, "--offline").returncode, 0)

            rows = read_rows(output_path)
            self.assertEqual(
                [row for row in rows if row["source"] == "local"],
                read_rows(offline_path),
            )
            self.assertEqual(
                [row for row in rows if row["source"] == "external"],
                healthy_external,
            )

            repeated = run_patched_generator(data_dir, output_path, failing_body)

            self.assertEqual(repeated.returncode, 0, repeated.stdout + repeated.stderr)
            self.assertEqual(output_path.read_bytes(), healthy_bytes)

            broken_index = external_index()
            broken_index["path_index"].pop("/public")
            broken_fixture = Path(work_dir) / "external-missing-sub-path.json"
            write_json(broken_fixture, broken_index)

            missing_sub_path = run_patched_generator(
                data_dir,
                output_path,
                f"with open({str(broken_fixture)!r}, encoding='utf-8') as handle:\n    return json.load(handle)",
            )

            self.assertEqual(
                missing_sub_path.returncode, 0, missing_sub_path.stdout + missing_sub_path.stderr
            )
            self.assertIn("外部源中不存在路径: /public", missing_sub_path.stdout)
            self.assertIn("保留既有清单中的 2 行", missing_sub_path.stdout)
            self.assertEqual(output_path.read_bytes(), healthy_bytes)

    def test_failed_mount_source_without_existing_manifest_emits_local_rows_only(self):
        with tempfile.TemporaryDirectory(prefix="files-manifest-contract-") as work_dir:
            data_dir = Path(work_dir) / "data"
            output_path = Path(work_dir) / "out/files.jsonl"
            create_fixture(data_dir)

            self.assertFalse(output_path.exists())

            result = run_patched_generator(
                data_dir,
                output_path,
                "raise RuntimeError('模拟外部源抓取失败')",
            )

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("跳过外部挂载源 mounted", result.stdout)
            self.assertNotIn("保留既有清单中的", result.stdout)

            rows = read_rows(output_path)

            self.assertEqual(len(rows), 4)
            self.assertTrue(all(row["source"] == "local" for row in rows))
            self.assertTrue(all(row["mount_point"] is None for row in rows))

    def test_manifest_bytes_are_stable_across_runs(self):
        with tempfile.TemporaryDirectory(prefix="files-manifest-contract-") as work_dir:
            data_dir = Path(work_dir) / "data"
            fetch_fixture = Path(work_dir) / "external.json"
            create_fixture(data_dir)
            write_json(fetch_fixture, external_index())

            offline_first = Path(work_dir) / "offline-first.jsonl"
            offline_second = Path(work_dir) / "offline-second.jsonl"
            self.assertEqual(run_generator(data_dir, offline_first, "--offline").returncode, 0)
            self.assertEqual(run_generator(data_dir, offline_second, "--offline").returncode, 0)
            self.assertEqual(offline_first.read_bytes(), offline_second.read_bytes())

            external_body = (
                f"with open({str(fetch_fixture)!r}, encoding='utf-8') as handle:\n"
                "    return json.load(handle)"
            )
            mounted_first = Path(work_dir) / "mounted-first.jsonl"
            mounted_second = Path(work_dir) / "mounted-second.jsonl"
            self.assertEqual(
                run_patched_generator(data_dir, mounted_first, external_body).returncode, 0
            )
            self.assertEqual(
                run_patched_generator(data_dir, mounted_second, external_body).returncode, 0
            )
            self.assertEqual(mounted_first.read_bytes(), mounted_second.read_bytes())

    def test_external_url_rules_match_typescript_contract(self):
        raw = {
            "provider": "github",
            "repository": "LetsShareAll/ShareFile",
            "branch": "file",
            "access_cdn": "raw",
        }
        jsdelivr = {"provider": "github", "repository": "LetsShareAll/ShareFile"}
        custom = {
            "provider": "github",
            "repository": "LetsShareAll/ShareFile",
            "access_cdn": "https://cdn-file.lssa.fun",
        }

        self.assertEqual(
            MANIFEST.build_external_file_url(jsdelivr, "public/a b.txt"),
            "https://cdn.jsdelivr.net/gh/LetsShareAll/ShareFile@main/public/a b.txt",
        )
        self.assertEqual(
            MANIFEST.build_external_file_url(
                {**jsdelivr, "access_cdn": "jsdelivr"}, "/public/a.txt/"
            ),
            "https://cdn.jsdelivr.net/gh/LetsShareAll/ShareFile@main/public/a.txt",
        )
        self.assertEqual(
            MANIFEST.build_external_file_url(raw, "public/a.txt"),
            "https://raw.githubusercontent.com/LetsShareAll/ShareFile/file/public/a.txt",
        )
        self.assertEqual(
            MANIFEST.build_external_file_url(custom, "public/a.txt"),
            "https://cdn-file.lssa.fun/raw.githubusercontent.com/LetsShareAll/ShareFile/main/public/a.txt",
        )
        self.assertEqual(
            MANIFEST.get_expected_file_url_prefix(custom),
            "https://cdn-file.lssa.fun/raw.githubusercontent.com/LetsShareAll/ShareFile/main/",
        )
        self.assertTrue(
            MANIFEST.is_usable_external_file_url(
                "https://raw.githubusercontent.com/LetsShareAll/ShareFile/file/public/a.txt",
                raw,
            )
        )
        self.assertFalse(
            MANIFEST.is_usable_external_file_url("https://evil.example.test/a.txt", raw)
        )
        self.assertFalse(MANIFEST.is_usable_external_file_url("public/a.txt", raw))
        self.assertFalse(MANIFEST.is_usable_external_file_url(None, raw))

        self.assertEqual(
            MANIFEST.build_external_index_url(jsdelivr, False),
            "https://cdn.jsdelivr.net/gh/LetsShareAll/ShareFile@main/share-file.json",
        )
        self.assertEqual(
            MANIFEST.build_external_index_url(jsdelivr, True),
            "https://cdn.jsdelivr.net/gh/LetsShareAll/ShareFile@main/share-file.cdn.json",
        )
        self.assertEqual(
            MANIFEST.build_external_index_url(raw, True),
            "https://raw.githubusercontent.com/LetsShareAll/ShareFile/file/share-file.cdn.json",
        )
        self.assertEqual(
            MANIFEST.build_external_index_url(custom, False),
            "https://cdn-file.lssa.fun/raw.githubusercontent.com/LetsShareAll/ShareFile/main/share-file.json",
        )


if __name__ == "__main__":
    unittest.main()
