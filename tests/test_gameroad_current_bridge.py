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

    def test_lease_scope_requires_exact_path_segment_not_substring(self):
        values = lease_values(
            scope="browser/example.mjs.backup; tests/example.test.mjs; own branch/readback"
        )
        with self.assertRaisesRegex(bridge.BridgeError, "lease_scope_mismatch:browser/example.mjs"):
            bridge.prepare_dispatch(packet(), values, NOW, MAIN, [])

    def test_active_lease_with_malformed_expiry_fails_closed(self):
        values = lease_values(until="not-a-jst-time")
        with self.assertRaisesRegex(bridge.BridgeError, "active_lease_invalid_until"):
            bridge.prepare_dispatch(packet(), values, NOW, MAIN, [])

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
        with self.assertRaisesRegex(bridge.BridgeError, "mutable_do_not_change_overlap"):
            bridge.validate_packet(
                packet(doNotChange=["browser/example.mjs", "browser/other.mjs"])
            )

    def test_typed_acceptance_checks_validate_exact_focused_test_target(self):
        checked = bridge.validate_packet(
            packet(
                acceptance=[
                    "Focused test passes.",
                    "Player route is visibly correct.",
                ],
                acceptanceChecks=[
                    {
                        "id": "unit",
                        "kind": "focused_test",
                        "description": "Focused test passes.",
                        "required": True,
                        "target": "tests/example.test.mjs",
                    },
                    {
                        "id": "runtime",
                        "kind": "runtime_evidence",
                        "description": "Player route is visibly correct.",
                        "required": True,
                        "target": bridge.BROWSER_FULL_INTERACTION_TARGET,
                    },
                ]
            )
        )
        self.assertEqual(checked["acceptanceChecks"][0]["kind"], "focused_test")
        with self.assertRaisesRegex(
            bridge.BridgeError, "acceptanceCheck_focused_test_not_mutable"
        ):
            bridge.validate_packet(
                packet(
                    acceptanceChecks=[
                        {
                            "id": "bad",
                            "kind": "focused_test",
                            "description": "Wrong test.",
                            "target": "tests/not-owned.test.mjs",
                        }
                    ]
                )
            )

    def test_runtime_acceptance_rejects_unsupported_provider_target(self):
        with self.assertRaisesRegex(
            bridge.BridgeError, "acceptanceCheck_runtime_target_unsupported"
        ):
            bridge.validate_packet(
                packet(
                    acceptance=["Runtime evidence exists."],
                    acceptanceChecks=[
                        {
                            "id": "runtime",
                            "kind": "runtime_evidence",
                            "description": "Runtime evidence exists.",
                            "target": "/arbitrary-route",
                        }
                    ],
                )
            )

    def test_typed_acceptance_must_classify_every_legacy_acceptance_item(self):
        with self.assertRaisesRegex(
            bridge.BridgeError, "acceptanceChecks_must_classify_every_acceptance_item"
        ):
            bridge.validate_packet(
                packet(
                    acceptance=["Focused test passes.", "Runtime evidence exists."],
                    acceptanceChecks=[
                        {
                            "id": "unit",
                            "kind": "focused_test",
                            "description": "Focused test passes.",
                            "target": "tests/example.test.mjs",
                        }
                    ],
                )
            )

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

    def test_acquire_does_not_treat_path_substring_as_scope_conflict(self):
        values = lease_values(
            acquire="OTHER",
            scope="browser/example.mjs.backup; tests/other.test.mjs",
        )
        p, row, _ = bridge.prepare_acquire(packet(), values, "no prior key", NOW, MAIN)
        self.assertEqual(p["acquireKey"], ACQUIRE)
        self.assertEqual(row, 6)

    def test_lease_row_and_events_are_bounded_and_do_not_mirror_current(self):
        until = NOW + dt.timedelta(minutes=60)
        row = bridge.build_lease_row(packet(), NOW, until)
        self.assertEqual(len(row), 15)
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
        self.assertEqual(
            lease["AcquireEventBacking"], bridge.lease_event_backing(ACQUIRE)
        )

    def test_current_event_ledger_pointer_is_resolved_from_current_sheet(self):
        self.assertEqual(bridge.current_event_ledger_id(lease_values()), "ledger-id")

    def test_executor_result_requires_matching_identity_and_test_workflow_evidence(self):
        result = {
            "schemaVersion": "gameroad-executor-bus-v1",
            "kind": "result",
            "taskId": TASK,
            "workUnitKey": WU,
            "acquireKey": ACQUIRE,
            "status": "RETURNED",
            "evidence": ["focused-tests:PASS", "workflow-run:9"],
            "unresolved": [],
            "producedRefs": ["pr:123", f"commit:{'b' * 40}", "workflow-run:9"],
            "nextAction": "fresh CURRENT adoption",
        }
        body = "```executor-result\n" + json.dumps(result) + "\n```"
        parsed = bridge.parse_executor_result_comment(body, packet())
        self.assertEqual(parsed["pr"], 123)
        self.assertEqual(parsed["commit"], "b" * 40)
        self.assertEqual(parsed["workflowRun"], 9)

        for mutation in (
            {"acquireKey": "OTHER"},
            {"evidence": ["workflow-run:9"]},
            {"evidence": ["focused-tests:PASS"]},
            {"producedRefs": ["pr:123", f"commit:{'b' * 40}"]},
        ):
            with self.subTest(mutation=mutation):
                bad_result = dict(result)
                bad_result.update(mutation)
                bad = "```executor-result\n" + json.dumps(bad_result) + "\n```"
                self.assertIsNone(bridge.parse_executor_result_comment(bad, packet()))

    def test_only_github_actions_bot_comment_is_trusted_for_candidate_result(self):
        self.assertTrue(
            bridge.trusted_executor_comment({"user": {"login": "github-actions[bot]"}})
        )
        self.assertFalse(
            bridge.trusted_executor_comment({"user": {"login": "rathersitooo-ux"}})
        )
        self.assertFalse(bridge.trusted_executor_comment({}))

    def test_runtime_evidence_comment_requires_exact_candidate_identity(self):
        candidate = {"pr": 123, "commit": "b" * 40}
        receipt = {
            "schemaVersion": bridge.RUNTIME_EVIDENCE_SCHEMA,
            "kind": "runtime_evidence",
            "target": bridge.BROWSER_FULL_INTERACTION_TARGET,
            "taskId": TASK,
            "workUnitKey": WU,
            "acquireKey": ACQUIRE,
            "candidatePr": 123,
            "headSha": "b" * 40,
            "observedHeadSha": "b" * 40,
            "workflowRun": 88,
            "artifact": "browser-full-interaction-88",
            "inputHash": "hash",
            "cacheHit": False,
            "freshCapture": True,
            "status": "PASS",
        }
        body = "```runtime-evidence\n" + json.dumps(receipt) + "\n```"
        parsed = bridge.parse_runtime_evidence_comment(body, packet(), candidate)
        self.assertEqual(parsed["workflowRun"], 88)
        self.assertEqual(parsed["status"], "PASS")
        bad = dict(receipt)
        bad["headSha"] = "c" * 40
        bad_body = "```runtime-evidence\n" + json.dumps(bad) + "\n```"
        self.assertIsNone(
            bridge.parse_runtime_evidence_comment(bad_body, packet(), candidate)
        )

    def test_runtime_evidence_provider_receipt_requires_success_and_artifact(self):
        candidate = {"pr": 123, "commit": "b" * 40}
        receipt = {
            "target": bridge.BROWSER_FULL_INTERACTION_TARGET,
            "status": "PASS",
            "workflowRun": 88,
            "artifact": "browser-full-interaction-88",
            "headSha": "b" * 40,
            "observedHeadSha": "b" * 40,
            "cacheHit": False,
            "freshCapture": True,
            "inputHash": "input-hash",
        }
        run = {
            "id": 88,
            "name": bridge.BROWSER_FULL_INTERACTION_WORKFLOW_NAME,
            "path": bridge.BROWSER_FULL_INTERACTION_WORKFLOW_PATH,
            "event": "repository_dispatch",
            "status": "completed",
            "conclusion": "success",
        }
        artifacts = [
            {
                "name": "browser-full-interaction-88",
                "expired": False,
                "workflow_run": {"id": 88},
            }
        ]
        self.assertTrue(
            bridge.verify_runtime_evidence_receipt(candidate, receipt, run, artifacts)
        )
        pending = dict(run)
        pending["status"] = "in_progress"
        pending["conclusion"] = None
        self.assertFalse(
            bridge.verify_runtime_evidence_receipt(candidate, receipt, pending, artifacts)
        )
        failed = dict(receipt)
        failed["status"] = "FAIL"
        with self.assertRaisesRegex(bridge.BridgeError, "runtime_evidence_failed"):
            bridge.verify_runtime_evidence_receipt(candidate, failed, run, artifacts)
        bad_head = dict(receipt)
        bad_head["observedHeadSha"] = "c" * 40
        with self.assertRaisesRegex(
            bridge.BridgeError, "runtime_evidence_exact_head_mismatch"
        ):
            bridge.verify_runtime_evidence_receipt(candidate, bad_head, run, artifacts)
        with self.assertRaisesRegex(
            bridge.BridgeError, "runtime_evidence_artifact_missing"
        ):
            bridge.verify_runtime_evidence_receipt(candidate, receipt, run, [])

        cached = dict(receipt)
        cached["cacheHit"] = True
        cached["freshCapture"] = False
        with self.assertRaisesRegex(
            bridge.BridgeError, "runtime_evidence_fresh_capture_required"
        ):
            bridge.verify_runtime_evidence_receipt(candidate, cached, run, artifacts)

    def test_executor_result_receipt_requires_exact_successful_issue_run_and_queue_artifact(self):
        candidate = {"workflowRun": 9}
        run = {
            "id": 9,
            "name": bridge.EXECUTOR_WORKFLOW_NAME,
            "path": bridge.EXECUTOR_WORKFLOW_PATH,
            "event": "issues",
            "status": "completed",
            "conclusion": "success",
            "head_sha": MAIN,
            "actor": {"login": "owner"},
        }
        artifacts = [
            {
                "name": "executor-bus-queue-77-9",
                "expired": False,
                "workflow_run": {"id": 9, "head_sha": MAIN},
            }
        ]
        self.assertTrue(
            bridge.verify_executor_result_receipt(
                packet(), 77, "owner", candidate, run, artifacts
            )
        )

        pending = dict(run)
        pending["status"] = "in_progress"
        pending["conclusion"] = None
        self.assertFalse(
            bridge.verify_executor_result_receipt(
                packet(), 77, "owner", candidate, pending, artifacts
            )
        )

        bad_run = dict(run)
        bad_run["head_sha"] = "b" * 40
        with self.assertRaisesRegex(bridge.BridgeError, "executor_workflow_base_mismatch"):
            bridge.verify_executor_result_receipt(
                packet(), 77, "owner", candidate, bad_run, artifacts
            )

        with self.assertRaisesRegex(
            bridge.BridgeError, "executor_queue_artifact_receipt_missing"
        ):
            bridge.verify_executor_result_receipt(
                packet(), 77, "owner", candidate, run, []
            )

    def test_adoption_manifest_is_valid_shape_for_current_preaction_contract(self):
        _, lease = bridge.resolve_live_lease_row(
            bridge.parse_lease_table_rows(lease_values()), ACQUIRE, NOW
        )
        path, manifest = bridge.build_adoption_manifest(packet(), lease, 5, NOW, 123, 9)
        self.assertEqual(path, f"data/preaction-authorizations/{manifest['recordId']}.json")
        self.assertEqual(manifest["authorizationBaseSha"], MAIN)
        self.assertEqual(manifest["leaseSnapshotReadbackRef"], "CURRENT_ACTIVE_LEASES!A5:L5")
        self.assertEqual(manifest["scope"], MUTABLE)
        self.assertEqual(manifest["leaseScope"], MUTABLE)
        self.assertIn("browser/example.mjs", manifest["leaseExactMutableResources"])
        receipt = manifest["acceptanceEvidenceReceipt"]
        self.assertEqual(receipt["schemaVersion"], "gameroad-acceptance-evidence-v1")
        self.assertEqual(receipt["mode"], "LEGACY_COMPAT")
        self.assertEqual(receipt["executorWorkflowRun"], 9)
        self.assertEqual(receipt["checks"][0]["kind"], "focused_test")
        self.assertEqual(receipt["checks"][0]["state"], "PASS")
        legacy_checks = [
            check for check in receipt["checks"] if check["kind"] == "legacy_untyped"
        ]
        self.assertEqual(len(legacy_checks), 2)
        self.assertTrue(all(check["state"] == "UNRUN" for check in legacy_checks))
        self.assertFalse(receipt["allRequiredPass"])
        self.assertFalse(receipt["productCompletionClaimAllowed"])
        self.assertTrue(
            manifest["proceedToken"].startswith(
                f"PROCEED|{manifest['recordId']}|PREACTION_PROCEED_ALLOWED|HIGH_CONSEQUENCE|"
            )
        )

    def test_acceptance_receipt_requires_concrete_executor_workflow_run(self):
        p = bridge.validate_packet(packet())
        with self.assertRaisesRegex(
            bridge.BridgeError, "acceptance_evidence_workflow_run_required"
        ):
            bridge.build_acceptance_evidence_receipt(p, None)

    def test_typed_acceptance_receipt_passes_only_executed_focused_test(self):
        p = bridge.validate_packet(
            packet(
                acceptance=[
                    "Focused test passes.",
                    "Player route is visibly correct.",
                    "Human reviewer accepts presentation.",
                    "External deployment probe succeeds.",
                ],
                acceptanceChecks=[
                    {
                        "id": "unit",
                        "kind": "focused_test",
                        "description": "Focused test passes.",
                        "required": True,
                        "target": "tests/example.test.mjs",
                    },
                    {
                        "id": "runtime",
                        "kind": "runtime_evidence",
                        "description": "Player route is visibly correct.",
                        "required": True,
                        "target": bridge.BROWSER_FULL_INTERACTION_TARGET,
                    },
                    {
                        "id": "human",
                        "kind": "human_review",
                        "description": "Human reviewer accepts presentation.",
                        "required": False,
                    },
                    {
                        "id": "external",
                        "kind": "external_evidence",
                        "description": "External deployment probe succeeds.",
                        "required": True,
                        "target": "public-deploy",
                    },
                ]
            )
        )
        receipt = bridge.build_acceptance_evidence_receipt(p, 9)
        states = {check["id"]: check["state"] for check in receipt["checks"]}
        self.assertEqual(states["unit"], "PASS")
        self.assertEqual(states["runtime"], "UNRUN")
        self.assertEqual(states["human"], "UNRUN")
        self.assertEqual(states["external"], "UNRUN")
        self.assertEqual(receipt["requiredSummary"], {"pass": 1, "unrun": 2})
        self.assertFalse(receipt["allRequiredPass"])
        self.assertFalse(receipt["productCompletionClaimAllowed"])

    def test_typed_runtime_receipt_promotes_only_matching_verified_runtime_condition(self):
        p = bridge.validate_packet(
            packet(
                acceptance=[
                    "Focused test passes.",
                    "Player route is visibly correct.",
                    "External deployment probe succeeds.",
                ],
                acceptanceChecks=[
                    {
                        "id": "unit",
                        "kind": "focused_test",
                        "description": "Focused test passes.",
                        "required": True,
                        "target": "tests/example.test.mjs",
                    },
                    {
                        "id": "runtime",
                        "kind": "runtime_evidence",
                        "description": "Player route is visibly correct.",
                        "required": True,
                        "target": bridge.BROWSER_FULL_INTERACTION_TARGET,
                    },
                    {
                        "id": "external",
                        "kind": "external_evidence",
                        "description": "External deployment probe succeeds.",
                        "required": True,
                        "target": "public-deploy",
                    },
                ]
            )
        )
        runtime_receipt = {
            bridge.BROWSER_FULL_INTERACTION_TARGET: {
                "workflowRun": 88,
                "artifact": "browser-full-interaction-88",
                "headSha": "b" * 40,
                "status": "PASS",
            }
        }
        receipt = bridge.build_acceptance_evidence_receipt(p, 9, runtime_receipt)
        states = {check["id"]: check["state"] for check in receipt["checks"]}
        self.assertEqual(states["unit"], "PASS")
        self.assertEqual(states["runtime"], "PASS")
        self.assertEqual(states["external"], "UNRUN")
        self.assertEqual(receipt["requiredSummary"], {"pass": 2, "unrun": 1})
        runtime_check = next(
            check for check in receipt["checks"] if check["id"] == "runtime"
        )
        self.assertEqual(
            runtime_check["verification"],
            "PROVIDER_BACKED_BROWSER_FULL_INTERACTION",
        )
        self.assertIn("workflow-run:88", runtime_check["evidenceRefs"])
        self.assertFalse(receipt["productCompletionClaimAllowed"])

    def test_typed_acceptance_receipt_allows_completion_only_when_all_required_checks_pass(self):
        p = bridge.validate_packet(
            packet(
                acceptance=[
                    "Focused test passes.",
                    "Optional human review.",
                ],
                acceptanceChecks=[
                    {
                        "id": "unit",
                        "kind": "focused_test",
                        "description": "Focused test passes.",
                        "required": True,
                        "target": "tests/example.test.mjs",
                    },
                    {
                        "id": "human-optional",
                        "kind": "human_review",
                        "description": "Optional human review.",
                        "required": False,
                    },
                ]
            )
        )
        receipt = bridge.build_acceptance_evidence_receipt(p, 9)
        self.assertEqual(receipt["requiredSummary"], {"pass": 1, "unrun": 0})
        self.assertTrue(receipt["allRequiredPass"])
        self.assertTrue(receipt["productCompletionClaimAllowed"])

    def test_candidate_rename_deletes_previous_path_and_adds_new_blob(self):
        rename_packet = packet(
            exactMutableResources=[
                "browser/old-name.mjs",
                "browser/new-name.mjs",
                "tests/example.test.mjs",
            ]
        )
        entries = bridge.build_candidate_tree_entries(
            rename_packet,
            [
                {
                    "filename": "browser/new-name.mjs",
                    "previous_filename": "browser/old-name.mjs",
                    "status": "renamed",
                }
            ],
            {
                "browser/new-name.mjs": {
                    "path": "browser/new-name.mjs",
                    "type": "blob",
                    "mode": "100644",
                    "sha": "b" * 40,
                }
            },
        )
        self.assertEqual(
            entries,
            [
                {
                    "path": "browser/old-name.mjs",
                    "mode": "100644",
                    "type": "blob",
                    "sha": None,
                },
                {
                    "path": "browser/new-name.mjs",
                    "mode": "100644",
                    "type": "blob",
                    "sha": "b" * 40,
                },
            ],
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

    def test_runtime_evidence_workflows_bind_exact_candidate_identity(self):
        root = pathlib.Path(__file__).resolve().parents[1]
        executor = (
            root / ".github" / "workflows" / "gameroad-executor-bus.yml"
        ).read_text(encoding="utf-8")
        browser = (
            root / ".github" / "workflows" / "browser-full-interaction.yml"
        ).read_text(encoding="utf-8")
        self.assertIn("check.kind === 'runtime_evidence'", executor)
        self.assertIn("check.target === 'browser-full-interaction'", executor)
        self.assertIn("task_id: packet.taskId", executor)
        self.assertIn("work_unit_key: packet.workUnitKey", executor)
        self.assertIn("acquire_key: packet.acquireKey", executor)
        self.assertIn("issues: write", browser)
        self.assertIn("id: interaction_run", browser)
        self.assertIn("github.event_name != \'repository_dispatch\'", browser)
        self.assertIn('SOURCE_SHA="$(git rev-parse HEAD)"', browser)
        self.assertIn("gameroad-runtime-evidence-v1", browser)
        self.assertIn("BROWSER_FULL_INTERACTION_RUNTIME_EVIDENCE", browser)
        self.assertIn("runtime-evidence", browser)
        self.assertIn("browser-full-interaction-${context.runId}", browser)
        self.assertIn("observedHeadSha", browser)

    def test_windows_gui_issue_lane_is_owner_only_pinned_and_bounded(self):
        workflow = (
            pathlib.Path(__file__).resolve().parents[1]
            / ".github"
            / "workflows"
            / "gameroad-current-bridge.yml"
        ).read_text(encoding="utf-8")
        self.assertIn("issues:\n    types: [opened, edited, reopened]", workflow)
        self.assertIn("github.event.issue.user.login == github.repository_owner", workflow)
        self.assertIn("startsWith(github.event.issue.title, '[WINDOWS-GUI]')", workflow)
        self.assertIn("GAMEROAD_WINDOWS_GUI_REQUEST_V1", workflow)
        self.assertIn("gameroad-windows-gui-v1", workflow)
        self.assertIn("WINDOWS_GUI_VERSION: '1.3.24'", workflow)
        self.assertIn(
            "4432e34ac4f7483f1e65e4b118b6995368c6d9c323cc50986200279b95dd903f",
            workflow,
        )
        for action in (
            "window:list",
            "ui:snapshot",
            "ui:click",
            "ui:type",
            "clipboard:get",
        ):
            self.assertIn(action, workflow)
        self.assertNotIn("Invoke-Expression", workflow)
        self.assertNotIn("process:kill", workflow)
        self.assertNotIn("app:launch", workflow)
        self.assertIn("workflow_dispatch:", workflow)
        self.assertIn("python tools/gameroad-current-bridge.py supervise", workflow)


if __name__ == "__main__":
    unittest.main()
