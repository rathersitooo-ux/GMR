from pathlib import Path

path = Path('browser/GAMEROAD.html')
text = path.read_text(encoding='utf-8')
print('HTML_BYTES', len(text.encode('utf-8')))
needles = [
    'battle-screen-runtime-mount.mjs',
    'mountBattleScreenExternalSurface',
    'battleScreenRuntime',
    'function renderBattle',
    'renderBattle()',
    'const me =',
    'let me =',
    'me.honey',
    'me.chip',
    'honeyMeter',
]
for needle in needles:
    positions = []
    start = 0
    while True:
        idx = text.find(needle, start)
        if idx < 0:
            break
        positions.append(idx)
        start = idx + len(needle)
        if len(positions) >= 8:
            break
    print(f'NEEDLE {needle!r} COUNT {len(positions)} POS {positions}')
    for n, idx in enumerate(positions[:4], 1):
        lo = max(0, idx - 900)
        hi = min(len(text), idx + len(needle) + 1300)
        snippet = text[lo:hi]
        print(f'--- {needle} #{n} @ {idx} ---')
        print(snippet)
        print('--- END ---')
