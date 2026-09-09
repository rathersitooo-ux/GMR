#!/usr/bin/env python3
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
HTML = ROOT / 'browser' / 'GAMEROAD.html'
text = HTML.read_text(encoding='utf-8')
lines = text.splitlines()

patterns = [
    r'animateResolvedPath',
    r'battleRuntime',
    r'boardPlayers',
    r'boardPlayerToken',
    r'function renderBoard',
    r'function startMatch',
    r'characterId',
    r'characterID',
    r'character_id',
    r'partner\.naki',
    r'players\s*[:=]',
    r'p\.position',
    r'position=',
    r'lowPerf',
    r'reduceMotion',
]

print('HTML_BYTES', HTML.stat().st_size)
print('LINE_COUNT', len(lines))
for pattern in patterns:
    rx = re.compile(pattern)
    hits = [i for i, line in enumerate(lines) if rx.search(line)]
    print(f'\n=== {pattern} HITS {len(hits)} ===')
    for i in hits[:24]:
        lo = max(0, i - 2)
        hi = min(len(lines), i + 3)
        print(f'--- {lo+1}:{hi} ---')
        for j in range(lo, hi):
            print(f'{j+1}: {lines[j][:1600]}')

# High-signal function bodies / surrounding source by exact textual anchors.
anchors = [
    'async function animateResolvedPath',
    'function animateResolvedPath',
    'function renderBoard',
    'function startMatch',
    "id='battleRuntime'",
    'id="battleRuntime"',
]
for anchor in anchors:
    idx = text.find(anchor)
    print(f'\n=== ANCHOR {anchor!r} INDEX {idx} ===')
    if idx >= 0:
        print(text[max(0, idx-2500):idx+9000])

# Inventory player object construction lines without assuming identity field names.
print('\n=== PLAYER OBJECT / IDENTITY CANDIDATES ===')
for i, line in enumerate(lines):
    if ('P1' in line or 'P2' in line or 'P3' in line or 'P4' in line) and any(k in line for k in ('name:', 'human:', 'team:', 'avatar', 'character', 'skin', 'partner')):
        print(f'{i+1}: {line[:2200]}')

# Contract assertions that are safe even during probe-only stage.
assert 'browser/GAMEROAD.html' not in text[:0]
print('\nPROBE_OK')
