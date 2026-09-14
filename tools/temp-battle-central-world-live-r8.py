from pathlib import Path

p = Path('browser/GAMEROAD.html')
text = p.read_text(encoding='utf-8')
needles = [
    'function renderBoard(){',
    'function renderBoard()',
    'id="battleMap"',
    "id='battleMap'",
    'class="battleMap"',
    "class='battleMap'",
    'renderBoard();',
    'renderBoard()'
]
print('HTML_BYTES', len(text.encode('utf-8')))
for needle in needles:
    positions=[]
    start=0
    while True:
        i=text.find(needle,start)
        if i<0: break
        positions.append(i)
        start=i+1
    print('NEEDLE', repr(needle), 'COUNT', len(positions), 'POSITIONS', positions[:20])
    for i in positions[:3]:
        print('--- CONTEXT', repr(needle), i, '---')
        print(text[max(0,i-700):min(len(text),i+1800)])

# Also show nearby current Battle map section using the unique id if present.
for token in ['battleMap', 'battleRail', 'function renderPlayers(){', 'function renderBoard']:
    i=text.find(token)
    if i>=0:
        print('=== FIRST', token, i, '===')
        print(text[max(0,i-1800):min(len(text),i+5000)])

# Existing new-base presentation imports / globals if any.
for token in ['battle-new-base-board-live-presentation-composer', 'mountBattleNewBaseBoardLivePresentation', '__GAMEROAD_BATTLE']:
    hits=[]; start=0
    while True:
        i=text.find(token,start)
        if i<0: break
        hits.append(i); start=i+1
    print('TOKEN', token, 'COUNT', len(hits), 'POS', hits[:20])
