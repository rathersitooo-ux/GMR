from pathlib import Path

path = Path('deploy/cloudflare/scripts/build.mjs')
text = path.read_text(encoding='utf-8')
entry = "  { source: 'browser/battle-load-card-chain-presentation-core.mjs', output: 'battle-load-card-chain-presentation-core.mjs', artifact: 'battle_load_card_chain_presentation_core', label: 'Battle LOAD card chain presentation core' },\n"
anchor = "  { source: 'browser/battle-screen-runtime-mount.mjs', output: 'battle-screen-runtime-mount.mjs', artifact: 'battle_screen_runtime_mount', label: 'Battle screen runtime mount' },\n"

if entry in text:
    raise SystemExit('load-card package entry already exists; refusing duplicate patch')
if text.count(anchor) != 1:
    raise SystemExit(f'expected exactly one battle-screen runtime anchor, got {text.count(anchor)}')
text = text.replace(anchor, anchor + entry, 1)
path.write_text(text, encoding='utf-8')

check = path.read_text(encoding='utf-8')
if check.count(entry) != 1:
    raise SystemExit('load-card package patch readback failed')
print('patched build.mjs with exact Battle LOAD card chain presentation core artifact entry')