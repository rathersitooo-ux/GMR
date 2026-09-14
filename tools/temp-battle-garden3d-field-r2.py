from pathlib import Path

html = Path('browser/GAMEROAD.html').read_text(encoding='utf-8')
needles = [
    'data-field="FIELD-10"',
    "const BATTLE_FIELD_CURRENT_ID",
    'function normalizeBattleFieldId',
    'function symmetricFieldActive',
    'function symmetricFieldWorld',
    'function symmetricShieldRoadWorld',
    'function renderFieldTopologyOverlay',
    'function renderField3D',
    'function pushBox',
    'id="fieldCanvas"',
    'id="battleMap"',
]
for needle in needles:
    i = html.find(needle)
    print(f'\n=== {needle} @ {i} ===')
    if i >= 0:
        print(html[max(0, i-1000): i+3500].replace('\n','\\n'))
