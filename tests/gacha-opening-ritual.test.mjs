import test from 'node:test';
import assert from 'node:assert/strict';
import{gachaRarityLevel,gachaRarityOf,planGachaRitual}from'../browser/gacha-opening-ritual.mjs';

test('confirmed bundle only drives presentation and is not mutated',()=>{
  const b=[{id:'A',rarity:'common'},{id:'B',rarity:'sr'},{id:'C',rarity:'ultimate'},{id:'D',rarity:'rare'}],before=JSON.stringify(b),p=planGachaRitual(b);
  assert.equal(p.motionMode,'interactive');assert.equal(p.peakRarity,'ultimate');assert.equal(p.peakIndex,2);assert.deepEqual(p.phaseSequence,['teal','violet','gold']);assert.deepEqual(p.concealedIndices,[1,2]);assert.equal(p.cracksRequired,4);assert.equal(JSON.stringify(b),before);assert.ok(Object.isFrozen(p));assert.ok(Object.isFrozen(p.phaseSequence));assert.ok(Object.isFrozen(p.concealedIndices));
});
test('ticket is presentation-only highest tier',()=>{
  const ticket={ticket:true,display_name:'特別券',rarity:'common'},b=[{id:'A',rarity:'rare'},ticket,{id:'B',rarity:'sr'}],p=planGachaRitual(b);
  assert.equal(gachaRarityOf(ticket),'ticket');assert.equal(gachaRarityLevel(ticket),4);assert.equal(p.peakRarity,'ticket');assert.equal(p.peakIndex,1);assert.deepEqual(p.concealedIndices,[1,2]);assert.deepEqual(b[1],ticket);
});
test('rarity escalation never falsely implies a higher result',()=>{
  assert.deepEqual(planGachaRitual([{rarity:'common'},{rarity:'rare'}]).phaseSequence,['teal']);
  assert.deepEqual(planGachaRitual([{rarity:'common'},{rarity:'sr'}]).phaseSequence,['teal','violet']);
});
test('reduced motion and low performance bypass heavy ritual and concealment',()=>{
  const b=[{rarity:'ultimate'},{rarity:'sr'}],r=planGachaRitual(b,{reducedMotion:true}),l=planGachaRitual(b,{lowPerf:true});
  assert.equal(r.motionMode,'still');assert.deepEqual(r.concealedIndices,[]);assert.equal(l.motionMode,'short_fade');assert.deepEqual(l.concealedIndices,[]);
});
test('unknown rarity is visually safe and empty bundles fail closed',()=>{
  assert.equal(gachaRarityOf({rarity:'mystery'}),'common');assert.equal(gachaRarityLevel('mystery'),0);assert.throws(()=>planGachaRitual([]),/non-empty ordered array/);assert.throws(()=>planGachaRitual(null),/non-empty ordered array/);
});
