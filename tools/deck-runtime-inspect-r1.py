from pathlib import Path
import re

lines = Path('browser/GAMEROAD.html').read_text(encoding='utf-8').splitlines()
patterns = {
    'CARD_DATA_DEFINE': r'(?:window\.__CARD_DATA__\s*=|__CARD_DATA__\s*=)',
    'DEFAULT_DECK_DEFINE': r'(?:window\.__DEFAULT_DECK__\s*=|__DEFAULT_DECK__\s*=)',
    'CARD_DATA_USE': r'window\.__CARD_DATA__',
    'DEFAULT_DECK_USE': r'window\.__DEFAULT_DECK__',
    'SAVE_PACK': r'function\s+savePack\s*\(',
    'APPLY_PARSED': r'function\s+applyParsedSave\s*\(',
    'LOAD': r'function\s+load\s*\(',
    'COMMIT_DECK': r'function\s+commitDeck\s*\(',
    'START_MATCH': r'function\s+startMatch\s*\(',
    'DECK_CONTROLS': r'(?:id=["\'](?:saveDeck|restoreDeck|deckValidation|deckCount|deckSlots|exDeckSlots)["\'])',
}
print(f'HTML_LINES={len(lines)}')
for name, pat in patterns.items():
    rx = re.compile(pat, re.I)
    hits = [i for i,line in enumerate(lines) if rx.search(line)]
    print(f'[{name}] count={len(hits)}')
    for i in hits[:10]:
        print(f'  @{i+1}')
        for n in range(max(0,i-2), min(len(lines),i+3)):
            s=lines[n].strip().replace('\t',' ')
            if len(s)>900:s=s[:900]+' …'
            print(f'    {n+1}: {s}')
