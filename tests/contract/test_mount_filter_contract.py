import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CLI_DIR = REPO_ROOT / "packages/cli"

sys.path.insert(0, str(CLI_DIR))

from lib.mount_filter import (  # noqa: E402
    get_path_prefixes,
    is_external_path_allowed,
    matches_path_prefix,
    normalize_path_prefix,
)


class MountPathFilterContractTest(unittest.TestCase):
    def test_prefix_matches_itself_and_descendants_only(self):
        self.assertTrue(matches_path_prefix("/a", "/a"))
        self.assertTrue(matches_path_prefix("/a/b", "/a"))
        self.assertTrue(matches_path_prefix("/a/b/c", "/a"))
        self.assertFalse(matches_path_prefix("/ab", "/a"))
        self.assertFalse(matches_path_prefix("/a-b", "/a"))
        self.assertFalse(matches_path_prefix("/", "/a"))

    def test_root_prefix_covers_whole_source(self):
        """x = "/" 视为整个源，命中任意层级（与前端 pathRules 一致）。"""
        self.assertTrue(matches_path_prefix("/", "/"))
        self.assertTrue(matches_path_prefix("/a", "/"))
        self.assertTrue(matches_path_prefix("/a/b/c", "/"))

    def test_deny_wins_over_allow(self):
        mount_source = {"allow_paths": ["/a"], "deny_paths": ["/a/b"]}

        self.assertTrue(is_external_path_allowed("/a", mount_source))
        self.assertTrue(is_external_path_allowed("/a/c", mount_source))
        self.assertFalse(is_external_path_allowed("/a/b", mount_source))
        self.assertFalse(is_external_path_allowed("/a/b/c", mount_source))

    def test_allow_list_present_but_not_matched_is_denied(self):
        mount_source = {"allow_paths": ["/a"]}

        self.assertTrue(is_external_path_allowed("/a", mount_source))
        self.assertTrue(is_external_path_allowed("/a/b", mount_source))
        self.assertFalse(is_external_path_allowed("/ab", mount_source))
        self.assertFalse(is_external_path_allowed("/", mount_source))

    def test_empty_or_missing_lists_do_not_restrict(self):
        for mount_source in (
            {},
            {"allow_paths": [], "deny_paths": []},
            {"allow_paths": None, "deny_paths": None},
            {"allow_paths": " ", "deny_paths": []},
            None,
        ):
            with self.subTest(mount_source=mount_source):
                self.assertTrue(is_external_path_allowed("/anything", mount_source))

    def test_deny_root_path_rejects_whole_source(self):
        deny_all = {"deny_paths": ["/"]}

        self.assertFalse(is_external_path_allowed("/", deny_all))
        self.assertFalse(is_external_path_allowed("/a", deny_all))
        self.assertFalse(is_external_path_allowed("/a/b", deny_all))

        allow_all = {"allow_paths": ["/"]}

        self.assertTrue(is_external_path_allowed("/", allow_all))
        self.assertTrue(is_external_path_allowed("/a", allow_all))
        self.assertTrue(is_external_path_allowed("/a/b", allow_all))

    def test_prefixes_are_normalized_and_invalid_entries_ignored(self):
        self.assertEqual(normalize_path_prefix("/private/"), "/private")
        self.assertEqual(normalize_path_prefix("private"), "/private")
        self.assertEqual(normalize_path_prefix(" /a/b/ "), "/a/b")
        self.assertEqual(normalize_path_prefix("/"), "/")
        self.assertIsNone(normalize_path_prefix(None))
        self.assertIsNone(normalize_path_prefix(3))

        self.assertEqual(
            get_path_prefixes({"deny_paths": ["private/", " /x ", 3, "", "/private"]}, "deny_paths"),
            ["/private", "/x"],
        )
        self.assertEqual(get_path_prefixes({"deny_paths": "/private"}, "deny_paths"), [])
        self.assertEqual(get_path_prefixes(None, "deny_paths"), [])

        self.assertTrue(is_external_path_allowed("/private/x", {"deny_paths": "private"}))
        self.assertTrue(is_external_path_allowed("/private/x", {"deny_paths": ["/other"]}))


if __name__ == "__main__":
    unittest.main()
