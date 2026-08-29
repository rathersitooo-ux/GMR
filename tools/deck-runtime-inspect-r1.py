from pathlib import Path
import re

path = Path('browser/GAMEROAD.html')
text = path.read_text(encoding='utf-8')
lines = text.splitlines()
patterns = [
    r'DEFAULT_DECK', r'savedDeck', r'saveDeck', r'deckCount', r'deck-count',
    r'reset.*deck', r'deck.*reset', r'localStorage', r'startMatch', r'start.*battle',
    r'matchStart', r'Battle', r'deck',
]
seen = set()
print(f'HTML_LINES={len(lines)} HTML_BYTES={len(text.encode("utf-8"))}')
for pat in patterns:
    rx = re.compile(pat, re.I)
    hits = [i for i, line in enumerate(lines) if rx.search(line)]
    print(f'\n=== PATTERN {pat} HITS {len(hits)} ===')
    for i in hits[:40]:
        key = (i // 8, pat)
        start = max(0, i - 3)
        end = min(len(lines), i + 4)
        sig = (start, end)
        if sig in seen:
            continue
        seen.add(sig)
        print(f'--- lines {start+1}-{end} ---')
        for n in range(start, end):
            line = lines[n]
            if len(line) > 700:
                line = line[:700] + ' …[truncated]'
            print(f'{n+1}: {line}')
