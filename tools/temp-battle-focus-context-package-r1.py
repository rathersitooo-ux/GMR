from pathlib import Path

path = Path('deploy/cloudflare/scripts/build.mjs')
text = path.read_text(encoding='utf-8')
anchor = "  { source: 'browser/battle-janken-focus-runtime-surface.mjs', output: 'battle-janken-focus-runtime-surface.mjs', artifact: 'battle_janken_focus_runtime_surface', label: 'Battle janken focus runtime surface' },\n"
row = "  { source: 'browser/battle-janken-focus-authority-context.mjs', output: 'battle-janken-focus-authority-context.mjs', artifact: 'battle_janken_focus_authority_context', label: 'Battle janken focus authority context' },\n"
needle = "source: 'browser/battle-janken-focus-authority-context.mjs'"
if needle in text:
    if text.count(needle) != 1:
        raise SystemExit(f'focus context artifact duplicate count={text.count(needle)}')
    print('focus context package artifact already present exactly once')
    raise SystemExit(0)
if text.count(anchor) != 1:
    raise SystemExit(f'expected exactly one focus runtime anchor, found {text.count(anchor)}')
text = text.replace(anchor, anchor + row, 1)
path.write_text(text, encoding='utf-8')
final = path.read_text(encoding='utf-8')
if final.count(needle) != 1:
    raise SystemExit('failed to write exactly one focus authority context artifact')
print('inserted exact Battle janken Focus authority context public artifact')
