from pathlib import Path

html = Path('browser/GAMEROAD.html').read_text(encoding='utf-8')
needles = [
    '.battleMap{',
    '#fieldCanvas',
    '.routeSvg{',
    '.board{',
    '.battleAvatar{',
    'function nodeWorld',
    'function drawGrasslandGL',
    'gl.clearColor',
    "$$('.fieldBtn')",
    "setupField=",
    'function renderSetup',
    'function packSave',
    'function loadSave',
    'function renderField3D',
]
for needle in needles:
    i = html.find(needle)
    print(f'\n=== {needle} @ {i} ===')
    if i >= 0:
        print(html[max(0, i-1600): i+5200].replace('\n','\\n'))
