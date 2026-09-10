from pathlib import Path

html_path = Path('browser/GAMEROAD.html')
text = html_path.read_text(encoding='utf-8')
patterns = [
    'function checkWin',
    'roads[pos].length',
    'function endMatch',
    'function startMatch',
    'startMatch(',
    'optionalRules',
    'authorityRef',
    'ruleset',
    'room',
    'Room',
    'ルーム',
    '勝利',
    'GOAL_REACHED',
    'new-base-legacy-seven-win-gate-core.mjs',
    'battle-new-base-live-consumer-adapter.mjs',
    'battle-goal-arrival-live-integration.mjs',
    'type="module"',
    "type='module'",
]

lines = text.splitlines()
out = []
out.append(f'HTML_BYTES={html_path.stat().st_size}')
out.append(f'HTML_LINES={len(lines)}')
for pattern in patterns:
    hits = [i for i, line in enumerate(lines) if pattern in line]
    out.append(f'\n=== PATTERN {pattern!r} HITS={len(hits)} ===')
    for i in hits[:12]:
        start = max(0, i - 5)
        end = min(len(lines), i + 16)
        out.append(f'--- line {i+1} context {start+1}:{end} ---')
        for j in range(start, end):
            rendered = lines[j]
            if len(rendered) > 1200:
                rendered = rendered[:1200] + ' …[TRUNCATED]'
            out.append(f'{j+1:06d}: {rendered}')

# Also inventory external/local script sources near the end of the document.
out.append('\n=== SCRIPT SRC INVENTORY ===')
for i, line in enumerate(lines):
    if '<script' in line and ('src=' in line or 'type="module"' in line or "type='module'" in line):
        rendered = line if len(line) <= 1600 else line[:1600] + ' …[TRUNCATED]'
        out.append(f'{i+1:06d}: {rendered}')

Path('data/battle-configurable-completion-live-r1-probe.txt').write_text('\n'.join(out) + '\n', encoding='utf-8')
