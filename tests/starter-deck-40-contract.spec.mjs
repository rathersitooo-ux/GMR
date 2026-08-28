import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../browser/GAMEROAD.html',import.meta.url),'utf8');
const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const expected=['SP','DI','CL'].flatMap(suit=>ranks.map(rank=>`${suit}_${rank}`)).concat('HT_A');
const legacy=['SP_A','SP_2','SP_3','SP_4','SP_5','SP_6','HT_A','HT_2','HT_3','HT_4','HT_5','HT_6','DI_A','DI_2','DI_3','DI_4','DI_5','DI_6','CL_A','CL_2','CL_3','CL_4','CL_5','CL_6','SP_7','HT_7'];

function jsonArrayAfter(name){
  const m=html.match(new RegExp(name.replaceAll('.', '\\.')+'=(\\[[^\\]]*\\]);'));
  assert.ok(m,`${name} missing`);
  return JSON.parse(m[1]);
}

test('fresh starter is the exact fixed 40-card ordinary deck',()=>{
  const deck=jsonArrayAfter('window.__DEFAULT_DECK__');
  assert.deepEqual(deck,expected);
  assert.equal(deck.length,40);
  assert.equal(new Set(deck).size,40);
  assert.deepEqual(deck.filter(id=>id.startsWith('HT_')),['HT_A']);
});

test('first paint shows 40 of 40',()=>{
  assert.ok(html.includes('id="r4DeckTotal">40</strong>'));
  assert.ok(html.includes('id="r4TrayCount">40 / 40</b>'));
});

test('only the exact fabricated legacy 26 starter is eligible for correction',()=>{
  assert.deepEqual(jsonArrayAfter('const LEGACY_FABRICATED_DEFAULT_DECK'),legacy);
  assert.ok(html.includes('deck.ex.length===0&&deck.main.length===LEGACY_FABRICATED_DEFAULT_DECK.length&&deck.main.every((id,i)=>id===LEGACY_FABRICATED_DEFAULT_DECK[i])'));
  assert.ok(html.includes('if(isLegacyFabricatedDefaultDeck(state.savedDeck))state.savedDeck=next()'));
  assert.ok(html.includes('if(isLegacyFabricatedDefaultDeck(state.deckDraft))state.deckDraft=next()'));
});

test('legacy correction is applied before deck and setup rendering',()=>{
  assert.ok(html.includes('function renderCards(){migrateLegacyFabricatedDefaultDeckInMemory();'));
  assert.ok(html.includes('function renderSetupDeckStatus(){migrateLegacyFabricatedDefaultDeckInMemory();'));
});

test('existing deck rule enforcement remains intact',()=>{
  assert.ok(html.includes('for(const r of ROYAL_RANKS)if(st.ranks[r]!==DECK_RULE.royalRequired)'));
});
