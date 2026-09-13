from pathlib import Path

path = Path('deploy/cloudflare/scripts/build.mjs')
text = path.read_text(encoding='utf-8')
bridge = "  { source: 'browser/battle-four-public-live-bridge.mjs', output: 'battle-four-public-live-bridge.mjs', artifact: 'battle_four_public_live_bridge', label: 'Battle four-public live bridge' },\n"
integration = "  { source: 'browser/battle-four-public-live-integration.mjs', output: 'battle-four-public-live-integration.mjs', artifact: 'battle_four_public_live_integration', label: 'Battle four-public live integration' },\n"
anchor = "  { source: 'browser/battle-screen-runtime-mount.mjs', output: 'battle-screen-runtime-mount.mjs', artifact: 'battle_screen_runtime_mount', label: 'Battle screen runtime mount' },\n"

if bridge in text or integration in text:
    raise SystemExit('four-public package entries already exist; refusing duplicate patch')
if text.count(anchor) != 1:
    raise SystemExit(f'expected exactly one battle-screen runtime anchor, got {text.count(anchor)}')
text = text.replace(anchor, anchor + bridge + integration, 1)
path.write_text(text, encoding='utf-8')

check = path.read_text(encoding='utf-8')
if check.count(bridge) != 1 or check.count(integration) != 1:
    raise SystemExit('package patch readback failed')
print('patched build.mjs with exact WU26 bridge + integration artifact entries')
