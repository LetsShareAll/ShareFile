import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CDN_BASE_URL = "https://cdn.example.test/files"


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def run_generator(fixture_root: Path, output_path: Path) -> None:
    result = subprocess.run(
        [
            sys.executable,
            str(REPO_ROOT / "packages/cli/generate-share-file.py"),
            str(fixture_root),
            str(output_path),
            "--cdn-url",
            CDN_BASE_URL,
        ],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
    )

    if result.returncode != 0:
        details = "\n".join(part for part in [result.stdout, result.stderr] if part)
        raise AssertionError(f"generate-share-file failed\n{details}")


class GenerateShareFileContractTest(unittest.TestCase):
    def test_generates_share_file_contract(self):
        with tempfile.TemporaryDirectory(prefix="share-file-contract-") as work_dir:
            fixture_root = Path(work_dir) / "fixture"
            output_path = Path(work_dir) / "generated/share-file.json"
            output_path.parent.mkdir(parents=True)

            self.create_fixture(fixture_root)
            run_generator(fixture_root, output_path)

            share_file = read_json(output_path)
            cdn_share_file = read_json(output_path.with_name("share-file.cdn.json"))

            self.assertEqual(share_file["root_id"], "root")
            self.assertEqual(share_file["path_index"]["/docs/guide.txt"], "docs/guide.txt")
            self.assertEqual(
                share_file["path_index"]["/空 白/name with space.txt"],
                "空 白/name with space.txt",
            )
            self.assertEqual(share_file["nodes"]["root"]["updated_at"], "2024-01-02T03:04:05Z")
            self.assertEqual(share_file["nodes"]["docs"]["created_at"], "2024-01-01T00:00:00Z")
            self.assertEqual(
                share_file["nodes"]["mounted"]["mount_source"],
                {
                    "provider": "github",
                    "repository": "LetsShareAll/ShareFile",
                    "branch": "file",
                    "sub_path": "/public",
                    "access_cdn": "raw",
                    "use_cdn_index": False,
                },
            )
            self.assertEqual(
                share_file["nodes"]["external-link"]["redirect_url"],
                "https://example.test/download",
            )
            self.assertNotIn("url", cdn_share_file["nodes"]["external-link"])
            self.assertEqual(
                cdn_share_file["nodes"]["空 白/name with space.txt"]["url"],
                "https://cdn.example.test/files/%E7%A9%BA%20%E7%99%BD/name%20with%20space.txt",
            )

    @staticmethod
    def create_fixture(root_dir: Path) -> None:
        (root_dir / "docs").mkdir(parents=True)
        (root_dir / "mounted").mkdir()
        (root_dir / "空 白").mkdir()

        (root_dir / "README.md").write_text("# Root\n", encoding="utf-8")
        (root_dir / "docs/guide.txt").write_text("guide\n", encoding="utf-8")
        (root_dir / "空 白/name with space.txt").write_text("space\n", encoding="utf-8")

        write_json(
            root_dir / "._info.json",
            {
                "self": {
                    "description": "根目录",
                    "updated_at": "2024-01-02T03:04:05.000Z",
                },
                "children": {
                    "README.md": {
                        "type": "file",
                        "description": "入口文档",
                        "version": "1.2.3",
                        "size": 7,
                        "md5": "d41d8cd98f00b204e9800998ecf8427e",
                        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                        "updated_at": "2024-01-02T03:04:05.000Z",
                    },
                    "docs": {
                        "type": "folder",
                        "description": "文档",
                        "hidden": False,
                    },
                    "mounted": {
                        "type": "folder",
                        "description": "外部挂载点",
                        "mount_source": {
                            "provider": "github",
                            "repository": "LetsShareAll/ShareFile",
                            "branch": "file",
                            "sub_path": "/",
                            "access_cdn": "jsdelivr",
                            "use_cdn_index": True,
                        },
                    },
                    "空 白": {
                        "type": "folder",
                        "description": "包含特殊路径字符",
                    },
                    "external-link": {
                        "type": "file",
                        "description": "外部链接",
                        "redirect": {
                            "url": "https://example.test/download",
                            "type": "confirm",
                            "confirm_message": "确认打开外部链接",
                        },
                    },
                },
            },
        )

        write_json(
            root_dir / "docs/._info.json",
            {
                "self": {
                    "description": "文档子目录",
                    "created_at": "2024-01-01T00:00:00.000Z",
                },
                "children": {
                    "guide.txt": {
                        "type": "file",
                        "description": "指南",
                        "size": 6,
                        "updated_at": "2024-01-03T00:00:00.000Z",
                    },
                },
            },
        )

        write_json(
            root_dir / "mounted/._info.json",
            {
                "self": {
                    "description": "外部挂载点 self 覆盖",
                    "mount_source": {
                        "provider": "github",
                        "repository": "LetsShareAll/ShareFile",
                        "branch": "file",
                        "sub_path": "/public",
                        "access_cdn": "raw",
                        "use_cdn_index": False,
                    },
                },
                "children": {},
            },
        )

        write_json(
            root_dir / "空 白/._info.json",
            {
                "self": {
                    "description": "特殊路径目录",
                },
                "children": {
                    "name with space.txt": {
                        "type": "file",
                        "description": "特殊路径文件",
                        "size": 6,
                    },
                },
            },
        )


if __name__ == "__main__":
    unittest.main()
