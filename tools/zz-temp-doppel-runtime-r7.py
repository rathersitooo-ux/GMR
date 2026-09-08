from pathlib import Path
import re

path = Path('browser/GAMEROAD.html')
text = path.read_text(encoding='utf-8')
lines = text.splitlines()

needles = [
    'roadValueOf',
    'road-move-compatibility-core',
    'compatibleRoadCards',
    'currentValue',
    'printedValue',
    'baseValue',
    'printedPower',
    'doppelganger',
    'battleValue',
    'attackValue',
    'powerOf',
]

print(f'HTML_BYTES={len(text.encode("utf-8"))} LINES={len(lines)}')
for needle in needles:
    hits = [i for i, line in enumerate(lines, 1) if needle.lower() in line.lower()]
    print(f'NEEDLE {needle!r} COUNT={len(hits)} HITS={hits[:30]}')
    for line_no in hits[:12]:
        lo = max(1, line_no - 5)
        hi = min(len(lines), line_no + 8)
        print(f'--- {needle} CONTEXT {lo}:{hi} ---')
        for n in range(lo, hi + 1):
            line = lines[n - 1]
            if len(line) > 1200:
                line = line[:1200] + '…'
            print(f'{n}: {line}')

# Additional focused discovery around object methods that look like numeric card authorities.
patterns = [
    re.compile(r'\b(?:road|battle|card|attack|power|current|printed|base)[A-Za-z0-9_]*Value(?:Of)?\b', re.I),
    re.compile(r'\bValueOf\s*[:=]\s*(?:function|\([^)]*\)\s*=>)', re.I),
]
seen = set()
for i, line in enumerate(lines, 1):
    if any(p.search(line) for p in patterns):
        key = (i, line.strip()[:200])
        if key in seen:
            continue
        seen.add(key)
        print(f'NUMERIC_CANDIDATE {i}: {line[:1600]}')

if not any('roadValueOf' in line for line in lines):
    raise SystemExit('FAIL_CLOSED: live HTML has no roadValueOf seam; do not patch product')
