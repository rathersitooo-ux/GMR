from pathlib import Path

BUILD = Path('deploy/cloudflare/scripts/build.mjs')
text = BUILD.read_text(encoding='utf-8')

specs = [
    ('browser/battle-interaction-feedback-runtime.mjs', 'battle-interaction-feedback-runtime.mjs', 'battle_interaction_feedback_runtime', 'Battle accepted-action interaction feedback runtime'),
    ('browser/battle-screen-presentation-core.mjs', 'battle-screen-presentation-core.mjs', 'battle_screen_presentation_core', 'Battle screen presentation core'),
    ('browser/battle-critical-resource-hud-runtime.mjs', 'battle-critical-resource-hud-runtime.mjs', 'battle_critical_resource_hud_runtime', 'Battle critical resource HUD runtime'),
    ('browser/battle-resolution-action-order-adapter.mjs', 'battle-resolution-action-order-adapter.mjs', 'battle_resolution_action_order_adapter', 'Battle resolution action-order adapter'),
    ('browser/battle-resolution-board-return-presentation-core.mjs', 'battle-resolution-board-return-presentation-core.mjs', 'battle_resolution_board_return_presentation_core', 'Battle resolution board-return presentation core'),
    ('browser/battle-screen-runtime-mount.mjs', 'battle-screen-runtime-mount.mjs', 'battle_screen_runtime_mount', 'Battle screen runtime mount'),
    ('browser/battle-critical-resource-hud-live-adapter.mjs', 'battle-critical-resource-hud-live-adapter.mjs', 'battle_critical_resource_hud_live_adapter', 'Battle critical resource HUD live adapter'),
    ('browser/new-base-goal-result-core.mjs', 'new-base-goal-result-core.mjs', 'new_base_goal_result_core', 'New Base GOAL result authority core'),
    ('browser/new-base-goal-arrival-presentation-core.mjs', 'new-base-goal-arrival-presentation-core.mjs', 'new_base_goal_arrival_presentation_core', 'New Base GOAL arrival presentation core'),
    ('browser/new-base-goal-arrival-runtime-mount.mjs', 'new-base-goal-arrival-runtime-mount.mjs', 'new_base_goal_arrival_runtime_mount', 'New Base GOAL arrival runtime mount'),
    ('browser/new-base-goal-arrival-consumer.mjs', 'new-base-goal-arrival-consumer.mjs', 'new_base_goal_arrival_consumer', 'New Base GOAL arrival consumer'),
    ('browser/battle-goal-arrival-live-adapter.mjs', 'battle-goal-arrival-live-adapter.mjs', 'battle_goal_arrival_live_adapter', 'Battle GOAL arrival live adapter'),
    ('browser/battle-goal-arrival-live-integration.mjs', 'battle-goal-arrival-live-integration.mjs', 'battle_goal_arrival_live_integration', 'Battle GOAL arrival live integration'),
    ('browser/triad-resolver-core.mjs', 'triad-resolver-core.mjs', 'triad_resolver_core', 'Triad first-win-lock resolver core'),
    ('browser/battle-janken-processing-order-authority-adapter.mjs', 'battle-janken-processing-order-authority-adapter.mjs', 'battle_janken_processing_order_authority_adapter', 'Battle janken processing-order authority adapter'),
]

for source, _, _, _ in specs:
    if not Path(source).is_file():
        raise SystemExit(f'missing merged candidate source: {source}')

missing = [spec for spec in specs if f"source: '{spec[0]}'" not in text]
if not missing:
    print('BATTLE_SHARED_PACKAGE_R4_ALREADY_APPLIED')
    raise SystemExit(0)

anchor_token = "  { source: 'browser/battle-invalid-action-feedback-live-adapter.mjs'"
start = text.find(anchor_token)
if start < 0:
    raise SystemExit('package anchor missing')
line_end = text.find('\n', start)
if line_end < 0:
    raise SystemExit('package anchor line end missing')
insert_at = line_end + 1

lines = ["  // BATTLE_SHARED_PUBLIC_PACKAGE_TRAIN_R4 — already-merged Battle runtime/public closure.\n"]
for source, output, artifact, label in missing:
    lines.append(
        "  { source: '%s', output: '%s', artifact: '%s', label: '%s' },\n"
        % (source, output, artifact, label)
    )

text = text[:insert_at] + ''.join(lines) + text[insert_at:]
BUILD.write_text(text, encoding='utf-8')

updated = BUILD.read_text(encoding='utf-8')
for source, _, _, _ in specs:
    count = updated.count(f"source: '{source}'")
    if count != 1:
        raise SystemExit(f'expected exactly one package spec for {source}, got {count}')
print('BATTLE_SHARED_PACKAGE_R4_PATCHED', len(missing))
