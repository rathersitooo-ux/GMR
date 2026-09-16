from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("fetch_x_feed.py")
SPEC = importlib.util.spec_from_file_location("fetch_x_feed", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ParseStatusUrlTests(unittest.TestCase):
    def test_x_url(self) -> None:
        self.assertEqual(
            MODULE.parse_status_url("https://x.com/example/status/1234567890"),
            ("example", "1234567890"),
        )

    def test_twitter_url_with_query(self) -> None:
        self.assertEqual(
            MODULE.parse_status_url("https://twitter.com/example/status/1234567890?s=20"),
            ("example", "1234567890"),
        )

    def test_fx_url(self) -> None:
        self.assertEqual(
            MODULE.parse_status_url("https://fxtwitter.com/example/status/1234567890"),
            ("example", "1234567890"),
        )

    def test_invalid_url(self) -> None:
        with self.assertRaises(MODULE.TargetError):
            MODULE.parse_status_url("https://x.com/example")

    def test_targets_file_ignores_comments_and_blank_lines(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            path = Path(tempdir) / "targets.txt"
            path.write_text(
                "# comment\n\nhttps://x.com/a/status/1\nhttps://x.com/a/status/1\n",
                encoding="utf-8",
            )
            self.assertEqual(
                MODULE.load_targets(path),
                ["https://x.com/a/status/1", "https://x.com/a/status/1"],
            )
            self.assertEqual(
                MODULE.dedupe(MODULE.load_targets(path)),
                ["https://x.com/a/status/1"],
            )


if __name__ == "__main__":
    unittest.main()
