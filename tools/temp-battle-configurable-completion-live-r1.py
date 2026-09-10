from pathlib import Path

html_path = Path('browser/GAMEROAD.html')
text = html_path.read_text(encoding='utf-8')
lines = text.splitlines()
out = [f'HTML_BYTES={html_path.stat().st_size}', f'HTML_LINES={len(lines)}']

line_patterns = [
    'function checkWin', 'function endMatch', 'function startMatch',
    'GOAL_REACHED', 'new-base-legacy-seven-win-gate-core.mjs',
    'battle-new-base-live-consumer-adapter.mjs',
    'battle-goal-arrival-live-integration.mjs', 'type="module"', "type='module'",
]
for pattern in line_patterns:
    hits = [i for i, line in enumerate(lines) if pattern in line]
    out.append(f'\n=== LINE PATTERN {pattern!r} HITS={len(hits)} ===')
    for i in hits[:12]:
        start = max(0, i - 3)
        end = min(len(lines), i + 6)
        out.append(f'--- line {i+1} context {start+1}:{end} ---')
        for j in range(start, end):
            rendered = lines[j]
            if len(rendered) > 1000:
                rendered = rendered[:1000] + ' …[LINE TRUNCATED]'
            out.append(f'{j+1:06d}: {rendered}')

char_patterns = [
    'function checkWin(){',
    'checkWin()',
    'function startMatch(){',
    'const FR=',
    'function sendAllLobby',
    'function renderLobby(){',
    'friendCreate2',
    'friendRoom:true',
    "m.friendRoom",
    "state.match={",
    'function endMatch(',
]
for pattern in char_patterns:
    positions = []
    cursor = 0
    while len(positions) < 12:
        idx = text.find(pattern, cursor)
        if idx < 0:
            break
        positions.append(idx)
        cursor = idx + max(1, len(pattern))
    out.append(f'\n=== CHAR PATTERN {pattern!r} HITS_SHOWN={len(positions)} ===')
    for idx in positions:
        before = max(0, idx - 1800)
        after = min(len(text), idx + 7000)
        snippet = text[before:after]
        out.append(f'--- char {idx} context {before}:{after} ---')
        out.append(snippet)

out.append('\n=== SCRIPT SRC INVENTORY ===')
for i, line in enumerate(lines):
    if '<script' in line and ('src=' in line or 'type="module"' in line or "type='module'" in line):
        rendered = line if len(line) <= 1800 else line[:1800] + ' …[LINE TRUNCATED]'
        out.append(f'{i+1:06d}: {rendered}')

Path('data/battle-configurable-completion-live-r1-probe.txt').write_text('\n'.join(out) + '\n', encoding='utf-8')
