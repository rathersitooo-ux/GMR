from pathlib import Path
import json
import re

path = Path('browser/GAMEROAD.html')
s = path.read_text(encoding='utf-8')

ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K']
starter = [f'{suit}_{rank}' for suit in ('SP','DI','CL') for rank in ranks] + ['HT_A']
legacy = ['SP_A','SP_2','SP_3','SP_4','SP_5','SP_6','HT_A','HT_2','HT_3','HT_4','HT_5','HT_6','DI_A','DI_2','DI_3','DI_4','DI_5','DI_6','CL_A','CL_2','CL_3','CL_4','CL_5','CL_6','SP_7','HT_7']
assert len(starter) == 40 and len(set(starter)) == 40
assert len(legacy) == 26 and len(set(legacy)) == 26

starter_js = json.dumps(starter, ensure_ascii=False, separators=(',', ':'))
legacy_js = json.dumps(legacy, ensure_ascii=False, separators=(',', ':'))

s, n = re.subn(r'window\.__DEFAULT_DECK__=\[[^\]]*\];', f'window.__DEFAULT_DECK__={starter_js};', s, count=1)
if n != 1:
    raise SystemExit(f'expected exactly one __DEFAULT_DECK__, got {n}')

for old, new in (
    ('id="r4DeckTotal">26</strong>', 'id="r4DeckTotal">40</strong>'),
    ('id="r4TrayCount">26 / 40</b>', 'id="r4TrayCount">40 / 40</b>'),
):
    if old not in s:
        raise SystemExit(f'expected UI baseline missing: {old}')
    s = s.replace(old, new, 1)

royal_pattern = r"for\(const r of ROYAL_RANKS\)if\(st\.ranks\[r\]!==DECK_RULE\.royalRequired\)errors\.push\(`ロイヤルカード\$\{r\}はデッキに1枚必要です（現在\$\{st\.ranks\[r\]\}枚）`\);"
s, royal_n = re.subn(royal_pattern, '', s, count=1)
if royal_n != 1:
    raise SystemExit(f'expected fabricated royal-rank blocker exactly once, got {royal_n}')

marker = 'function cardLabel(id){'
if marker not in s:
    raise SystemExit('cardLabel insertion marker missing')
helper = (
    f"const LEGACY_FABRICATED_DEFAULT_DECK={legacy_js};\n"
    "function isLegacyFabricatedDefaultDeck(deck){return !!deck&&Array.isArray(deck.main)&&Array.isArray(deck.ex)&&deck.ex.length===0&&deck.main.length===LEGACY_FABRICATED_DEFAULT_DECK.length&&deck.main.every((id,i)=>id===LEGACY_FABRICATED_DEFAULT_DECK[i])}\n"
    "function migrateLegacyFabricatedDefaultDeckInMemory(){const next=()=>({main:[...window.__DEFAULT_DECK__],ex:[]});if(isLegacyFabricatedDefaultDeck(state.savedDeck))state.savedDeck=next();if(isLegacyFabricatedDefaultDeck(state.deckDraft))state.deckDraft=next()}\n"
)
if 'LEGACY_FABRICATED_DEFAULT_DECK=' not in s:
    s = s.replace(marker, helper + marker, 1)
else:
    raise SystemExit('legacy migration helper already exists unexpectedly')

for name in ('renderCards', 'renderSetupDeckStatus'):
    old = f'function {name}(){{'
    new = f'function {name}(){{migrateLegacyFabricatedDefaultDeckInMemory();'
    if old not in s:
        raise SystemExit(f'{name} insertion point missing')
    s = s.replace(old, new, 1)

# Static acceptance: exact starter, no fabricated royal blocker, exact-only legacy correction.
if f'window.__DEFAULT_DECK__={starter_js};' not in s:
    raise SystemExit('starter exact composition not installed')
if 'ロイヤルカード${r}はデッキに1枚必要です' in s:
    raise SystemExit('fabricated global royal-rank blocker remains')
if 'id="r4DeckTotal">40</strong>' not in s or 'id="r4TrayCount">40 / 40</b>' not in s:
    raise SystemExit('first-paint 40/40 not installed')
if f'const LEGACY_FABRICATED_DEFAULT_DECK={legacy_js};' not in s:
    raise SystemExit('exact legacy 26 signature missing')
if 'function migrateLegacyFabricatedDefaultDeckInMemory()' not in s:
    raise SystemExit('legacy correction missing')

path.write_text(s, encoding='utf-8')
print('starter-deck-40-product-r3: bounded product patch applied')
