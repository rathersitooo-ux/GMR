from pathlib import Path

BUILD = Path('deploy/cloudflare/scripts/build.mjs')
text = BUILD.read_text(encoding='utf-8')

entries = [
    ("browser/battle-janken-compound-attack-package-core.mjs", "battle-janken-compound-attack-package-core.mjs", "battle_janken_compound_attack_package_core", "Battle janken compound attack package core"),
    ("browser/new-base-hand3-uniform-assignment-policy.mjs", "new-base-hand3-uniform-assignment-policy.mjs", "new_base_hand3_uniform_assignment_policy", "New Base Hand3 uniform assignment policy"),
    ("browser/battle-optional-rule-activation-core.mjs", "battle-optional-rule-activation-core.mjs", "battle_optional_rule_activation_core", "Battle optional rule activation core"),
    ("browser/battle-new-base-live-consumer-adapter.mjs", "battle-new-base-live-consumer-adapter.mjs", "battle_new_base_live_consumer_adapter", "Battle New Base live consumer adapter"),
    ("browser/battle-compound-attack-preview-runtime.mjs", "battle-compound-attack-preview-runtime.mjs", "battle_compound_attack_preview_runtime", "Battle compound attack preview runtime"),
    ("browser/battle-compound-preview-live-consumer-bridge.mjs", "battle-compound-preview-live-consumer-bridge.mjs", "battle_compound_preview_live_consumer_bridge", "Battle compound preview live consumer bridge"),
    ("browser/battle-janken-slidepad-live-input-coordinator.mjs", "battle-janken-slidepad-live-input-coordinator.mjs", "battle_janken_slidepad_live_input_coordinator", "Battle janken SlidePad live input coordinator"),
    ("browser/battle-thumb-cluster-presentation-core.mjs", "battle-thumb-cluster-presentation-core.mjs", "battle_thumb_cluster_presentation_core", "Battle right-thumb cluster presentation core"),
]

for source, _, _, _ in entries:
    if not Path(source).is_file():
        raise SystemExit(f'missing source module: {source}')
    marker = f"source: '{source}'"
    if marker in text:
        raise SystemExit(f'already packaged unexpectedly: {source}')

anchor = "  { source: 'browser/battle-janken-slidepad-runtime-mount.mjs', output: 'battle-janken-slidepad-runtime-mount.mjs', artifact: 'battle_janken_slidepad_runtime_mount', label: 'Battle janken SlidePad runtime mount' },\n"
if text.count(anchor) != 1:
    raise SystemExit(f'expected exactly one SlidePad artifact anchor, found {text.count(anchor)}')

block = ''.join(
    f"  {{ source: '{source}', output: '{output}', artifact: '{artifact}', label: '{label}' }},\n"
    for source, output, artifact, label in entries
)
text = text.replace(anchor, anchor + block, 1)
BUILD.write_text(text, encoding='utf-8')

patched = BUILD.read_text(encoding='utf-8')
for source, output, artifact, label in entries:
    expected = f"{{ source: '{source}', output: '{output}', artifact: '{artifact}', label: '{label}' }}"
    if expected not in patched:
        raise SystemExit(f'patch readback missing: {source}')

print(f'patched {len(entries)} W42 public dependency artifacts')
