from pathlib import Path
import re

html_path = Path('browser/GAMEROAD.html')
report_path = Path('data/battle-shared-live-r3-probe.txt')
text = html_path.read_text(encoding='utf-8')
lines = text.splitlines()

patterns = [
    r'battle-new-base-live-consumer-adapter',
    r'battle-janken-slidepad-runtime-mount',
    r'new-base-round-start-janken-slot-assignment-core',
    r'new-base-hand3-uniform-assignment-policy',
    r'battle-janken-compound-attack-package-core',
    r'resolveBattle',
    r'function\s+startRound|\bstartRound\b',
    r'function\s+nextRound|\bnextRound\b',
    r'renderHand',
    r'planSubmitted',
    r'targetCommitted',
    r'legalTarget|legalTargets|targetCandidates|candidateTargets',
    r'battleTarget|targetPlayer|targetId|opponentId',
    r'shieldLane|shieldRef|shieldIndex|shield',
    r'crypto\.getRandomValues|getRandomValues',
    r'Math\.random',
    r'randomInt|randInt|nextRandom|rng|seed',
    r'roundId|roundIndex|roundNo|state\.round|match\.round',
    r'hand\s*[:=]|\.hand\b',
    r'initialHand|dealHand|drawTo|refill',
    r'clickHand|handCard|playCard|selectedCard|commitCard',
    r'type=["\']module["\']|<script[^>]+src=',
]

out = []
out.append(f'bytes={len(text.encode("utf-8"))} chars={len(text)} lines={len(lines)}')
out.append('MODE=PROBE_ONLY_PRODUCT_WRITE0')
out.append('')
for pat in patterns:
    rx = re.compile(pat, re.I)
    hits = [i for i, line in enumerate(lines) if rx.search(line)]
    out.append(f'=== PATTERN {pat} hits={len(hits)} ===')
    for idx in hits[:12]:
        lo = max(0, idx - 3)
        hi = min(len(lines), idx + 4)
        out.append(f'--- hit line {idx+1} context {lo+1}-{hi} ---')
        for j in range(lo, hi):
            clipped = lines[j]
            if len(clipped) > 500:
                clipped = clipped[:500] + ' …[clipped]'
            out.append(f'{j+1:06d}: {clipped}')
    out.append('')

# Also record nearby module import/boot references in one bounded census.
interesting = []
for i, line in enumerate(lines):
    if ('battle-' in line or 'new-base-' in line) and ('.mjs' in line or 'import(' in line or 'script' in line):
        interesting.append((i, line))
out.append(f'=== BATTLE/NEW-BASE MODULE CENSUS hits={len(interesting)} ===')
for i, line in interesting[:120]:
    clipped = line if len(line) <= 700 else line[:700] + ' …[clipped]'
    out.append(f'{i+1:06d}: {clipped}')

report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text('\n'.join(out) + '\n', encoding='utf-8')
print(f'wrote {report_path} with {len(out)} lines')
