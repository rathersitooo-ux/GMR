import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEW_BASE_HAND3_UNIFORM_ASSIGNMENT_POLICY_SCHEMA,
  NEW_BASE_HAND3_UNIFORM_PERMUTATION_COUNT,
  createUniformHand3Assignment,
  drawUniformHand3PermutationIndex,
  resolveUniformHand3AssignmentFromPermutationIndex,
} from '../browser/new-base-hand3-uniform-assignment-policy.mjs';

const CARD_IDS = Object.freeze(['CARD_C', 'CARD_A', 'CARD_B']);
const HANDS = Object.freeze(['ROCK', 'SCISSORS', 'PAPER']);

test('all six permutation indexes cover all bijections exactly once and give every card each hand twice', () => {
  const seenMappings = new Set();
  const counts = new Map();

  for (let permutationIndex = 0; permutationIndex < NEW_BASE_HAND3_UNIFORM_PERMUTATION_COUNT; permutationIndex += 1) {
    const result = resolveUniformHand3AssignmentFromPermutationIndex({
      assignmentEpochId: 'turn:12',
      handCardIds: CARD_IDS,
      permutationIndex,
    });
    assert.equal(result.schema, NEW_BASE_HAND3_UNIFORM_ASSIGNMENT_POLICY_SCHEMA);
    assert.deepEqual(result.canonicalCardIds, ['CARD_A', 'CARD_B', 'CARD_C']);
    const mappingKey = HANDS.map((hand) => result.assignedCardIdsByJankenHand[hand]).join('|');
    seenMappings.add(mappingKey);

    for (const hand of HANDS) {
      const cardId = result.assignedCardIdsByJankenHand[hand];
      const key = `${cardId}:${hand}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  assert.equal(seenMappings.size, 6);
  for (const cardId of ['CARD_A', 'CARD_B', 'CARD_C']) {
    for (const hand of HANDS) {
      assert.equal(counts.get(`${cardId}:${hand}`), 2,
        'six equiprobable permutations give each physical card a 1/3 marginal chance per fixed hand');
    }
  }
});

test('the same physical cards and permutation index ignore incoming hand/UI order', () => {
  const first = resolveUniformHand3AssignmentFromPermutationIndex({
    assignmentEpochId: 'turn:stable',
    handCardIds: ['CARD_A', 'CARD_B', 'CARD_C'],
    permutationIndex: 4,
  });
  const reordered = resolveUniformHand3AssignmentFromPermutationIndex({
    assignmentEpochId: 'turn:stable',
    handCardIds: ['CARD_C', 'CARD_A', 'CARD_B'],
    permutationIndex: 4,
  });

  assert.deepEqual(reordered.assignedCardIdsByJankenHand, first.assignedCardIdsByJankenHand);
  assert.deepEqual(reordered.canonicalCardIds, first.canonicalCardIds);
});

test('uint32 rejection sampling removes modulo bias and never uses Math.random', () => {
  const supplied = [0xffff_ffff, 0xffff_fffe, 5];
  let calls = 0;
  const index = drawUniformHand3PermutationIndex(() => {
    calls += 1;
    return supplied.shift();
  });

  assert.equal(index, 5);
  assert.equal(calls, 3);
});

test('createUniformHand3Assignment draws one accepted authoritative index and returns a frozen mapping', () => {
  let calls = 0;
  const result = createUniformHand3Assignment({
    assignmentEpochId: 'turn:27',
    handCardIds: ['PHYS_3', 'PHYS_1', 'PHYS_2'],
    readUint32() {
      calls += 1;
      return 8;
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.permutationIndex, 2);
  assert.deepEqual(result.assignedCardIdsByJankenHand, {
    ROCK: 'PHYS_2',
    SCISSORS: 'PHYS_1',
    PAPER: 'PHYS_3',
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.assignedCardIdsByJankenHand), true);
});

test('policy rejects non-three-card hands, duplicates, bad indexes, and invalid entropy', () => {
  assert.throws(
    () => resolveUniformHand3AssignmentFromPermutationIndex({
      assignmentEpochId: 'turn:x',
      handCardIds: ['A', 'B'],
      permutationIndex: 0,
    }),
    /exactly 3 physical card ids/,
  );
  assert.throws(
    () => resolveUniformHand3AssignmentFromPermutationIndex({
      assignmentEpochId: 'turn:x',
      handCardIds: ['A', 'A', 'B'],
      permutationIndex: 0,
    }),
    /3 distinct physical card ids/,
  );
  assert.throws(
    () => resolveUniformHand3AssignmentFromPermutationIndex({
      assignmentEpochId: 'turn:x',
      handCardIds: ['A', 'B', 'C'],
      permutationIndex: 6,
    }),
    /integer in \[0, 5\]/,
  );
  assert.throws(
    () => drawUniformHand3PermutationIndex(() => -1),
    /integer in \[0, 4294967295\]/,
  );
});

{
const test=(await import('node:test')).default;
const assert=(await import('node:assert/strict')).default;
const policy=await import('../browser/new-base-hand3-uniform-assignment-policy.mjs');

const hand = ['HT_1','HT_2','HT_3','HT_4','HT_5','HT_6','HT_7'].map(id=>({id,suit:'HT'}));
function select(options={}) {
  assert.equal(typeof policy.ensureOpeningJankenAssignment,'function','opening 7→3 must be selected by the match authority');
  return policy.ensureOpeningJankenAssignment({selectionEpochId:'match-1:P1:opening',roundId:'battle-round:1',hand,readUint32:()=>0,...options});
}
test('seven same-suit cards yield three distinct fixed janken cards and four ordinary cards',()=>{
  const result=select();
  assert.equal(result.assignmentMode,'CURRENT_HAND3_POLICY');
  assert.deepEqual(result.slots.map(x=>x.jankenHand),['ROCK','SCISSORS','PAPER']);
  assert.equal(new Set(result.selectedJankenCardIds).size,3);
  assert.equal(result.ordinaryHandCardIds.length,4);
  assert.equal(new Set([...result.selectedJankenCardIds,...result.ordinaryHandCardIds]).size,7);
  assert.ok(result.slots.every(x=>x.nativeSuit==='HT'&&x.selectable));
});
test('render, hand reordering, and a changed current hand reuse the opening receipt without entropy',()=>{
  const first=select();
  const again=select({currentSnapshot:first,hand:hand.slice(2).reverse(),readUint32:()=>{throw Error('rerolled')}});
  assert.strictEqual(again,first);
});
test('a serialized authoritative receipt restores the same card mapping without a redraw',()=>{
  const first=select();
  const restored=select({currentSnapshot:JSON.parse(JSON.stringify(first)),readUint32:()=>{throw Error('rerolled')}});
  assert.deepEqual(restored,first);
  assert.ok(Object.isFrozen(restored)&&Object.isFrozen(restored.slots));
});
test('the 1260 equally likely draw sequences cover all 35 subsets and all six slot permutations equally',()=>{
  const subsets=new Map(), mappings=new Map();
  for(let a=0;a<7;a++)for(let b=0;b<6;b++)for(let c=0;c<5;c++)for(let p=0;p<6;p++){
    const values=[a,b,c,p];const x=select({readUint32:()=>values.shift()});
    const subset=[...x.selectedJankenCardIds].sort().join(',');
    const mapping=x.slots.map(s=>s.cardId).join(',');
    subsets.set(subset,(subsets.get(subset)||0)+1);mappings.set(mapping,(mappings.get(mapping)||0)+1);
  }
  assert.equal(subsets.size,35);assert.ok([...subsets.values()].every(n=>n===36));
  assert.equal(mappings.size,210);assert.ok([...mappings.values()].every(n=>n===6));
});
test('invalid opening counts and duplicated physical identities fail instead of making substitute cards',()=>{
  assert.throws(()=>select({hand:hand.slice(0,6)}),/7/);
  assert.throws(()=>select({hand:[...hand.slice(0,6),hand[0]]}),/distinct|unique/);
});

}
test('all ten five-card subsets receive equal membership weight and retain ordinary cards',async()=>{
 const {ensurePostDrawJankenAssignment:select}=await import('../browser/new-base-hand3-uniform-assignment-policy.mjs');
 const hand=['a','b','c','d','e'].map(id=>({id,suit:'HT'})),counts=new Map();
 for(let a=0;a<5;a++)for(let b=0;b<4;b++)for(let c=0;c<3;c++){
  const values=[a,b,c,0];const s=select({selectionEpochId:'M/P/2',roundId:'battle-round:2',hand,readUint32:()=>values.shift()});
  const key=[...s.selectedJankenCardIds].sort().join('');counts.set(key,(counts.get(key)||0)+1);
  assert.equal(s.ordinaryHandCardIds.length,2);assert.equal(new Set([...s.selectedJankenCardIds,...s.ordinaryHandCardIds]).size,5);
 }
 assert.equal(counts.size,10);assert.deepEqual([...new Set(counts.values())],[6]);assert.equal(hand.length,5);
});

test('post-draw receipts survive redraw and JSON restore without entropy and renew once next round',async()=>{
 const {ensurePostDrawJankenAssignment:select}=await import('../browser/new-base-hand3-uniform-assignment-policy.mjs');
 const hand=['a','b','c','d','e'].map(id=>({id,suit:'HT'}));let draws=0;
 const opts={selectionEpochId:'M/P/2',roundId:'battle-round:2',hand,readUint32:()=>{draws++;return 0;}};
 const s=select(opts);assert.equal(draws,4);assert.strictEqual(select({...opts,currentSnapshot:s}),s);assert.equal(draws,4);
 const saved=JSON.parse(JSON.stringify(s)),restored=select({...opts,currentSnapshot:saved,readUint32:()=>{throw Error('must not draw');}});assert.deepEqual(restored,s);assert.ok(Object.isFrozen(restored));
 const next=select({...opts,roundId:'battle-round:3',selectionEpochId:'M/P/3',currentSnapshot:s,hand:hand.slice(0,3)});assert.equal(draws,8);assert.equal(next.sourceHandCardIds.length,3);
 assert.throws(()=>select({...opts,roundId:'battle-round:3',currentSnapshot:s}),/round identity/);
});
