import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../browser/GAMEROAD.html',import.meta.url),'utf8');
const starter=["SP_A", "SP_2", "SP_3", "SP_4", "SP_5", "SP_6", "SP_7", "SP_8", "SP_9", "SP_10", "SP_J", "SP_Q", "SP_K", "DI_A", "DI_2", "DI_3", "DI_4", "DI_5", "DI_6", "DI_7", "DI_8", "DI_9", "DI_10", "DI_J", "DI_Q", "DI_K", "CL_A", "CL_2", "CL_3", "CL_4", "CL_5", "CL_6", "CL_7", "CL_8", "CL_9", "CL_10", "CL_J", "CL_Q", "CL_K", "HT_A"];
const expected=['SP','DI','CL'].flatMap(suit=>['A','2','3','4','5','6','7','8','9','10','J','Q','K'].map(rank=>`${suit}_${rank}`)).concat('HT_A');

test('starter is exactly 39 non-hearts plus heart ace',()=>{
  assert.deepEqual(starter,expected);
  assert.equal(starter.length,40);
  assert.equal(new Set(starter).size,40);
  assert.deepEqual(starter.filter(id=>id.startsWith('HT_')),['HT_A']);
  assert.ok(html.includes('window.__STARTER_DECK__='+JSON.stringify(expected)+';'));
});

test('fresh and reset are ordinary registered deck state',()=>{
  assert.ok(html.includes('savedDeck:{main:[...STARTER_DECK],ex:[]},savedDeckRule:{id:DECK_RULE.id,revision:DECK_RULE.revision},deckDraft:{main:[...STARTER_DECK],ex:[]}'));
  assert.ok(html.includes('state.savedDeck={main:[...STARTER_DECK],ex:[]};state.savedDeckRule={id:DECK_RULE.id,revision:DECK_RULE.revision};state.deckDraft={main:[...STARTER_DECK],ex:[]}'));
  assert.ok(html.includes("!['current','missing'].includes(classification.status)"));
  assert.ok(html.includes("classification.status==='missing'"));
  assert.ok(html.includes('const registered=save()'));
});

test('no magic default or 26 migration remains',()=>{
  assert.equal(html.includes('__DEFAULT_DECK__'),false);
  assert.equal(html.includes('DEFAULT_DECK'),false);
  assert.equal(html.includes('LEGACY_FABRICATED_DEFAULT_DECK'),false);
  assert.equal(html.includes('migrateLegacyFabricatedDefaultDeck'),false);
  assert.equal(html.includes('id="defaultDeck"'),false);
});

test('battle requires the registered deck snapshot',()=>{
  assert.ok(html.includes("function makePlayer(i,human,deckIds){if(!Array.isArray(deckIds))throw Error('deck-required');const source=[...deckIds];"));
  assert.equal(html.includes('deckIds||'),false);
});

test('requested starter is legal under remaining deck checks and first paint is 40',()=>{
  assert.equal(html.includes("for(const r of ROYAL_RANKS)if(st.ranks[r]!==DECK_RULE.royalRequired)"),false);
  assert.ok(html.includes('requiredMain:40'));
  assert.ok(html.includes('id="r4DeckTotal">40</strong>'));
  assert.ok(html.includes('id="r4TrayCount">40 / 40</b>'));
});
