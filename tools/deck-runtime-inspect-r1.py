from pathlib import Path
import re

path = Path('browser/GAMEROAD.html')
lines = path.read_text(encoding='utf-8').splitlines()
patterns = {
    'DEFAULT_DECK': r'\bDEFAULT_DECK\b',
    'READ_SAVED': r'\breadSavedDeck\b',
    'SAVE_DRAFT': r'\bsaveDraft\b',
    'LOCAL_SAVED': r"localStorage\.(?:getItem|setItem|removeItem)\([^\n]*['\"]savedDeck['\"]",
    'RESET_DECK': r'(?:reset[^\n]{0,80}deck|deck[^\n]{0,80}reset)',
    'DECK_COUNT_UI': r'(?:deck-count|deckCount)',
    'BATTLE_DECK': r'(?:getBattleDeckIds|__BATTLE_DECK_IDS__|resolveBattleStartDeck)',
    'START_MATCH': r'(?:startMatch|start[^\n]{0,40}(?:battle|match)|match[^\n]{0,40}start)',
    'MODULE_SCRIPT': r'<script[^>]*type=["\']module["\']',
    'MODULE_IMPORT': r'\bimport\s+[^;]+\s+from\s+["\'][^"\']+\.mjs["\']',
}

print(f'HTML_LINES={len(lines)}')
for name, pat in patterns.items():
    rx = re.compile(pat, re.I)
    hits = [i for i, line in enumerate(lines) if rx.search(line)]
    print(f'[{name}] count={len(hits)}')
    for i in hits[:8]:
        start = max(0, i - 1)
        end = min(len(lines), i + 2)
        print(f'  @{i+1}')
        for n in range(start, end):
            s = lines[n].strip().replace('\t', ' ')
            if len(s) > 260:
                s = s[:260] + ' …'
            print(f'    {n+1}: {s}')
