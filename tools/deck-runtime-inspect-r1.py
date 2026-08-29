from pathlib import Path
import re

lines = Path('browser/GAMEROAD.html').read_text(encoding='utf-8').splitlines()
patterns = {
    'STATE_DECK': r'state=\{[^\n]*deckDraft',
    'DECK_DRAFT': r'\bdeckDraft\b',
    'VALIDATE_DECK': r'\bvalidateDeck\b',
    'SAVE_FN': r'function\s+save\s*\(',
    'LOAD_FN': r'function\s+(?:load|restore)[A-Za-z0-9_]*\s*\(',
    'SAVE_RECOVERY': r'(?:inspectRawSave|classifyDeckProjection|prepareExplicitDeckCommit|writePreparedSaveVerified|resetExplicitSaveKeys)',
    'START_CLICK': r"(?:\$\(['\"]#startMatch['\"]\)|getElementById\(['\"]startMatch['\"])[^\n]{0,120}(?:onclick|addEventListener)",
    'START_ID': r'\bstartMatch\b',
    'SETUP_DECK_NOTE': r'\bsetupDeckNote\b',
    'DEFAULT_ASSIGN': r'\bDEFAULT_DECK\b',
}
print(f'HTML_LINES={len(lines)}')
for name, pat in patterns.items():
    rx = re.compile(pat, re.I)
    hits = [i for i,line in enumerate(lines) if rx.search(line)]
    print(f'[{name}] count={len(hits)}')
    for i in hits[:12]:
        print(f'  @{i+1}')
        for n in range(max(0,i-2), min(len(lines),i+3)):
            s=lines[n].strip().replace('\t',' ')
            if len(s)>420:s=s[:420]+' …'
            print(f'    {n+1}: {s}')
