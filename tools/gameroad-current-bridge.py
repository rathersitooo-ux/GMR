#!/usr/bin/env python3
"""PC-side bridge from private GAMEROAD CURRENT to the existing Executor Bus.

This module deliberately does not select or acquire work. It transports one already
formally-acquired queue packet only after re-reading the private CURRENT lease and
current GitHub main. The packet is sent as an owner-authored [EXECUTOR] issue, so the
existing Executor Bus / FREE_LOCAL_CODER path remains the sole candidate executor.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Iterable

ROOT_DOC_ID = "14CYoFblBecfUqrnFKfdWayHsi8cnAbsrfFzNxZ0OvkY"
LEASE_SPREADSHEET_ID = "1QKCll_T9ej6K96fRkRUESCAIYVGbsCYZILGIWMUdm2Y"
LEASE_RANGE = "'CURRENT_ACTIVE_LEASES'!A1:N200"
DEFAULT_REPOSITORY = "rathersitooo-ux/GMR"
JST = dt.timezone(dt.timedelta(hours=9))
FULL_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
CONTROL_PLANE_PREFIXES = (
    ".github/workflows/",
    "data/preaction-authorizations/",
    ".git/",
)
CONTROL_PLANE_EXACT = {
    "config/zero-cash-runtime-policy.json",
    "tools/executor-bus-packet.mjs",
    ".github/workflows/gameroad-executor-bus.yml",
}
REQUIRED_PACKET_KEYS = {
    "schemaVersion",
    "kind",
    "taskId",
    "workUnitKey",
    "acquireKey",
    "baseRef",
    "exactMutableResources",
    "doNotChange",
    "userEndState",
    "realOutputTarget",
    "acceptance",
    "resumeCondition",
    "executorCapabilityHint",
}


class BridgeError(RuntimeError):
    """Fail-closed bridge error."""


def parse_jst(value: str) -> dt.datetime:
    text = str(value or "").strip()
    match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?::(\d{2}))?\s+JST", text)
    if not match:
        raise BridgeError(f"invalid_lease_until:{text}")
    second = match.group(3) or "00"
    return dt.datetime.fromisoformat(f"{match.group(1)}T{match.group(2)}:{second}").replace(tzinfo=JST)


def _string_list(value: Any, key: str) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) and item.strip() for item in value):
        raise BridgeError(f"invalid_{key}")
    return [item.strip() for item in value]


def validate_packet(packet: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(packet, dict):
        raise BridgeError("packet_not_object")
    missing = sorted(REQUIRED_PACKET_KEYS - set(packet))
    if missing:
        raise BridgeError(f"packet_missing:{','.join(missing)}")
    if packet.get("schemaVersion") != "gameroad-executor-bus-v1" or packet.get("kind") != "queue":
        raise BridgeError("packet_schema_or_kind_rejected")
    for key in ("taskId", "workUnitKey", "acquireKey", "userEndState", "realOutputTarget", "resumeCondition"):
        if not isinstance(packet.get(key), str) or not packet[key].strip():
            raise BridgeError(f"invalid_{key}")
    base_ref = str(packet.get("baseRef", "")).strip().lower()
    if not FULL_SHA_RE.fullmatch(base_ref):
        raise BridgeError("invalid_baseRef")
    packet["baseRef"] = base_ref
    resources = _string_list(packet.get("exactMutableResources"), "exactMutableResources")
    if not (1 <= len(resources) <= 8):
        raise BridgeError("mutable_resource_count_rejected")
    if len(set(resources)) != len(resources):
        raise BridgeError("duplicate_mutable_resource")
    if not any(path.startswith("tests/") and path.endswith(".test.mjs") for path in resources):
        raise BridgeError("focused_node_test_required")
    for path in resources:
        if path.startswith("/") or ".." in pathlib.PurePosixPath(path).parts or any(ch in path for ch in "*?[]"):
            raise BridgeError(f"unsafe_mutable_path:{path}")
        if path in CONTROL_PLANE_EXACT or any(path.startswith(prefix) for prefix in CONTROL_PLANE_PREFIXES):
            raise BridgeError(f"control_plane_mutation_rejected:{path}")
    _string_list(packet.get("doNotChange"), "doNotChange")
    acceptance = _string_list(packet.get("acceptance"), "acceptance")
    if not acceptance:
        raise BridgeError("acceptance_required")
    hint = str(packet.get("executorCapabilityHint", ""))
    if "FREE_LOCAL_CODER" not in hint:
        raise BridgeError("free_local_coder_opt_in_required")
    return packet


def parse_lease_table(values: list[list[Any]]) -> list[dict[str, str]]:
    header_index = None
    header: list[str] = []
    for index, row in enumerate(values):
        normalized = [str(cell or "").strip() for cell in row]
        if "AcquireKey" in normalized and "TaskID" in normalized and "WorkUnitKey" in normalized:
            header_index = index
            header = normalized
            break
    if header_index is None:
        raise BridgeError("lease_header_not_found")
    leases: list[dict[str, str]] = []
    for row in values[header_index + 1 :]:
        padded = list(row) + [""] * max(0, len(header) - len(row))
        item = {header[i]: str(padded[i] or "").strip() for i in range(len(header)) if header[i]}
        if item.get("AcquireKey"):
            leases.append(item)
    return leases


def resolve_live_lease(
    leases: Iterable[dict[str, str]], acquire_key: str, now: dt.datetime
) -> dict[str, str]:
    matches: list[dict[str, str]] = []
    for lease in leases:
        if lease.get("AcquireKey") != acquire_key:
            continue
        if lease.get("State") != "ACTIVE":
            continue
        until = parse_jst(lease.get("LeaseUntilJST", ""))
        if until <= now.astimezone(JST):
            continue
        matches.append(lease)
    if not matches:
        raise BridgeError("live_lease_not_found")
    if len(matches) != 1:
        raise BridgeError("live_lease_ambiguous")
    lease = matches[0]
    if lease.get("Authority") and lease.get("Authority") != "CURRENT_ACTIVE_LEASES":
        raise BridgeError("lease_authority_rejected")
    if lease.get("DERIVED_NON_AUTHORITY") and lease.get("DERIVED_NON_AUTHORITY") != "PASS":
        raise BridgeError("lease_derived_guard_rejected")
    return lease


def verify_packet_against_lease(packet: dict[str, Any], lease: dict[str, str]) -> None:
    expected = {
        "taskId": lease.get("TaskID", ""),
        "workUnitKey": lease.get("WorkUnitKey", ""),
        "acquireKey": lease.get("AcquireKey", ""),
    }
    for key, value in expected.items():
        if packet.get(key) != value:
            raise BridgeError(f"lease_identity_mismatch:{key}")
    scope_text = lease.get("ExactMutableResources", "")
    if not scope_text:
        raise BridgeError("lease_scope_missing")
    for path in packet["exactMutableResources"]:
        if path not in scope_text:
            raise BridgeError(f"lease_scope_mismatch:{path}")


def verify_main_sha(packet: dict[str, Any], main_sha: str) -> None:
    actual = str(main_sha or "").strip().lower()
    if not FULL_SHA_RE.fullmatch(actual):
        raise BridgeError("invalid_current_main_sha")
    if packet["baseRef"] != actual:
        raise BridgeError(f"base_moved:{packet['baseRef']}:{actual}")


def issue_marker(acquire_key: str) -> str:
    return f"<!-- gameroad-pc-current-bridge:{acquire_key} -->"


def build_executor_issue(packet: dict[str, Any]) -> tuple[str, str]:
    title = f"[EXECUTOR] {packet['workUnitKey']}"
    body = (
        f"{issue_marker(packet['acquireKey'])}\n"
        "PC bridge transport only. CURRENT remains authority.\n\n"
        "```executor-bus\n"
        f"{json.dumps(packet, ensure_ascii=False, separators=(',', ':'))}\n"
        "```\n"
    )
    return title, body


def duplicate_issue(items: Iterable[dict[str, Any]], acquire_key: str) -> int | None:
    marker = issue_marker(acquire_key)
    for item in items:
        if item.get("pull_request"):
            continue
        if str(item.get("title", "")).startswith("[EXECUTOR]") and marker in str(item.get("body", "")):
            try:
                return int(item["number"])
            except (KeyError, TypeError, ValueError):
                raise BridgeError("duplicate_issue_identity_invalid")
    return None


def prepare_dispatch(
    packet: dict[str, Any],
    lease_values: list[list[Any]],
    now: dt.datetime,
    main_sha: str,
    existing_items: Iterable[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, str], int | None]:
    packet = validate_packet(dict(packet))
    lease = resolve_live_lease(parse_lease_table(lease_values), packet["acquireKey"], now)
    verify_packet_against_lease(packet, lease)
    verify_main_sha(packet, main_sha)
    return packet, lease, duplicate_issue(existing_items, packet["acquireKey"])


def _github_json(
    method: str,
    url: str,
    token: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "gameroad-current-bridge/1",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
        raise BridgeError(f"github_request_failed:{method}:{url}:{type(exc).__name__}") from exc


def _google_current_read() -> tuple[str, list[list[Any]]]:
    try:
        import google.auth  # type: ignore
        from googleapiclient.discovery import build  # type: ignore
    except ImportError as exc:
        raise BridgeError("google_client_dependencies_missing") from exc
    scopes = [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/spreadsheets",
    ]
    try:
        credentials, _ = google.auth.default(scopes=scopes)
        docs = build("docs", "v1", credentials=credentials, cache_discovery=False)
        sheets = build("sheets", "v4", credentials=credentials, cache_discovery=False)
        root = docs.documents().get(documentId=ROOT_DOC_ID, fields="documentId,revisionId,title").execute()
        values = (
            sheets.spreadsheets()
            .values()
            .get(spreadsheetId=LEASE_SPREADSHEET_ID, range=LEASE_RANGE)
            .execute()
            .get("values", [])
        )
    except Exception as exc:  # provider errors differ across google client versions
        raise BridgeError(f"private_current_read_failed:{type(exc).__name__}") from exc
    revision = str(root.get("revisionId", "")).strip()
    if not revision:
        raise BridgeError("current_root_revision_missing")
    if not isinstance(values, list):
        raise BridgeError("lease_values_invalid")
    return revision, values


def _github_context(repository: str, token: str, acquire_key: str) -> tuple[str, list[dict[str, Any]]]:
    owner, _, repo = repository.partition("/")
    if not owner or not repo:
        raise BridgeError("invalid_repository")
    user = _github_json("GET", "https://api.github.com/user", token)
    if user.get("login") != owner:
        raise BridgeError("github_token_not_repository_owner")
    repo_data = _github_json("GET", f"https://api.github.com/repos/{owner}/{repo}", token)
    default_branch = str(repo_data.get("default_branch", "main"))
    branch = _github_json(
        "GET",
        f"https://api.github.com/repos/{owner}/{repo}/branches/{urllib.parse.quote(default_branch, safe='')}",
        token,
    )
    main_sha = str(branch.get("commit", {}).get("sha", ""))
    query = urllib.parse.urlencode({"q": f'repo:{repository} is:issue "{acquire_key}"'})
    found = _github_json("GET", f"https://api.github.com/search/issues?{query}", token)
    items = found.get("items", [])
    if not isinstance(items, list):
        raise BridgeError("github_issue_search_invalid")
    return main_sha, items


def _archive_packet(path: pathlib.Path, issue_number: int) -> pathlib.Path:
    target = path.with_name(f"{path.stem}.dispatched-{issue_number}{path.suffix}")
    if target.exists():
        raise BridgeError(f"packet_archive_exists:{target}")
    path.replace(target)
    return target


def dispatch(packet_path: pathlib.Path, repository: str, token: str) -> dict[str, Any]:
    if not token:
        raise BridgeError("github_owner_token_missing")
    try:
        packet = json.loads(packet_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BridgeError(f"packet_read_failed:{type(exc).__name__}") from exc

    root_revision, lease_values = _google_current_read()
    main_sha, existing_items = _github_context(repository, token, str(packet.get("acquireKey", "")))
    packet, lease, duplicate = prepare_dispatch(
        packet,
        lease_values,
        dt.datetime.now(tz=JST),
        main_sha,
        existing_items,
    )

    if duplicate is not None:
        archived = _archive_packet(packet_path, duplicate)
        return {
            "status": "ALREADY_DISPATCHED",
            "issueNumber": duplicate,
            "acquireKey": packet["acquireKey"],
            "mainSha": main_sha,
            "currentRootRevision": root_revision,
            "leaseUntilJst": lease.get("LeaseUntilJST"),
            "packetArchive": str(archived),
        }

    title, body = build_executor_issue(packet)
    owner, _, repo = repository.partition("/")
    issue = _github_json(
        "POST",
        f"https://api.github.com/repos/{owner}/{repo}/issues",
        token,
        {"title": title, "body": body},
    )
    try:
        issue_number = int(issue["number"])
    except (KeyError, TypeError, ValueError) as exc:
        raise BridgeError("github_issue_create_missing_number") from exc
    archived = _archive_packet(packet_path, issue_number)
    return {
        "status": "DISPATCHED",
        "issueNumber": issue_number,
        "acquireKey": packet["acquireKey"],
        "mainSha": main_sha,
        "currentRootRevision": root_revision,
        "leaseUntilJst": lease.get("LeaseUntilJST"),
        "packetArchive": str(archived),
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="GAMEROAD private CURRENT PC bridge")
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("dispatch", help="fresh-check CURRENT and dispatch one acquired packet")
    run.add_argument("--packet", required=True, type=pathlib.Path)
    run.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", DEFAULT_REPOSITORY))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "dispatch":
            token = os.environ.get("GAMEROAD_GITHUB_TOKEN", "")
            result = dispatch(args.packet, args.repo, token)
            print(json.dumps(result, ensure_ascii=False, sort_keys=True))
            return 0
        raise BridgeError("unknown_command")
    except BridgeError as exc:
        print(json.dumps({"status": "BLOCKED", "reason": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
