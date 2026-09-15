import datetime as dt
import importlib.util
import json
import pathlib
import tempfile
import unittest

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "tools" / "gameroad-current-bridge.py"
SPEC = importlib.util.spec_from_file_location("gameroad_current_bridge", MODULE_PATH)
bridge = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(bridge)

NOW = dt.datetime(2026, 9, 16, 7, 10, tzinfo=bridge.JST)
ACQUIRE = "ACQ-PC-BRIDGE-1"
TASK = "TASK-1"
WU = "WU-1"
MAIN = "a" * 40
MUTABLE = ["browser/example.mjs", "tests/example.test.mjs"]


def packet(**overrides):
    value = {
        "schemaVersion": "gameroad-executor-bus-v1",
        "kind": "queue",
        "taskId": TASK,
        "workUnitKey": WU,
        "acquireKey": ACQUIRE,
        "baseRef": MAIN,
        "exactMutableResources": list(MUTABLE),
        "doNotChange": ["browser/other.mjs"],
        "userEndState": "Close the bounded product gap.",
        "realOutputTarget": "A minimal tested candidate patch.",
        "acceptance": ["Focused test passes.", "No unrelated path changes."],
        "resumeCondition": "Return a draft candidate PR.",
        "executorCapabilityHint": "FREE_LOCAL_CODER",
    }
    value.update(overrides)
    return value


def lease_values(until="2026-09-16 07:44 JST", **overrides):
    header = [
        "AcquireKey", "TaskID", "WorkUnitKey", "Owner", "LeaseUntilJST",
        "ExactMutableResources", "AcquiredAtJST", "State", "Origin",
        "StateModelVersion", "LastResolvedJST", "Note", "Authority",
        "DERIVED_NON_AUTHORITY",
    ]
    item = {
        "AcquireKey": ACQUIRE,
        "TaskID": TASK,
        "WorkUnitKey": WU,
        "Owner": "PC bridge test owner",
        "LeaseUntilJST": until,
        "ExactMutableResources": "; ".join(MUTABLE),
        "AcquiredAtJST": "2026-09-16 06:44 JST",
        "State": "ACTIVE",
        "Origin": "TEST",
        "StateModelVersion": "STATE_MODEL_V1",
        "LastResolvedJST": "2026-09-16 06:44 JST",
        "Note": "test",
        "Authority": "CURRENT_ACTIVE_LEASES",
        "DERIVED_NON_AUTHORITY": "PASS",
    }
    item.update(overrides)
    return [["schema_guard", "PASS"], header, [item.get(key, "") for key in header]]


class CurrentBridgeTests(unittest.TestCase):
    def test_accepts_one_live_matching_lease(self):
        p, lease, duplicate = bridge.prepare_dispatch(packet(), lease_values(), NOW, MAIN, [])
        self.assertEqual(p["acquireKey"], ACQUIRE)
        self.assertEqual(lease["TaskID"], TASK)
        self.assertIsNone(duplicate)

    def test_expired_lease_rejected(self):
        with self.assertRaisesRegex(bridge.BridgeError, "live_lease_not_found"):
            bridge.prepare_dispatch(packet(), lease_values(until="2026-09-16 07:09 JST"), NOW, MAIN, [])

    def test_task_workunit_and_acquire_identity_must_match(self):
        for key, bad in (("taskId", "OTHER"), ("workUnitKey", "OTHER"), ("acquireKey", "OTHER")):
            with self.subTest(key=key):
                with self.assertRaises(bridge.BridgeError):
                    bridge.prepare_dispatch(packet(**{key: bad}), lease_values(), NOW, MAIN, [])

    def test_mutable_resource_must_be_in_live_lease_scope(self):
        bad = packet(exactMutableResources=["browser/not-owned.mjs", "tests/example.test.mjs"])
        with self.assertRaisesRegex(bridge.BridgeError, "lease_scope_mismatch"):
            bridge.prepare_dispatch(bad, lease_values(), NOW, MAIN, [])

    def test_duplicate_acquire_key_is_detected_from_persistent_issue_marker(self):
        title, body = bridge.build_executor_issue(packet())
        existing = [{"number": 77, "title": title, "body": body}]
        _, _, duplicate = bridge.prepare_dispatch(packet(), lease_values(), NOW, MAIN, existing)
        self.assertEqual(duplicate, 77)

    def test_stale_main_sha_rejected(self):
        with self.assertRaisesRegex(bridge.BridgeError, "base_moved"):
            bridge.prepare_dispatch(packet(), lease_values(), NOW, "b" * 40, [])

    def test_ambiguous_current_lease_rejected(self):
        values = lease_values()
        values.append(list(values[-1]))
        with self.assertRaisesRegex(bridge.BridgeError, "live_lease_ambiguous"):
            bridge.prepare_dispatch(packet(), values, NOW, MAIN, [])

    def test_control_plane_paths_and_non_free_packets_are_rejected(self):
        for target in [".github/workflows/evil.yml", "data/preaction-authorizations/x.json", "../escape"]:
            with self.subTest(target=target):
                with self.assertRaises(bridge.BridgeError):
                    bridge.validate_packet(packet(exactMutableResources=[target, "tests/example.test.mjs"]))
        with self.assertRaisesRegex(bridge.BridgeError, "free_local_coder_opt_in_required"):
            bridge.validate_packet(packet(executorCapabilityHint=""))

    def test_issue_contains_bounded_packet_not_secret_or_current_mirror(self):
        title, body = bridge.build_executor_issue(packet())
        self.assertTrue(title.startswith("[EXECUTOR]"))
        self.assertIn(bridge.issue_marker(ACQUIRE), body)
        self.assertIn('"acquireKey":"ACQ-PC-BRIDGE-1"', body)
        self.assertNotIn("GAMEROAD_GITHUB_TOKEN", body)
        self.assertNotIn("CURRENT_ACTIVE_LEASES!", body)

    def test_google_provider_failure_is_fail_closed(self):
        original = bridge._google_current_read
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json", delete=False) as handle:
                json.dump(packet(), handle)
                tmp_path = pathlib.Path(handle.name)

            def fail():
                raise bridge.BridgeError("private_current_read_failed:test")

            bridge._google_current_read = fail
            with self.assertRaisesRegex(bridge.BridgeError, "private_current_read_failed"):
                bridge.dispatch(tmp_path, "rathersitooo-ux/GMR", "token")
        finally:
            bridge._google_current_read = original
            if tmp_path is not None:
                tmp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
