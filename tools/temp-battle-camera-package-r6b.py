from pathlib import Path

path = Path('deploy/cloudflare/scripts/build.mjs')
text = path.read_text(encoding='utf-8')
anchor = "  { source: 'browser/battle-controlled-character-4p-motion-director.mjs', output: 'battle-controlled-character-4p-motion-director.mjs', artifact: 'battle_controlled_character_4p_motion_director', label: 'Battle controlled character 4P motion director' },\n"
rows = [
    "  { source: 'browser/battle-camera-control-core.mjs', output: 'battle-camera-control-core.mjs', artifact: 'battle_camera_control_core', label: 'Battle camera control core' },\n",
    "  { source: 'browser/battle-camera-input-router.mjs', output: 'battle-camera-input-router.mjs', artifact: 'battle_camera_input_router', label: 'Battle camera input router' },\n",
    "  { source: 'browser/battle-camera-live-runtime.mjs', output: 'battle-camera-live-runtime.mjs', artifact: 'battle_camera_live_runtime', label: 'Battle camera live runtime' },\n",
]
needles = ["source: 'browser/battle-camera-control-core.mjs'", "source: 'browser/battle-camera-input-router.mjs'", "source: 'browser/battle-camera-live-runtime.mjs'"]
present = [needle in text for needle in needles]
if all(present):
    for needle in needles:
        if text.count(needle) != 1: raise SystemExit(f'camera artifact duplicate: {needle}')
    print('camera package artifacts already present exactly once')
    raise SystemExit(0)
if any(present): raise SystemExit(f'partial camera package artifact state: {present}')
if text.count(anchor) != 1: raise SystemExit(f'expected exactly one controlled-character anchor, found {text.count(anchor)}')
text = text.replace(anchor, anchor + ''.join(rows), 1)
path.write_text(text, encoding='utf-8')
for needle in needles:
    if path.read_text(encoding='utf-8').count(needle) != 1: raise SystemExit(f'failed to write exactly one camera artifact: {needle}')
print('inserted exact camera public package closure: control core + input router + live runtime')
