from pathlib import Path
import re

HTML = Path('browser/GAMEROAD.html')
TEST = Path('tests/starter-deck-40-contract.spec.mjs')
text = HTML.read_text(encoding='utf-8')


def sub(pattern, repl, label, expected=1, flags=0):
    global text
    text, count = re.subn(pattern, repl, text, flags=flags)
    if count != expected:
        raise SystemExit(f'{label}: expected {expected} replacement(s), got {count}')


# The player deck must never be bootstrapped from an invented card list.
sub(r'window\.__DEFAULT_DECK__=\[[^\]]*\];', '', 'embedded DEFAULT_DECK')
sub(r',DEFAULT_DECK=window\.__DEFAULT_DECK__', '', 'DEFAULT_DECK alias')

# Fresh state is an ordinary, not-yet-registered deck edit state.  No card
# composition is invented here; the normal commitDeck path is the only path
# that registers a player deck.
sub(r'savedDeck:\{main:\[\.\.\.DEFAULT_DECK\],ex:\[\]\}', 'savedDeck:{main:[],ex:[]}', 'fresh savedDeck')
sub(r'deckDraft:\{main:\[\.\.\.DEFAULT_DECK\],ex:\[\]\}', 'deckDraft:{main:[],ex:[]}', 'fresh deckDraft')

# Explicit reset returns to the same ordinary unregistered state.  It must not
# materialize a synthetic deck.
sub(r'state\.savedDeck=\{main:\[\.\.\.DEFAULT_DECK\],ex:\[\]\}', 'state.savedDeck={main:[],ex:[]}', 'reset savedDeck')
sub(r'state\.deckDraft=\{main:\[\.\.\.DEFAULT_DECK\],ex:\[\]\}', 'state.deckDraft={main:[],ex:[]}', 'reset deckDraft')

# Battle construction may not silently fall back to a magic deck.  Real match
# start already supplies the validated saved-deck snapshot explicitly.
sub(
    r'function makePlayer\(i,human,deckIds=null\)\{const source=\[\.\.\.\(deckIds\|\|DEFAULT_DECK\)\];',
    "function makePlayer(i,human,deckIds){if(!Array.isArray(deckIds))throw Error('deck-required');const source=[...deckIds];",
    'makePlayer implicit default',
)

# Conservation checks must use the deck that actually created the player.
sub(r'\(p\.sourceDeckSize\|\|DEFAULT_DECK\.length\)', 'p.sourceDeckSize', 'sourceDeckSize fallback')
sub(r'new Set\(p\.sourceDeckIds\|\|DEFAULT_DECK\)', "new Set(Array.isArray(p.sourceDeckIds)?p.sourceDeckIds:[])", 'sourceDeckIds fallback')

# Remove the obsolete player-facing "default deck" route completely.
sub(r'function defaultDeckDraft\(\)\{return false\}\n', '', 'defaultDeckDraft')
sub(r"\$\('#defaultDeck'\)\.addEventListener\('click',\(\)=>\{recentDeckCardId=null;defaultDeckDraft\(\)\}\);", '', 'defaultDeck listener')
sub(r',deckDefault:defaultDeckDraft', '', 'defaultDeck test export')
sub(r'<button class="btn" id="defaultDeck" hidden aria-hidden="true" tabindex="-1">既定デッキ</button>', '', 'defaultDeck button')

# Static first paint must not lie about a synthetic 26-card saved deck.
sub(r'<strong id="r4DeckTotal">26</strong>', '<strong id="r4DeckTotal">0</strong>', 'initial total')
sub(r'<em id="deckSaveState" class="deckSaved">保存済み</em>', '<em id="deckSaveState" class="deckDirty">未登録</em>', 'initial save state')
sub(r'<b id="r4TrayCount">26 / 40</b>', '<b id="r4TrayCount">0 / 40</b>', 'initial tray count')
sub(r'<small id="r4TrayState">保存済み</small>', '<small id="r4TrayState">未登録</small>', 'initial tray state')

# Distinguish an absent player deck from a saved deck whose draft simply has
# no edits.  Legacy non-empty saves remain registered/preserved as-is.
sub(
    r'function deckDirty\(\)\{return JSON\.stringify\(state\.deckDraft\)!==JSON\.stringify\(state\.savedDeck\)\}',
    "function deckRegistered(){return !!(state.savedDeckRule?.id||state.savedDeck.main.length||state.savedDeck.ex.length)}\nfunction deckDirty(){return !deckRegistered()||JSON.stringify(state.deckDraft)!==JSON.stringify(state.savedDeck)}",
    'deck registration state',
)
sub(
    r"\$\('#r4TrayState'\)&&\(\$\('#r4TrayState'\)\.textContent=deckDirty\(\)\?'未保存':'保存済み'\)",
    "$('#r4TrayState')&&($('#r4TrayState').textContent=!deckRegistered()?'未登録':(deckDirty()?'未保存':'保存済み'))",
    'tray registration state',
)
sub(
    r"const sv=\$\('#deckSaveState'\);sv\.textContent=deckDirty\(\)\?'未保存':'保存済み';sv\.className=deckDirty\(\)\?'deckDirty':'deckSaved';",
    "const sv=$('#deckSaveState'),registered=deckRegistered();sv.textContent=!registered?'未登録':(deckDirty()?'未保存':'保存済み');sv.className=registered&&!deckDirty()?'deckSaved':'deckDirty';",
    'deck save registration state',
)

# The 40-card regulation stays intact.  Historical 24/26/39 save sizes stay
# only as recovery classifications; this patch deliberately does not infer a
# starter identity from them and does not auto-fill them.
if 'requiredMain:40' not in text:
    raise SystemExit('40-card regulation disappeared unexpectedly')
if not re.search(r'recognizedLegacyRules:\[[^\]]*24[^\]]*26[^\]]*39', text):
    raise SystemExit('legacy save preservation boundary disappeared unexpectedly')
if 'DEFAULT_DECK' in text or '__DEFAULT_DECK__' in text:
    raise SystemExit('magic DEFAULT_DECK reference remains after patch')

HTML.write_text(text, encoding='utf-8')

TEST.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../browser/GAMEROAD.html',import.meta.url),'utf8');

test('player deck has no invented DEFAULT_DECK card list',()=>{
  assert.equal(html.includes('__DEFAULT_DECK__'),false);
  assert.equal(html.includes('DEFAULT_DECK'),false);
  assert.equal(html.includes('id="defaultDeck"'),false);
  assert.equal(html.includes('defaultDeckDraft'),false);
});

test('fresh and reset player deck are ordinary unregistered edit state',()=>{
  assert.match(html,/savedDeck:\{main:\[\],ex:\[\]\},savedDeckRule:\{id:null,revision:null\},deckDraft:\{main:\[\],ex:\[\]\}/);
  assert.match(html,/state\.savedDeck=\{main:\[\],ex:\[\]\}/);
  assert.match(html,/state\.deckDraft=\{main:\[\],ex:\[\]\}/);
  assert.match(html,/function deckRegistered\(\)/);
  assert.match(html,/未登録/);
});

test('battle player construction requires an explicit deck snapshot',()=>{
  assert.match(html,/function makePlayer\(i,human,deckIds\)\{if\(!Array\.isArray\(deckIds\)\)throw Error\('deck-required'\);const source=\[\.\.\.deckIds\];/);
  assert.doesNotMatch(html,/deckIds\|\|/);
  assert.match(html,/makePlayer\(i,i===0,playerDeckSnapshot\)/);
});

test('40-card regulation remains, but legacy sizes are recovery data only',()=>{
  assert.match(html,/requiredMain:40/);
  assert.match(html,/recognizedLegacyRules:\[[^\]]*24[^\]]*26[^\]]*39/);
  assert.doesNotMatch(html,/\[\.\.\.(?:DEFAULT|STARTER)/);
});

test('first paint no longer claims the fabricated 26-card deck',()=>{
  assert.match(html,/id="r4DeckTotal">0<\/strong>/);
  assert.match(html,/id="r4TrayCount">0 \/ 40<\/b>/);
  assert.doesNotMatch(html,/id="r4DeckTotal">26<\/strong>/);
  assert.doesNotMatch(html,/id="r4TrayCount">26 \/ 40<\/b>/);
});
''', encoding='utf-8')
print('starter deck root repair applied')
