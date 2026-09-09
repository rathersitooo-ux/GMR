from pathlib import Path

path = Path('deploy/cloudflare/scripts/build.mjs')
text = path.read_text(encoding='utf-8')
anchor = "  { source: 'browser/battle-janken-slidepad-live-input-coordinator.mjs', output: 'battle-janken-slidepad-live-input-coordinator.mjs', artifact: 'battle_janken_slidepad_live_input_coordinator', label: 'Battle janken SlidePad live input coordinator' },\n"
insert = (
    "  { source: 'browser/battle-janken-focus-presentation-core.mjs', output: 'battle-janken-focus-presentation-core.mjs', artifact: 'battle_janken_focus_presentation_core', label: 'Battle janken focus presentation core' },\n"
    "  { source: 'browser/battle-janken-focus-runtime-surface.mjs', output: 'battle-janken-focus-runtime-surface.mjs', artifact: 'battle_janken_focus_runtime_surface', label: 'Battle janken focus runtime surface' },\n"
)
if text.count(anchor) != 1:
    raise SystemExit(f'expected exactly one coordinator anchor, found {text.count(anchor)}')
for needle in ('battle-janken-focus-presentation-core.mjs', 'battle-janken-focus-runtime-surface.mjs'):
    if needle in text:
        raise SystemExit(f'already packaged: {needle}')
text = text.replace(anchor, anchor + insert, 1)
path.write_text(text, encoding='utf-8')

updated = path.read_text(encoding='utf-8')
for needle in ('battle-janken-focus-presentation-core.mjs', 'battle-janken-focus-runtime-surface.mjs'):
    if updated.count(needle) != 2:
        raise SystemExit(f'expected source/output pair exactly once for {needle}, occurrences={updated.count(needle)}')
print('focus package manifest patch OK')
