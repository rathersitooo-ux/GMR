from pathlib import Path
import subprocess

DONOR = '2934da813c8806991f57980c699bbad2d198b148'
DONOR_PATHS = [
    'browser/battle-screen-runtime-mount.mjs',
    'browser/battle-screen-runtime-mount-base.mjs',
    'tests/battle-screen-runtime-mount-base.test.mjs',
    'browser/battle-janken-slidepad-runtime-mount.mjs',
    'browser/battle-janken-slidepad-runtime-mount-base.mjs',
    'tests/battle-janken-slidepad-runtime-mount-base.test.mjs',
]

for raw_path in DONOR_PATHS:
    payload = subprocess.check_output(['git', 'show', f'{DONOR}:{raw_path}'])
    path = Path(raw_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    verify = subprocess.check_output(['git', 'show', f'{DONOR}:{raw_path}'])
    if path.read_bytes() != verify:
        raise SystemExit(f'donor byte mismatch: {raw_path}')

build_path = Path('deploy/cloudflare/scripts/build.mjs')
build = build_path.read_text()
entries = [
    "  { source: 'browser/battle-janken-slidepad-runtime-mount-base.mjs', output: 'battle-janken-slidepad-runtime-mount-base.mjs', artifact: 'battle_janken_slidepad_runtime_mount_base', label: 'Battle janken SlidePad runtime mount base' },\n",
    "  { source: 'browser/battle-screen-runtime-mount-base.mjs', output: 'battle-screen-runtime-mount-base.mjs', artifact: 'battle_screen_runtime_mount_base', label: 'Battle screen runtime mount base' },\n",
]
for entry in entries:
    source = entry.split("source: '", 1)[1].split("'", 1)[0]
    if source in build:
        raise SystemExit(f'base artifact already present: {source}')
anchor = "  { source: 'browser/battle-janken-slidepad-runtime-mount.mjs', output: 'battle-janken-slidepad-runtime-mount.mjs', artifact: 'battle_janken_slidepad_runtime_mount', label: 'Battle janken SlidePad runtime mount' },\n"
if anchor not in build:
    raise SystemExit('missing canonical janken runtime artifact anchor')
build = build.replace(anchor, anchor + ''.join(entries), 1)
build_path.write_text(build)

for entry in entries:
    source = entry.split("source: '", 1)[1].split("'", 1)[0]
    if build.count(source) != 1:
        raise SystemExit(f'expected exactly one artifact source: {source}')

print('restored R5 portrait runtime bytes and packaged both base modules')
