#!/usr/bin/env python3
"""Trusted Windows supervisor for one bounded GAMEROAD CURRENT work packet.

The bridge does not invent game work. It supervises one locally supplied Executor Bus
queue packet through:
  private CURRENT acquire -> existing Executor Bus -> returned FREE_LOCAL_CODER
  candidate -> fresh CURRENT adoption branch -> existing Required Gate/auto-merge
  -> private CURRENT release.

Private CURRENT is never mirrored into GitHub. Credentials stay machine-local.
"""

from __future__ import annotations

import argparse
import base64
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
LEASE_RANGE = "'CURRENT_ACTIVE_LEASES'!A1:O200"
DEFAULT_REPOSITORY = "rathersitooo-ux/GMR"
JST = dt.timezone(dt.timedelta(hours=9))
FULL_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
STATE_MODEL_VERSION = "STATE_MODEL_V1"
LEASE_AUTHORITY = "CURRENT_ACTIVE_LEASES"
LEASE_MINUTES = 60
RENEW_BELOW_MINUTES = 50
PREACTION_PREFIX = "data/preaction-authorizations/"
CONTROL_PLANE_PREFIXES = (
    ".github/workflows/",
    "data/preaction-authorizations/",
    ".git/",
)
CONTROL_PLANE_EXACT = {
    "config/zero-cash-runtime-policy.json",
    "tools/executor-bus-packet.mjs",
    ".github/workflows/gameroad-executor-bus.yml",
    ".github/workflows/gameroad-required-gate.yml",
    "tools/preaction-authorization-validator.mjs",
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
LEASE_COLUMNS = [
    "AcquireKey",
    "TaskID",
    "WorkUnitKey",
    "Owner",
    "LeaseUntilJST",
    "ExactMutableResources",
    "AcquiredAtJST",
    "State",
    "Origin",
    "StateModelVersion",
    "LastResolvedJST",
    "Note",
    "Authority",
    "DERIVED_NON_AUTHORITY",
    "AcquireEventBacking",
]


class BridgeError(RuntimeError):
    """Fail-closed bridge error."""


def jst_minute(value: dt.datetime) -> str:
    return value.astimezone(JST).strftime("%Y-%m-%d %H:%M JST")


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
    if "FREE_LOCAL_CODER" not in str(packet.get("executorCapabilityHint", "")):
        raise BridgeError("free_local_coder_opt_in_required")
    return packet


def _header_location(values: list[list[Any]]) -> tuple[int, list[str]]:
    for index, row in enumerate(values):
        normalized = [str(cell or "").strip() for cell in row]
        if "AcquireKey" in normalized and "TaskID" in normalized and "WorkUnitKey" in normalized:
            return index, normalized
    raise BridgeError("lease_header_not_found")


def parse_lease_table_rows(values: list[list[Any]]) -> list[tuple[int, dict[str, str]]]:
    header_index, header = _header_location(values)
    leases: list[tuple[int, dict[str, str]]] = []
    for index, row in enumerate(values[header_index + 1 :], start=header_index + 1):
        padded = list(row) + [""] * max(0, len(header) - len(row))
        item = {header[i]: str(padded[i] or "").strip() for i in range(len(header)) if header[i]}
        if item.get("AcquireKey"):
            leases.append((index + 1, item))
    return leases


def parse_lease_table(values: list[list[Any]]) -> list[dict[str, str]]:
    return [lease for _, lease in parse_lease_table_rows(values)]


def first_blank_lease_row(values: list[list[Any]], max_row: int = 200) -> int:
    header_index, _ = _header_location(values)
    occupied = {row for row, _ in parse_lease_table_rows(values)}
    for row_number in range(header_index + 2, max_row + 1):
        if row_number not in occupied:
            return row_number
    raise BridgeError("lease_table_full")


def active_lease_rows(
    leases: Iterable[tuple[int, dict[str, str]]], now: dt.datetime
) -> list[tuple[int, dict[str, str]]]:
    out = []
    now_jst = now.astimezone(JST)
    for row_number, lease in leases:
        if lease.get("State") != "ACTIVE":
            continue
        try:
            until = parse_jst(lease.get("LeaseUntilJST", ""))
        except BridgeError:
            continue
        if until > now_jst:
            out.append((row_number, lease))
    return out


def resolve_live_lease_row(
    leases: Iterable[tuple[int, dict[str, str]]], acquire_key: str, now: dt.datetime
) -> tuple[int, dict[str, str]]:
    matches = [(row, lease) for row, lease in active_lease_rows(leases, now) if lease.get("AcquireKey") == acquire_key]
    if not matches:
        raise BridgeError("live_lease_not_found")
    if len(matches) != 1:
        raise BridgeError("live_lease_ambiguous")
    row, lease = matches[0]
    if lease.get("Authority") and lease.get("Authority") != LEASE_AUTHORITY:
        raise BridgeError("lease_authority_rejected")
    if lease.get("DERIVED_NON_AUTHORITY") and lease.get("DERIVED_NON_AUTHORITY") != "PASS":
        raise BridgeError("lease_derived_guard_rejected")
    if lease.get("AcquireEventBacking") != lease_event_backing(acquire_key):
        raise BridgeError("lease_event_backing_marker_rejected")
    return row, lease


def resolve_owned_lease_row(
    leases: Iterable[tuple[int, dict[str, str]]], acquire_key: str
) -> tuple[int, dict[str, str]]:
    matches = [(row, lease) for row, lease in leases if lease.get("AcquireKey") == acquire_key]
    if not matches:
        raise BridgeError("owned_lease_row_not_found")
    if len(matches) != 1:
        raise BridgeError("owned_lease_row_ambiguous")
    row, lease = matches[0]
    if lease.get("State") != "ACTIVE":
        raise BridgeError("owned_lease_state_not_active")
    if lease.get("Authority") and lease.get("Authority") != LEASE_AUTHORITY:
        raise BridgeError("lease_authority_rejected")
    if lease.get("DERIVED_NON_AUTHORITY") and lease.get("DERIVED_NON_AUTHORITY") != "PASS":
        raise BridgeError("lease_derived_guard_rejected")
    if lease.get("AcquireEventBacking") != lease_event_backing(acquire_key):
        raise BridgeError("lease_event_backing_marker_rejected")
    return row, lease


def resolve_live_lease(
    leases: Iterable[dict[str, str]], acquire_key: str, now: dt.datetime
) -> dict[str, str]:
    wrapped = list(enumerate(leases, start=1))
    return resolve_live_lease_row(wrapped, acquire_key, now)[1]


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


def resource_conflicts(
    packet: dict[str, Any],
    leases: Iterable[tuple[int, dict[str, str]]],
    now: dt.datetime,
) -> list[str]:
    conflicts: list[str] = []
    for _, lease in active_lease_rows(leases, now):
        if lease.get("AcquireKey") == packet["acquireKey"]:
            continue
        scope = lease.get("ExactMutableResources", "")
        for path in packet["exactMutableResources"]:
            if path in scope:
                conflicts.append(f"{lease.get('AcquireKey')}:{path}")
    return sorted(set(conflicts))


def current_event_ledger_id(values: list[list[Any]]) -> str:
    for row in values:
        if row and str(row[0]).strip() == "CurrentEventHistoryLedger":
            if len(row) < 2 or not str(row[1]).strip():
                break
            return str(row[1]).strip()
    raise BridgeError("current_event_ledger_pointer_missing")


def acquire_key_seen(event_text: str, acquire_key: str) -> bool:
    return f"AcquireKey={acquire_key}]" in event_text or f"AcquireKey={acquire_key}\n" in event_text


def acquire_event_seen(event_text: str, acquire_key: str) -> bool:
    pattern = (
        r"\[STATE_MODEL_V1\]\[EVENT=ACQUIRE\][^\n]*"
        + re.escape(f"[AcquireKey={acquire_key}]")
    )
    return re.search(pattern, event_text or "") is not None


def lease_event_backing(acquire_key: str) -> str:
    return f"R24_ACQUIRE_PRESENT:{acquire_key}"


def verify_lease_event_backing(lease: dict[str, str], event_text: str) -> None:
    acquire_key = lease.get("AcquireKey", "")
    if not acquire_key:
        raise BridgeError("lease_acquire_key_missing")
    if lease.get("AcquireEventBacking") != lease_event_backing(acquire_key):
        raise BridgeError("lease_event_backing_marker_rejected")
    if not acquire_event_seen(event_text, acquire_key):
        raise BridgeError("lease_acquire_event_missing")


def prepare_acquire(
    packet: dict[str, Any],
    lease_values: list[list[Any]],
    event_text: str,
    now: dt.datetime,
    main_sha: str,
) -> tuple[dict[str, Any], int, dt.datetime]:
    packet = validate_packet(dict(packet))
    verify_main_sha(packet, main_sha)
    rows = parse_lease_table_rows(lease_values)
    if any(lease.get("AcquireKey") == packet["acquireKey"] for _, lease in rows):
        raise BridgeError("acquire_key_already_in_lease_table")
    if acquire_key_seen(event_text, packet["acquireKey"]):
        raise BridgeError("acquire_key_reuse_rejected")
    conflicts = resource_conflicts(packet, rows, now)
    if conflicts:
        raise BridgeError(f"active_scope_conflict:{','.join(conflicts)}")
    return packet, first_blank_lease_row(lease_values), now.astimezone(JST) + dt.timedelta(minutes=LEASE_MINUTES)


def prepare_dispatch(
    packet: dict[str, Any],
    lease_values: list[list[Any]],
    now: dt.datetime,
    main_sha: str,
    existing_items: Iterable[dict[str, Any]],
    event_text: str | None = None,
) -> tuple[dict[str, Any], dict[str, str], int | None]:
    packet = validate_packet(dict(packet))
    _, lease = resolve_live_lease_row(parse_lease_table_rows(lease_values), packet["acquireKey"], now)
    if event_text is not None:
        verify_lease_event_backing(lease, event_text)
    verify_packet_against_lease(packet, lease)
    verify_main_sha(packet, main_sha)
    return packet, lease, duplicate_issue(existing_items, packet["acquireKey"])


def lease_scope_text(packet: dict[str, Any]) -> str:
    paths = "; ".join(packet["exactMutableResources"])
    return (
        f"{paths}; own transient PRE_ACTION witness; own candidate/adoption branch/PR/check/merge/readback; "
        "own CURRENT event/lease records"
    )


def build_lease_row(
    packet: dict[str, Any],
    now: dt.datetime,
    until: dt.datetime,
    *,
    owner: str = "GAMEROAD PC CURRENT Bridge / trusted Windows supervisor",
) -> list[str]:
    at = jst_minute(now)
    return [
        packet["acquireKey"],
        packet["taskId"],
        packet["workUnitKey"],
        owner,
        jst_minute(until),
        lease_scope_text(packet),
        at,
        "ACTIVE",
        "NONCHAT_PC_CURRENT_AUTOPILOT / EXISTING_EXECUTOR_BUS",
        STATE_MODEL_VERSION,
        at,
        "One bounded packet only; fresh CURRENT before dispatch/adoption/release; no CURRENT mirror; no gate weakening.",
        LEASE_AUTHORITY,
        "PASS",
        lease_event_backing(packet["acquireKey"]),
    ]


def build_acquire_event(packet: dict[str, Any], now: dt.datetime, until: dt.datetime) -> str:
    return (
        f"\n[STATE_MODEL_V1][EVENT=ACQUIRE][At={jst_minute(now)}]"
        f"[TaskID={packet['taskId']}][WorkUnitKey={packet['workUnitKey']}][AcquireKey={packet['acquireKey']}]\n"
        "Owner=GAMEROAD PC CURRENT Bridge / trusted Windows supervisor\n"
        f"LeaseUntilJST={jst_minute(until)}\n"
        f"ExactMutableResources={lease_scope_text(packet)}\n"
        "Origin=NONCHAT_PC_CURRENT_AUTOPILOT / EXISTING_EXECUTOR_BUS\n"
        "State=ACTIVE\n"
    )


def build_renew_event(packet: dict[str, Any], now: dt.datetime, until: dt.datetime) -> str:
    return (
        f"\n[STATE_MODEL_V1][EVENT=LEASE_RENEW][At={jst_minute(now)}]"
        f"[TaskID={packet['taskId']}][WorkUnitKey={packet['workUnitKey']}][AcquireKey={packet['acquireKey']}]\n"
        f"LeaseUntilJST={jst_minute(until)}\n"
        "State=ACTIVE\n"
        "Reason=keep exact acquired packet live through fresh adoption evidence; scope unchanged\n"
    )


def build_release_event(packet: dict[str, Any], now: dt.datetime, reason: str, evidence: str = "") -> str:
    lines = [
        f"\n[STATE_MODEL_V1][EVENT=RELEASE][At={jst_minute(now)}]"
        f"[TaskID={packet['taskId']}][WorkUnitKey={packet['workUnitKey']}][AcquireKey={packet['acquireKey']}]",
        "State=RELEASED",
        f"Reason={reason}",
    ]
    if evidence:
        lines.append(f"Evidence={evidence}")
    return "\n".join(lines) + "\n"


def issue_marker(acquire_key: str) -> str:
    return f"<!-- gameroad-pc-current-bridge:{acquire_key} -->"


def adoption_marker(acquire_key: str) -> str:
    return f"<!-- gameroad-pc-current-adoption:{acquire_key} -->"


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


def find_adoption_pr(items: Iterable[dict[str, Any]], acquire_key: str) -> int | None:
    marker = adoption_marker(acquire_key)
    for item in items:
        if not item.get("pull_request"):
            continue
        if marker in str(item.get("body", "")):
            try:
                return int(item["number"])
            except (KeyError, TypeError, ValueError):
                raise BridgeError("adoption_pr_identity_invalid")
    return None


def parse_executor_result_comment(body: str, packet: dict[str, Any]) -> dict[str, Any] | None:
    match = re.search(r"```executor-result\s*\n([\s\S]*?)\n```", body or "")
    if not match:
        return None
    try:
        result = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None
    if not isinstance(result, dict) or result.get("status") != "RETURNED":
        return None
    for key in ("taskId", "workUnitKey", "acquireKey"):
        if result.get(key) != packet.get(key):
            return None
    refs = result.get("producedRefs")
    if not isinstance(refs, list):
        return None
    pr_numbers = [
        int(match.group(1))
        for ref in refs
        if isinstance(ref, str) and (match := re.fullmatch(r"pr:([1-9]\d*)", ref))
    ]
    commits = [
        match.group(1).lower()
        for ref in refs
        if isinstance(ref, str) and (match := re.fullmatch(r"commit:([0-9a-fA-F]{40})", ref))
    ]
    if len(pr_numbers) != 1 or len(commits) != 1:
        return None
    return {"pr": pr_numbers[0], "commit": commits[0], "raw": result}


def _github_json(
    method: str,
    url: str,
    token: str,
    payload: dict[str, Any] | None = None,
) -> Any:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "gameroad-current-bridge/2",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
        raise BridgeError(f"github_request_failed:{method}:{url}:{type(exc).__name__}") from exc


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
    main_sha = str(branch.get("commit", {}).get("sha", "")).lower()
    query = urllib.parse.urlencode({"q": f'repo:{repository} "{acquire_key}"'})
    found = _github_json("GET", f"https://api.github.com/search/issues?{query}", token)
    items = found.get("items", []) if isinstance(found, dict) else []
    if not isinstance(items, list):
        raise BridgeError("github_issue_search_invalid")
    return main_sha, items


def _github_issue_comments(repository: str, issue_number: int, token: str) -> list[dict[str, Any]]:
    data = _github_json(
        "GET",
        f"https://api.github.com/repos/{repository}/issues/{issue_number}/comments?per_page=100",
        token,
    )
    if not isinstance(data, list):
        raise BridgeError("github_issue_comments_invalid")
    return data


def _extract_doc_text(document: dict[str, Any]) -> str:
    parts: list[str] = []
    for item in document.get("body", {}).get("content", []):
        paragraph = item.get("paragraph")
        if not isinstance(paragraph, dict):
            continue
        for element in paragraph.get("elements", []):
            run = element.get("textRun")
            if isinstance(run, dict):
                parts.append(str(run.get("content", "")))
    return "".join(parts)


def _google_clients():
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
        return docs, sheets
    except Exception as exc:
        raise BridgeError(f"private_current_client_failed:{type(exc).__name__}") from exc


def _google_current_read() -> dict[str, Any]:
    docs, sheets = _google_clients()
    try:
        root = docs.documents().get(documentId=ROOT_DOC_ID, fields="documentId,revisionId,title").execute()
        values = (
            sheets.spreadsheets()
            .values()
            .get(spreadsheetId=LEASE_SPREADSHEET_ID, range=LEASE_RANGE)
            .execute()
            .get("values", [])
        )
        if not isinstance(values, list):
            raise BridgeError("lease_values_invalid")
        ledger_id = current_event_ledger_id(values)
        ledger = docs.documents().get(documentId=ledger_id).execute()
    except BridgeError:
        raise
    except Exception as exc:
        raise BridgeError(f"private_current_read_failed:{type(exc).__name__}") from exc
    root_revision = str(root.get("revisionId", "")).strip()
    ledger_revision = str(ledger.get("revisionId", "")).strip()
    if not root_revision or not ledger_revision:
        raise BridgeError("current_revision_missing")
    return {
        "docs": docs,
        "sheets": sheets,
        "rootRevision": root_revision,
        "leaseValues": values,
        "ledgerId": ledger_id,
        "ledgerRevision": ledger_revision,
        "ledgerText": _extract_doc_text(ledger),
    }


def _append_event(current: dict[str, Any], text: str) -> None:
    try:
        (
            current["docs"]
            .documents()
            .batchUpdate(
                documentId=current["ledgerId"],
                body={
                    "requests": [{"insertText": {"endOfSegmentLocation": {}, "text": text}}],
                    "writeControl": {"requiredRevisionId": current["ledgerRevision"]},
                },
            )
            .execute()
        )
    except Exception as exc:
        raise BridgeError(f"current_event_write_failed:{type(exc).__name__}") from exc


def _write_lease_row(current: dict[str, Any], row_number: int, row: list[str]) -> None:
    if len(row) != len(LEASE_COLUMNS):
        raise BridgeError("lease_row_width")
    range_name = f"'CURRENT_ACTIVE_LEASES'!A{row_number}:O{row_number}"
    try:
        (
            current["sheets"]
            .spreadsheets()
            .values()
            .update(
                spreadsheetId=LEASE_SPREADSHEET_ID,
                range=range_name,
                valueInputOption="RAW",
                body={"values": [row]},
            )
            .execute()
        )
        readback = (
            current["sheets"]
            .spreadsheets()
            .values()
            .get(spreadsheetId=LEASE_SPREADSHEET_ID, range=range_name)
            .execute()
            .get("values", [])
        )
    except Exception as exc:
        raise BridgeError(f"lease_write_failed:{type(exc).__name__}") from exc
    actual = [str(value) for value in (readback[0] if readback else [])]
    if actual != row:
        raise BridgeError("lease_readback_mismatch")


def _clear_lease_row(current: dict[str, Any], row_number: int) -> None:
    range_name = f"'CURRENT_ACTIVE_LEASES'!A{row_number}:O{row_number}"
    try:
        (
            current["sheets"]
            .spreadsheets()
            .values()
            .clear(spreadsheetId=LEASE_SPREADSHEET_ID, range=range_name, body={})
            .execute()
        )
        readback = (
            current["sheets"]
            .spreadsheets()
            .values()
            .get(spreadsheetId=LEASE_SPREADSHEET_ID, range=range_name)
            .execute()
            .get("values", [])
        )
    except Exception as exc:
        raise BridgeError(f"lease_clear_failed:{type(exc).__name__}") from exc
    if readback:
        raise BridgeError("lease_clear_readback_mismatch")


def acquire_lease(packet: dict[str, Any], repository: str, token: str) -> dict[str, Any]:
    now = dt.datetime.now(tz=JST)
    current = _google_current_read()
    main_sha, _ = _github_context(repository, token, packet["acquireKey"])
    packet, row_number, until = prepare_acquire(
        packet, current["leaseValues"], current["ledgerText"], now, main_sha
    )
    _append_event(current, build_acquire_event(packet, now, until))
    row = build_lease_row(packet, now, until)
    _write_lease_row(current, row_number, row)
    return {"row": row_number, "leaseUntilJst": jst_minute(until), "mainSha": main_sha}


def renew_lease_if_needed(
    packet: dict[str, Any],
    current: dict[str, Any],
    row_number: int,
    lease: dict[str, str],
    now: dt.datetime,
) -> tuple[dict[str, Any], int, dict[str, str]]:
    verify_lease_event_backing(lease, current["ledgerText"])
    until = parse_jst(lease["LeaseUntilJST"])
    if until - now.astimezone(JST) >= dt.timedelta(minutes=RENEW_BELOW_MINUTES):
        return current, row_number, lease
    renewed_until = now.astimezone(JST) + dt.timedelta(minutes=LEASE_MINUTES)
    _append_event(current, build_renew_event(packet, now, renewed_until))
    row = [lease.get(key, "") for key in LEASE_COLUMNS]
    row[4] = jst_minute(renewed_until)
    row[10] = jst_minute(now)
    row[11] = "Lease renewed with unchanged exact scope for candidate adoption/Gate completion."
    _write_lease_row(current, row_number, row)
    fresh = _google_current_read()
    fresh_row, fresh_lease = resolve_live_lease_row(
        parse_lease_table_rows(fresh["leaseValues"]), packet["acquireKey"], now
    )
    return fresh, fresh_row, fresh_lease


def ensure_executor_issue(
    packet: dict[str, Any],
    repository: str,
    token: str,
    current: dict[str, Any],
    main_sha: str,
    items: list[dict[str, Any]],
) -> int:
    packet, _, duplicate = prepare_dispatch(
        packet,
        current["leaseValues"],
        dt.datetime.now(tz=JST),
        main_sha,
        items,
        current["ledgerText"],
    )
    if duplicate is not None:
        return duplicate
    title, body = build_executor_issue(packet)
    issue = _github_json(
        "POST",
        f"https://api.github.com/repos/{repository}/issues",
        token,
        {"title": title, "body": body},
    )
    try:
        return int(issue["number"])
    except (KeyError, TypeError, ValueError) as exc:
        raise BridgeError("github_issue_create_missing_number") from exc


def _candidate_result(
    repository: str, issue_number: int, packet: dict[str, Any], token: str
) -> dict[str, Any] | None:
    for comment in reversed(_github_issue_comments(repository, issue_number, token)):
        result = parse_executor_result_comment(str(comment.get("body", "")), packet)
        if result:
            return result
    return None


def _pr_files(repository: str, pr_number: int, token: str) -> list[dict[str, Any]]:
    data = _github_json(
        "GET", f"https://api.github.com/repos/{repository}/pulls/{pr_number}/files?per_page=100", token
    )
    if not isinstance(data, list):
        raise BridgeError("candidate_pr_files_invalid")
    return data


def verify_candidate_pr(
    packet: dict[str, Any], repository: str, token: str, candidate: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    pr = _github_json("GET", f"https://api.github.com/repos/{repository}/pulls/{candidate['pr']}", token)
    if str(pr.get("head", {}).get("sha", "")).lower() != candidate["commit"]:
        raise BridgeError("candidate_commit_ref_mismatch")
    if str(pr.get("base", {}).get("sha", "")).lower() != packet["baseRef"]:
        raise BridgeError("candidate_base_mismatch")
    files = _pr_files(repository, candidate["pr"], token)
    changed = [str(item.get("filename", "")) for item in files]
    if not changed:
        raise BridgeError("candidate_has_no_changed_paths")
    allowed = set(packet["exactMutableResources"])
    outside = sorted(path for path in changed if path not in allowed)
    for item in files:
        if item.get("status") == "renamed" and str(item.get("previous_filename", "")) not in allowed:
            outside.append(str(item.get("previous_filename", "")))
    if outside:
        raise BridgeError(f"candidate_path_out_of_scope:{','.join(sorted(set(outside)))}")
    return pr, files


def _sanitize_branch(acquire_key: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", acquire_key).strip("-").lower()
    return f"work/pc-current-adopt-{slug[-48:]}"


def _preaction_record_id(acquire_key: str) -> str:
    return f"PCADOPT-{acquire_key}"


def build_adoption_manifest(
    packet: dict[str, Any],
    lease: dict[str, str],
    lease_row: int,
    now: dt.datetime,
    candidate_pr: int,
) -> tuple[str, dict[str, Any]]:
    record_id = _preaction_record_id(packet["acquireKey"])
    path = f"{PREACTION_PREFIX}{record_id}.json"
    manifest = {
        "schemaVersion": "gameroad-preaction-v3",
        "recordId": record_id,
        "taskId": packet["taskId"],
        "workUnitKey": packet["workUnitKey"],
        "acquireKey": packet["acquireKey"],
        "riskClass": "HIGH_CONSEQUENCE",
        "predictionStatus": "PASS",
        "predictionEvidenceId": f"pc-bridge-fresh-current-before-adoption-pr-{candidate_pr}",
        "rehearsalStatus": "N_A_ALT_ORACLE",
        "rehearsalEvidenceId": f"free-local-coder-focused-tests-returned-pr-{candidate_pr}",
        "proceedToken": (
            f"PROCEED|{record_id}|PREACTION_PROCEED_ALLOWED|HIGH_CONSEQUENCE|"
            "fresh-private-current|returned-bounded-candidate"
        ),
        "authorizationBaseSha": packet["baseRef"],
        "stateModelVersion": STATE_MODEL_VERSION,
        "leaseAuthority": LEASE_AUTHORITY,
        "leaseState": "ACTIVE",
        "leaseTaskId": packet["taskId"],
        "leaseWorkUnitKey": packet["workUnitKey"],
        "leaseAcquireKey": packet["acquireKey"],
        "leaseSnapshotReadbackAtJst": jst_minute(now),
        "leaseUntilJst": lease["LeaseUntilJST"],
        "leaseSnapshotReadbackRef": f"CURRENT_ACTIVE_LEASES!A{lease_row}:O{lease_row}",
        "leaseExactMutableResources": lease["ExactMutableResources"],
        "scope": list(packet["exactMutableResources"]),
        "leaseScope": list(packet["exactMutableResources"]),
        "solutionSignature": (
            "Adopt the exact bounded FREE_LOCAL_CODER candidate only after a fresh private CURRENT "
            "lease/main readback, then defer merge to the existing Required Gate auto-merge lane."
        ),
        "reuseDisposition": "ADAPT",
        "solutionSearchStatus": "PASS",
        "reuseDecisionEvidenceId": f"returned-free-local-coder-candidate-pr-{candidate_pr}",
        "solutionSearchEvidence": [
            f"FREE_LOCAL_CODER returned candidate PR #{candidate_pr}",
            "fresh CURRENT_ACTIVE_LEASES readback immediately before adoption",
            "existing GAMEROAD Required Gate and auto-merge remain authoritative",
        ],
    }
    return path, manifest


def _put_contents(
    repository: str,
    branch: str,
    path: str,
    content: str,
    message: str,
    token: str,
) -> str:
    result = _github_json(
        "PUT",
        f"https://api.github.com/repos/{repository}/contents/{urllib.parse.quote(path, safe='/')}",
        token,
        {
            "message": message,
            "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
            "branch": branch,
        },
    )
    sha = str(result.get("commit", {}).get("sha", "")).lower()
    if not FULL_SHA_RE.fullmatch(sha):
        raise BridgeError("github_contents_commit_missing_sha")
    return sha


def _create_ref(repository: str, branch: str, sha: str, token: str) -> None:
    _github_json(
        "POST",
        f"https://api.github.com/repos/{repository}/git/refs",
        token,
        {"ref": f"refs/heads/{branch}", "sha": sha},
    )


def _update_ref(repository: str, branch: str, sha: str, token: str) -> None:
    _github_json(
        "PATCH",
        f"https://api.github.com/repos/{repository}/git/refs/heads/{urllib.parse.quote(branch, safe='')}",
        token,
        {"sha": sha, "force": False},
    )


def _copy_candidate_tree_commit(
    packet: dict[str, Any],
    repository: str,
    token: str,
    candidate_pr: dict[str, Any],
    files: list[dict[str, Any]],
    manifest_commit: str,
    branch: str,
) -> str:
    manifest_commit_data = _github_json(
        "GET", f"https://api.github.com/repos/{repository}/git/commits/{manifest_commit}", token
    )
    base_tree = str(manifest_commit_data.get("tree", {}).get("sha", ""))
    candidate_head = str(candidate_pr.get("head", {}).get("sha", ""))
    candidate_commit = _github_json(
        "GET", f"https://api.github.com/repos/{repository}/git/commits/{candidate_head}", token
    )
    candidate_tree_sha = str(candidate_commit.get("tree", {}).get("sha", ""))
    candidate_tree = _github_json(
        "GET", f"https://api.github.com/repos/{repository}/git/trees/{candidate_tree_sha}?recursive=1", token
    )
    entries_by_path = {
        str(item.get("path")): item
        for item in candidate_tree.get("tree", [])
        if isinstance(item, dict) and item.get("path")
    }
    tree_entries: list[dict[str, Any]] = []
    for item in files:
        path = str(item.get("filename", ""))
        status = str(item.get("status", ""))
        if path not in packet["exactMutableResources"]:
            raise BridgeError(f"candidate_path_out_of_scope:{path}")
        if status == "removed":
            tree_entries.append({"path": path, "mode": "100644", "type": "blob", "sha": None})
            continue
        tree_item = entries_by_path.get(path)
        if not tree_item or tree_item.get("type") != "blob":
            raise BridgeError(f"candidate_blob_missing:{path}")
        tree_entries.append(
            {
                "path": path,
                "mode": str(tree_item.get("mode", "100644")),
                "type": "blob",
                "sha": str(tree_item.get("sha", "")),
            }
        )
    new_tree = _github_json(
        "POST",
        f"https://api.github.com/repos/{repository}/git/trees",
        token,
        {"base_tree": base_tree, "tree": tree_entries},
    )
    tree_sha = str(new_tree.get("sha", ""))
    product_commit = _github_json(
        "POST",
        f"https://api.github.com/repos/{repository}/git/commits",
        token,
        {
            "message": f"Adopt free local candidate: {packet['workUnitKey']}",
            "tree": tree_sha,
            "parents": [manifest_commit],
        },
    )
    product_sha = str(product_commit.get("sha", "")).lower()
    if not FULL_SHA_RE.fullmatch(product_sha):
        raise BridgeError("adoption_product_commit_missing_sha")
    _update_ref(repository, branch, product_sha, token)
    return product_sha


def _cleanup_manifest_commit(
    repository: str, branch: str, manifest_path: str, parent_sha: str, token: str
) -> str:
    parent = _github_json("GET", f"https://api.github.com/repos/{repository}/git/commits/{parent_sha}", token)
    base_tree = str(parent.get("tree", {}).get("sha", ""))
    tree = _github_json(
        "POST",
        f"https://api.github.com/repos/{repository}/git/trees",
        token,
        {
            "base_tree": base_tree,
            "tree": [{"path": manifest_path, "mode": "100644", "type": "blob", "sha": None}],
        },
    )
    cleanup = _github_json(
        "POST",
        f"https://api.github.com/repos/{repository}/git/commits",
        token,
        {
            "message": "chore(preaction): cleanup transient adoption witness",
            "tree": str(tree.get("sha", "")),
            "parents": [parent_sha],
        },
    )
    sha = str(cleanup.get("sha", "")).lower()
    if not FULL_SHA_RE.fullmatch(sha):
        raise BridgeError("adoption_cleanup_commit_missing_sha")
    _update_ref(repository, branch, sha, token)
    return sha


def create_adoption_pr(
    packet: dict[str, Any],
    repository: str,
    token: str,
    candidate: dict[str, Any],
    lease_row: int,
    lease: dict[str, str],
    now: dt.datetime,
) -> int:
    candidate_pr, files = verify_candidate_pr(packet, repository, token, candidate)
    branch = _sanitize_branch(packet["acquireKey"])
    _create_ref(repository, branch, packet["baseRef"], token)
    manifest_path, manifest = build_adoption_manifest(packet, lease, lease_row, now, candidate["pr"])
    manifest_commit = _put_contents(
        repository,
        branch,
        manifest_path,
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        f"chore(preaction): authorize candidate adoption {packet['acquireKey']}",
        token,
    )
    product_commit = _copy_candidate_tree_commit(
        packet, repository, token, candidate_pr, files, manifest_commit, branch
    )
    cleanup_commit = _cleanup_manifest_commit(repository, branch, manifest_path, product_commit, token)
    pr = _github_json(
        "POST",
        f"https://api.github.com/repos/{repository}/pulls",
        token,
        {
            "title": f"[PC ADOPT] {packet['workUnitKey']}",
            "head": branch,
            "base": "main",
            "draft": False,
            "body": (
                f"{adoption_marker(packet['acquireKey'])}\n"
                f"Fresh private CURRENT adoption of returned FREE_LOCAL_CODER candidate PR #{candidate['pr']}.\n\n"
                f"AcquireKey: `{packet['acquireKey']}`\n"
                f"Candidate commit: `{candidate['commit']}`\n"
                f"Adoption head: `{cleanup_commit}`\n\n"
                "The transient PRE_ACTION witness is historical in the first branch commit and is cleanup-deleted "
                "from the final tree. Merge authority remains the existing GAMEROAD Required Gate auto-merge lane."
            ),
        },
    )
    try:
        return int(pr["number"])
    except (KeyError, TypeError, ValueError) as exc:
        raise BridgeError("adoption_pr_create_missing_number") from exc


def release_lease(
    packet: dict[str, Any],
    repository: str,
    token: str,
    reason: str,
    evidence: str,
) -> dict[str, Any]:
    now = dt.datetime.now(tz=JST)
    current = _google_current_read()
    row_number, lease = resolve_owned_lease_row(
        parse_lease_table_rows(current["leaseValues"]), packet["acquireKey"]
    )
    verify_lease_event_backing(lease, current["ledgerText"])
    verify_packet_against_lease(packet, lease)
    _clear_lease_row(current, row_number)
    after_clear = _google_current_read()
    if any(
        lease_item.get("AcquireKey") == packet["acquireKey"]
        for _, lease_item in parse_lease_table_rows(after_clear["leaseValues"])
    ):
        raise BridgeError("release_readback_still_present")
    _append_event(after_clear, build_release_event(packet, now, reason, evidence))
    final = _google_current_read()
    if any(
        lease_item.get("AcquireKey") == packet["acquireKey"]
        for _, lease_item in parse_lease_table_rows(final["leaseValues"])
    ):
        raise BridgeError("release_final_readback_still_present")
    main_sha, _ = _github_context(repository, token, packet["acquireKey"])
    return {"released": True, "mainSha": main_sha, "row": row_number}


def _archive_packet(path: pathlib.Path, label: str) -> pathlib.Path:
    target = path.with_name(f"{path.stem}.{label}{path.suffix}")
    if target.exists():
        raise BridgeError(f"packet_archive_exists:{target}")
    path.replace(target)
    return target


def supervise(packet_path: pathlib.Path, repository: str, token: str) -> dict[str, Any]:
    if not token:
        raise BridgeError("github_owner_token_missing")
    try:
        packet = validate_packet(json.loads(packet_path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError) as exc:
        raise BridgeError(f"packet_read_failed:{type(exc).__name__}") from exc

    now = dt.datetime.now(tz=JST)
    current = _google_current_read()
    main_sha, items = _github_context(repository, token, packet["acquireKey"])
    rows = parse_lease_table_rows(current["leaseValues"])
    live_matches = [(row, lease) for row, lease in active_lease_rows(rows, now) if lease.get("AcquireKey") == packet["acquireKey"]]
    adoption_number = find_adoption_pr(items, packet["acquireKey"])

    if adoption_number is not None:
        adoption = _github_json("GET", f"https://api.github.com/repos/{repository}/pulls/{adoption_number}", token)
        if adoption.get("merged") is True:
            merge_sha = str(adoption.get("merge_commit_sha", "")).lower()
            if not FULL_SHA_RE.fullmatch(merge_sha):
                raise BridgeError("merged_adoption_missing_merge_sha")
            main_sha, _ = _github_context(repository, token, packet["acquireKey"])
            ancestry = _github_json(
                "GET",
                f"https://api.github.com/repos/{repository}/compare/{merge_sha}...{main_sha}",
                token,
            )
            if ancestry.get("status") not in ("identical", "ahead"):
                raise BridgeError("merged_commit_not_in_current_main")
            released = release_lease(
                packet,
                repository,
                token,
                "ADOPTION_PR_MERGED_AFTER_EXISTING_REQUIRED_GATE",
                f"pr:{adoption_number};merge:{merge_sha}",
            )
            archived = _archive_packet(packet_path, f"completed-pr-{adoption_number}")
            return {
                "status": "COMPLETED_RELEASED",
                "adoptionPr": adoption_number,
                "mergeSha": merge_sha,
                "mainSha": released["mainSha"],
                "packetArchive": str(archived),
            }
        if adoption.get("state") != "open":
            raise BridgeError(f"adoption_pr_closed_unmerged:{adoption_number}")
        if not live_matches:
            raise BridgeError("adoption_open_but_live_lease_missing")
        row_number, lease = live_matches[0]
        verify_packet_against_lease(packet, lease)
        current, row_number, lease = renew_lease_if_needed(packet, current, row_number, lease, now)
        return {
            "status": "WAIT_REQUIRED_GATE_AUTO_MERGE",
            "adoptionPr": adoption_number,
            "leaseUntilJst": lease["LeaseUntilJST"],
        }

    if not live_matches:
        if any(lease.get("AcquireKey") == packet["acquireKey"] for _, lease in rows):
            raise BridgeError("same_acquire_key_present_but_not_live")
        acquire_lease(packet, repository, token)
        current = _google_current_read()
        main_sha, items = _github_context(repository, token, packet["acquireKey"])
        row_number, lease = resolve_live_lease_row(
            parse_lease_table_rows(current["leaseValues"]), packet["acquireKey"], dt.datetime.now(tz=JST)
        )
    else:
        if len(live_matches) != 1:
            raise BridgeError("live_lease_ambiguous")
        row_number, lease = live_matches[0]
        verify_packet_against_lease(packet, lease)
        verify_main_sha(packet, main_sha)

    issue_number = ensure_executor_issue(packet, repository, token, current, main_sha, items)
    candidate = _candidate_result(repository, issue_number, packet, token)
    if candidate is None:
        return {
            "status": "WAIT_CANDIDATE",
            "issueNumber": issue_number,
            "leaseUntilJst": lease["LeaseUntilJST"],
            "mainSha": main_sha,
        }

    # Fresh authority read immediately before candidate adoption.
    now = dt.datetime.now(tz=JST)
    current = _google_current_read()
    main_sha, items = _github_context(repository, token, packet["acquireKey"])
    row_number, lease = resolve_live_lease_row(
        parse_lease_table_rows(current["leaseValues"]), packet["acquireKey"], now
    )
    verify_packet_against_lease(packet, lease)
    verify_main_sha(packet, main_sha)
    current, row_number, lease = renew_lease_if_needed(packet, current, row_number, lease, now)

    # Renewal changes authority; read it fresh once more before PRE_ACTION creation.
    fresh_now = dt.datetime.now(tz=JST)
    current = _google_current_read()
    row_number, lease = resolve_live_lease_row(
        parse_lease_table_rows(current["leaseValues"]), packet["acquireKey"], fresh_now
    )
    verify_lease_event_backing(lease, current["ledgerText"])
    verify_packet_against_lease(packet, lease)
    main_sha, items = _github_context(repository, token, packet["acquireKey"])
    verify_main_sha(packet, main_sha)
    existing_adoption = find_adoption_pr(items, packet["acquireKey"])
    if existing_adoption is not None:
        return {"status": "WAIT_REQUIRED_GATE_AUTO_MERGE", "adoptionPr": existing_adoption}
    pr_number = create_adoption_pr(
        packet, repository, token, candidate, row_number, lease, fresh_now
    )
    return {
        "status": "ADOPTION_PR_OPENED",
        "issueNumber": issue_number,
        "candidatePr": candidate["pr"],
        "adoptionPr": pr_number,
        "leaseUntilJst": lease["LeaseUntilJST"],
    }


def dispatch_existing(packet_path: pathlib.Path, repository: str, token: str) -> dict[str, Any]:
    if not token:
        raise BridgeError("github_owner_token_missing")
    try:
        packet = validate_packet(json.loads(packet_path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError) as exc:
        raise BridgeError(f"packet_read_failed:{type(exc).__name__}") from exc
    current = _google_current_read()
    main_sha, items = _github_context(repository, token, packet["acquireKey"])
    issue_number = ensure_executor_issue(packet, repository, token, current, main_sha, items)
    return {"status": "DISPATCHED_OR_PRESENT", "issueNumber": issue_number, "mainSha": main_sha}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="GAMEROAD private CURRENT PC bridge")
    sub = parser.add_subparsers(dest="command", required=True)
    supervise_cmd = sub.add_parser(
        "supervise", help="advance one packet through acquire, candidate, adoption and release"
    )
    supervise_cmd.add_argument("--packet", required=True, type=pathlib.Path)
    supervise_cmd.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", DEFAULT_REPOSITORY))
    dispatch_cmd = sub.add_parser("dispatch", help="dispatch one already-acquired packet only")
    dispatch_cmd.add_argument("--packet", required=True, type=pathlib.Path)
    dispatch_cmd.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", DEFAULT_REPOSITORY))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        token = os.environ.get("GAMEROAD_GITHUB_TOKEN", "")
        if args.command == "supervise":
            result = supervise(args.packet, args.repo, token)
        elif args.command == "dispatch":
            result = dispatch_existing(args.packet, args.repo, token)
        else:
            raise BridgeError("unknown_command")
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except BridgeError as exc:
        print(json.dumps({"status": "BLOCKED", "reason": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
