from pathlib import Path

BUILD = Path('deploy/cloudflare/scripts/build.mjs')
text = BUILD.read_text(encoding='utf-8')

entries = [
    ("browser/battle-janken-order-live-adapter.mjs", "battle-janken-order-live-adapter.mjs", "battle_janken_order_live_adapter", "Battle janken processing-order live adapter"),
    ("browser/battle-janken-order-chain-presentation-core.mjs", "battle-janken-order-chain-presentation-core.mjs", "battle_janken_order_chain_presentation_core", "Battle janken processing-order chain presentation core"),
    ("browser/battle-janken-order-motion-core.mjs", "battle-janken-order-motion-core.mjs", "battle_janken_order_motion_core", "Battle janken processing-order motion core"),
    ("browser/battle-action-order-presentation-core.mjs", "battle-action-order-presentation-core.mjs", "battle_action_order_presentation_core", "Battle action-order presentation core"),
]

for source, _, _, _ in entries:
    if not Path(source).is_file():
        raise SystemExit(f'missing source module: {source}')
    if f"source: '{source}'" in text:
        raise SystemExit(f'already packaged unexpectedly: {source}')

anchor = "  { source: 'browser/battle-janken-slidepad-live-input-coordinator.mjs', output: 'battle-janken-slidepad-live-input-coordinator.mjs', artifact: 'battle_janken_slidepad_live_input_coordinator', label: 'Battle janken SlidePad live input coordinator' },\n"
if text.count(anchor) != 1:
    raise SystemExit(f'expected exactly one live input coordinator artifact anchor, found {text.count(anchor)}')

block = ''.join(
    f"  {{ source: '{source}', output: '{output}', artifact: '{artifact}', label: '{label}' }},\n"
    for source, output, artifact, label in entries
)
BUILD.write_text(text.replace(anchor, anchor + block, 1), encoding='utf-8')

patched = BUILD.read_text(encoding='utf-8')
for source, output, artifact, label in entries:
    expected = f"{{ source: '{source}', output: '{output}', artifact: '{artifact}', label: '{label}' }}"
    if patched.count(expected) != 1:
        raise SystemExit(f'patch readback count mismatch: {source}')
print(f'patched {len(entries)} Battle processing-order public artifacts')
