import datetime as dt
import importlib.util
import json
import pathlib
import unittest

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "tools" / "gameroad-current-bridge.py"
SPEC = importlib.util.spec_from_file_location("gameroad_current_bridge", MODULE_PATH)
bridge = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(bridge)

NOW = dt.datetime(2026, 9, 16, 19, 30, tzinfo=bridge.JST)
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


def lease_values(*, acquire=ACQUIRE, until="2026-09-16 20:20 JST", scope=None, row_state="ACTIVE"):
    header = list(bridge.LEASE_COLUMNS)
    scope = scope or bridge.lease_scope_text(packet(acquireKey=acquire))
    item = {
        "AcquireKey": acquire,
        "TaskID": TASK,
        "WorkUnitKey": WU,
        "Owner": "PC bridge test owner",
        "LeaseUntilJST": until,
        "ExactMutableResources": scope,
        "AcquiredAtJST": "2026-09-16 19:20 JST",
        "State": row_state,
        "Origin": "TEST",
        "StateModelVersion": "STATE_MODEL_V1",
        "LastResolvedJST": "2026-09-16 19:20 JST",
        "Note": "test",
        "Authority": "CURRENT_ACTIVE_LEASES",
        "DERIVED_NON_AUTHORITY": "PASS",
        "AcquireEventBacking": bridge.lease_event_backing(acquire),
    }
    return [
        ["CURRENT_ACTIVE_LEASES", "LEASE AUTHORITY"],
        ["Semantics", "test"],
        ["CurrentEventHistoryLedger", "ledger-id"],
        header,
        [item.get(key, "") for key in header],
    ]


class CurrentBridgeTests(unittest.TestCase):
    def test_accepts_one_live_matching_lease(self):
        p, lease, duplicate = bridge.prepare_dispatch(packet(), lease_values(), NOW, MAIN, [])
        self.assertEqual(p["acquireKey"], ACQUIRE)
        self.assertEqual(lease["TaskID"], TASK)
        self.assertIsNone(duplicate)

    def test_expired_lease_rejected_for_dispatch(self):
        with self.assertRaisesRegex(bridge.BridgeError, "live_lease_not_found"):
            bridge.prepare_dispatch(
                packet(), lease_values(until="2026-09-16 19:29 JST"), NOW, MAIN, []
            )

    def test_owned_expired_row_can_be_resolved_for_terminal_cleanup(self):
        rows = bridge.parse_lease_table_rows(lease_values(until="2026-09-16 19:29 JST"))
        row_number, lease = bridge.resolve_owned_lease_row(rows, ACQUIRE)
        self.assertEqual(row_number, 5)
        self.assertEqual(lease["AcquireKey"], ACQUIRE)

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
        for target in [
            ".github/workflows/evil.yml",
            "data/preaction-authorizations/x.json",
            ".github/workflows/gameroad-required-gate.yml",
            "../escape",
        ]:
            with self.subTest(target=target):
                with self.assertRaises(bridge.BridgeError):
                    bridge.validate_packet(
                        packet(exactMutableResources=[target, "tests/example.test.mjs"])
                    )
        with self.assertRaisesRegex(bridge.BridgeError, "free_local_coder_opt_in_required"):
            bridge.validate_packet(packet(executorCapabilityHint=""))

    def test_issue_contains_bounded_packet_not_secret_or_current_mirror(self):
        title, body = bridge.build_executor_issue(packet())
        self.assertTrue(title.startswith("[EXECUTOR]"))
        self.assertIn(bridge.issue_marker(ACQUIRE), body)
        self.assertIn('\"acquireKey\":\"ACQ-PC-BRIDGE-1\"', body)
        self.assertNotIn("GAMEROAD_GITHUB_TOKEN", body)
        self.assertNotIn("CURRENT_ACTIVE_LEASES!", body)

    def test_new_acquire_uses_first_blank_row_and_one_hour_window(self):
        empty = lease_values(
            acquire="OTHER",
            scope="browser/unrelated.mjs; tests/unrelated.test.mjs",
        )
        p, row, until = bridge.prepare_acquire(packet(), empty, "no prior key", NOW, MAIN)
        self.assertEqual(p["acquireKey"], ACQUIRE)
        self.assertEqual(row, 6)
        self.assertEqual(until - NOW, dt.timedelta(minutes=60))

    def test_acquire_rejects_prior_event_key_reuse(self):
        empty = lease_values(acquire="OTHER")
        history = f"[EVENT=RELEASE][AcquireKey={ACQUIRE}]\n"
        with self.assertRaisesRegex(bridge.BridgeError, "acquire_key_reuse_rejected"):
            bridge.prepare_acquire(packet(), empty, history, NOW, MAIN)

    def test_acquire_rejects_active_scope_conflict(self):
        values = lease_values(acquire="OTHER", scope="browser/example.mjs; tests/other.test.mjs")
        with self.assertRaisesRegex(bridge.BridgeError, "active_scope_conflict"):
            bridge.prepare_acquire(packet(), values, "no prior key", NOW, MAIN)

    def test_lease_row_and_events_are_bounded_and_do_not_mirror_current(self):
        until = NOW + dt.timedelta(minutes=60)
        row = bridge.build_lease_row(packet(), NOW, until)
        self.assertEqual(len(row), 14)
        self.assertEqual(row[0], ACQUIRE)
        self.assertEqual(row[7], "ACTIVE")
        self.assertIn("browser/example.mjs", row[5])
        self.assertEqual(len(row), 15)
        self.assertEqual(row[14], bridge.lease_event_backing(ACQUIRE))
        event = bridge.build_acquire_event(packet(), NOW, until)
        self.assertIn(f"AcquireKey={ACQUIRE}", event)
        self.assertNotIn("GAMEROAD_Drive総合目次", event)
        release = bridge.build_release_event(packet(), NOW, "TEST", "pr:1")
        self.assertIn("EVENT=RELEASE", release)
        self.assertIn("pr:1", release)

    def test_dispatch_rejects_missing_acquire_event_backing_marker(self):
        values = lease_values()
        values[-1][-1] = ""
        with self.assertRaisesRegex(bridge.BridgeError, "lease_event_backing_marker_rejected"):
            bridge.prepare_dispatch(packet(), values, NOW, MAIN, [])

    def test_dispatch_rejects_marker_without_durable_acquire_event(self):
        with self.assertRaisesRegex(bridge.BridgeError, "lease_acquire_event_missing"):
            bridge.prepare_dispatch(packet(), lease_values(), NOW, MAIN, [], "")

    def test_dispatch_accepts_matching_durable_acquire_event(self):
        event_text = bridge.build_acquire_event(packet(), NOW, NOW + dt.timedelta(minutes=60))
        p, lease, _ = bridge.prepare_dispatch(
            packet(), lease_values(), NOW, MAIN, [], event_text
        )
        self.assertEqual(p["acquireKey"], ACQUIRE)
        self.assertEqual(lease["AcquireEventBacking"], bridge.lease_event_backing(ACQUIRE))

    def test_current_event_ledger_pointer_is_resolved_from_current_sheet(self):
        self.assertEqual(bridge.current_event_ledger_id(lease_values()), "ledger-id")

    def test_executor_result_requires_matching_identity_and_one_pr_and_commit(self):
        result = {
            "schemaVersion": "gameroad-executor-bus-v1",
            "kind": "result",
            "taskId": TASK,
            "workUnitKey": WU,
            "acquireKey": ACQUIRE,
            "status": "RETURNED",
            "evidence": ["focused tests passed"],
            "unresolved": [],
            "producedRefs": ["pr:123", f"commit:{'b' * 40}", "workflow-run:9"],
            "nextAction": "fresh CURRENT adoption",
        }
        body = "```executor-result\n" + json.dumps(result) + "\n```"
        parsed = bridge.parse_executor_result_comment(body, packet())
        self.assertEqual(parsed["pr"], 123)
        self.assertEqual(parsed["commit"], "b" * 40)
        result["acquireKey"] = "OTHER"
        bad = "```executor-result\n" + json.dumps(result) + "\n```"
        self.assertIsNone(bridge.parse_executor_result_comment(bad, packet()))

    def test_adoption_manifest_is_valid_shape_for_current_preaction_contract(self):
        _, lease = bridge.resolve_live_lease_row(
            bridge.parse_lease_table_rows(lease_values()), ACQUIRE, NOW
        )
        path, manifest = bridge.build_adoption_manifest(packet(), lease, 5, NOW, 123)
        self.assertEqual(path, f"data/preaction-authorizations/{manifest['recordId']}.json")
        self.assertEqual(manifest["authorizationBaseSha"], MAIN)
        self.assertEqual(manifest["leaseSnapshotReadbackRef"], "CURRENT_ACTIVE_LEASES!A5:O5")
        self.assertEqual(manifest["scope"], MUTABLE)
        self.assertEqual(manifest["leaseScope"], MUTABLE)
        self.assertIn("browser/example.mjs", manifest["leaseExactMutableResources"])
        self.assertTrue(
            manifest["proceedToken"].startswith(
                f"PROCEED|{manifest['recordId']}|PREACTION_PROCEED_ALLOWED|HIGH_CONSEQUENCE|"
            )
        )

    def test_adoption_branch_is_work_namespace_for_existing_auto_merge(self):
        branch = bridge._sanitize_branch(ACQUIRE)
        self.assertTrue(branch.startswith("work/"))
        self.assertNotIn(" ", branch)

    def test_adoption_pr_marker_is_separate_from_executor_issue_marker(self):
        self.assertNotEqual(bridge.adoption_marker(ACQUIRE), bridge.issue_marker(ACQUIRE))
        items = [
            {"number": 7, "pull_request": {"url": "x"}, "body": bridge.adoption_marker(ACQUIRE)}
        ]
        self.assertEqual(bridge.find_adoption_pr(items, ACQUIRE), 7)


if __name__ == "__main__":
    unittest.main()
