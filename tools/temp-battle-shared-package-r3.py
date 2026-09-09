from pathlib import Path

path = Path('deploy/cloudflare/scripts/build.mjs')
text = path.read_text(encoding='utf-8')
anchor = "  { source: 'browser/battle-camera-live-runtime.mjs', output: 'battle-camera-live-runtime.mjs', artifact: 'battle_camera_live_runtime', label: 'Battle camera live runtime' },\n"
rows = [
    "  { source: 'browser/battle-2v2-reconnect-core.mjs', output: 'battle-2v2-reconnect-core.mjs', artifact: 'battle_2v2_reconnect_core', label: 'Battle 2v2 reconnect core' },\n",
    "  { source: 'browser/battle-recovery-presentation-core.mjs', output: 'battle-recovery-presentation-core.mjs', artifact: 'battle_recovery_presentation_core', label: 'Battle recovery presentation core' },\n",
    "  { source: 'browser/battle-recovery-runtime-surface.mjs', output: 'battle-recovery-runtime-surface.mjs', artifact: 'battle_recovery_runtime_surface', label: 'Battle recovery runtime surface' },\n",
    "  { source: 'browser/battle-recovery-live-adapter.mjs', output: 'battle-recovery-live-adapter.mjs', artifact: 'battle_recovery_live_adapter', label: 'Battle recovery live adapter' },\n",
]
needles = [
    "source: 'browser/battle-2v2-reconnect-core.mjs'",
    "source: 'browser/battle-recovery-presentation-core.mjs'",
    "source: 'browser/battle-recovery-runtime-surface.mjs'",
    "source: 'browser/battle-recovery-live-adapter.mjs'",
]
present = [needle in text for needle in needles]
if all(present):
    for needle in needles:
        if text.count(needle) != 1:
            raise SystemExit(f'recovery artifact duplicate: {needle}')
    print('recovery package artifacts already present exactly once')
    raise SystemExit(0)
if any(present):
    raise SystemExit(f'partial recovery package artifact state: {present}')
if text.count(anchor) != 1:
    raise SystemExit(f'expected exactly one camera live runtime anchor, found {text.count(anchor)}')
text = text.replace(anchor, anchor + ''.join(rows), 1)
path.write_text(text, encoding='utf-8')
final = path.read_text(encoding='utf-8')
for needle in needles:
    if final.count(needle) != 1:
        raise SystemExit(f'failed to write exactly one recovery artifact: {needle}')
print('inserted exact Battle recovery public package closure: reconnect + presentation + surface + live adapter')
