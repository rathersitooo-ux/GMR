from pathlib import Path
import re

html_path = Path('browser/GAMEROAD.html')
text = html_path.read_text(encoding='utf-8')
lines = text.splitlines()
out = []

patterns = [
    ('renderRecords', re.compile(r'renderRecords|recordsList|data-screen=["\']records["\']')),
    ('history-write-read', re.compile(r'state\.history|\.history\s*=|history\s*:\s*\[')),
    ('save-authority', re.compile(r'SAVE_AUTHORITY|SAVE_KEY|SAVE_RECOVERY|GAMEROAD_SAVE|saveAuthority', re.I)),
    ('production-global', re.compile(r'(?:window|globalThis)\.[A-Za-z0-9_]*(?:HISTORY|STATE|SAVE)|GAMEROAD_[A-Z0-9_]+', re.I)),
    ('profile-module', re.compile(r'profile-presentation-runtime-mount|profilePresentation', re.I)),
]

out.append(f'HTML_BYTES={len(text.encode("utf-8"))}')
out.append(f'HTML_LINES={len(lines)}')
for label, rx in patterns:
    hits = [i for i, line in enumerate(lines) if rx.search(line)]
    out.append(f'\n=== {label} hits={len(hits)} ===')
    for i in hits[:80]:
        lo=max(0,i-4); hi=min(len(lines),i+5)
        out.append(f'--- lines {lo+1}-{hi} (hit {i+1}) ---')
        out.extend(f'{j+1}: {lines[j]}' for j in range(lo,hi))

# Compact exact function/assignment bodies where one-line minified source hides useful context.
for needle in ['function renderRecords', 'state.history', '__GAMEROAD_SAVE_RECOVERY__', 'SAVE_AUTHORITY']:
    idx=text.find(needle)
    out.append(f'\n=== raw {needle!r} index={idx} ===')
    if idx >= 0:
        lo=max(0,idx-1800); hi=min(len(text),idx+7000)
        out.append(text[lo:hi])

Path('/tmp/records-r4-diagnostics.txt').write_text('\n'.join(out), encoding='utf-8')
print('RECORDS_R4_DIAGNOSTICS_READY')
