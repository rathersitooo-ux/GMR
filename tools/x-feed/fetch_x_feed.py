#!/usr/bin/env python3
"""Fetch public X posts without an X API key via FxTwitter's public JSON API."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TARGETS = ROOT / "tools" / "x-feed" / "targets.txt"
DEFAULT_OUTPUT = ROOT / "data" / "x_feed.json"

STATUS_RE = re.compile(
    r"^https?://(?:www\.)?(?:x\.com|twitter\.com|fxtwitter\.com|fixupx\.com)/"
    r"(?P<username>[^/?#]+)/status/(?P<status_id>\d+)(?:[/?#].*)?$",
    re.IGNORECASE,
)


class TargetError(ValueError):
    """Raised when a target is not a supported public X status URL."""


def parse_status_url(url: str) -> tuple[str, str]:
    candidate = url.strip()
    match = STATUS_RE.match(candidate)
    if not match:
        raise TargetError(
            "expected a public X/Twitter status URL like "
            "https://x.com/user/status/1234567890"
        )
    return match.group("username"), match.group("status_id")


def load_targets(path: Path) -> list[str]:
    if not path.exists():
        return []
    targets: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        value = raw.strip()
        if not value or value.startswith("#"):
            continue
        targets.append(value)
    return targets


def dedupe(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def fetch_one(url: str, timeout: float = 20.0) -> dict:
    username, status_id = parse_status_url(url)
    api_url = f"https://api.fxtwitter.com/{username}/status/{status_id}"
    request = Request(
        api_url,
        headers={
            "Accept": "application/json",
            "User-Agent": "GMR-X-Free-Bridge/1.0 (+https://github.com/rathersitooo-ux/GMR)",
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f"FxTwitter returned HTTP {exc.code}") from exc
    except (URLError, TimeoutError) as exc:
        raise RuntimeError(f"FxTwitter request failed: {exc}") from exc

    return {
        "requested_url": url,
        "canonical_url": f"https://x.com/{username}/status/{status_id}",
        "provider_url": api_url,
        "tweet": payload.get("tweet", payload),
    }


def build_feed(targets: list[str], timeout: float = 20.0) -> tuple[dict, bool]:
    items: list[dict] = []
    errors: list[dict] = []

    for target in dedupe(targets):
        try:
            items.append(fetch_one(target, timeout=timeout))
        except (TargetError, RuntimeError, json.JSONDecodeError) as exc:
            errors.append({"target": target, "error": str(exc)})

    document = {
        "version": 1,
        "updated_at_utc": datetime.now(timezone.utc).isoformat(),
        "provider": "FxTwitter",
        "items": items,
        "errors": errors,
    }
    return document, not errors


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch public X status URLs into data/x_feed.json without an X API key."
    )
    parser.add_argument(
        "--target",
        action="append",
        default=[],
        help="X/Twitter status URL. May be repeated.",
    )
    parser.add_argument(
        "--targets-file",
        type=Path,
        default=DEFAULT_TARGETS,
        help=f"Text file containing one status URL per line (default: {DEFAULT_TARGETS}).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output JSON file (default: {DEFAULT_OUTPUT}).",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=20.0,
        help="HTTP timeout in seconds (default: 20).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    targets = load_targets(args.targets_file) + list(args.target)
    feed, ok = build_feed(targets, timeout=args.timeout)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(feed, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"wrote {len(feed['items'])} post(s), {len(feed['errors'])} error(s) "
        f"to {args.output}"
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
