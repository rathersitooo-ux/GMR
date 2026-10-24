import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_PRECOMMIT_CLEAR_CONTRACT,
  BATTLE_PRECOMMIT_CLEAR_SCHEMA,
  clearBattlePrecommitSelection,
} from '../browser/battle-precommit-clear-core.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('plan phase clears both card reservations and the staged movement path in one operation', () => {
  const input = {
    phase: 'plan',
    busy: false,
    planSubmitted: false,
    position: 'C:0:0',
    plan: {
      roadId: 'road-7',
      battleId: 'battle-3',
      path: ['C:0:0', 'C:0:1', 'C:0:2'],
    },
    targetDraft: null,
  };
  const before = clone(input);
  const result = clearBattlePrecommitSelection(input);

  assert.equal(result.cleared, true);
  assert.equal(result.reason, 'CLEARED_PLAN_DRAFT');
  assert.deepEqual(result.clearedFields, ['roadId', 'battleId', 'path']);
  assert.deepEqual(result.next.plan, {
    roadId: null,
    battleId: null,
    path: ['C:0:0'],
  });
  assert.equal(result.next.targetDraft, null);
  assert.equal(result.authoritativeRollback, false);
  assert.equal(result.gameStateWrite, false);
  assert.deepEqual(input, before);
});

test('plan phase reports nothing to clear when already at the unselected baseline', () => {
  const result = clearBattlePrecommitSelection({
    phase: 'plan',
    position: 'C:0:0',
    plan: { roadId: null, battleId: null, path: ['C:0:0'] },
  });

  assert.equal(result.cleared, false);
  assert.equal(result.reason, 'NOTHING_TO_CLEAR');
  assert.deepEqual(result.next.plan.path, ['C:0:0']);
});

test('plan clear fails closed once the plan was already submitted', () => {
  const result = clearBattlePrecommitSelection({
    phase: 'plan',
    position: 'C:0:0',
    planSubmitted: true,
    plan: { roadId: 'road-1', battleId: 'battle-2', path: ['C:0:0', 'C:0:1'] },
  });

  assert.equal(result.cleared, false);
  assert.equal(result.reason, 'PLAN_ALREADY_SUBMITTED');
  assert.equal(result.next.plan.roadId, 'road-1');
  assert.equal(result.next.plan.battleId, 'battle-2');
  assert.deepEqual(result.next.plan.path, ['C:0:0', 'C:0:1']);
});

test('busy or commit-in-flight state rejects clear before considering either phase', () => {
  for (const phase of ['plan', 'target']) {
    const result = clearBattlePrecommitSelection({
      phase,
      busy: true,
      position: 'C:0:0',
      plan: { roadId: 'road-1', battleId: 'battle-2', path: ['C:0:0'] },
      targetDraft: { defenderId: 'P2', lane: 'L', shield: 'C' },
    });
    assert.equal(result.cleared, false);
    assert.equal(result.reason, 'BUSY_OR_COMMIT_IN_FLIGHT');
  }
});

test('target phase clears only the uncommitted target draft and preserves the committed plan', () => {
  const input = {
    phase: 'target',
    busy: false,
    targetCommitted: false,
    position: 'C:0:2',
    plan: {
      roadId: 'road-7',
      battleId: 'battle-3',
      path: ['C:0:0', 'C:0:1', 'C:0:2'],
    },
    targetDraft: { defenderId: 'P2', lane: 'R', shield: 'L' },
  };
  const before = clone(input);
  const result = clearBattlePrecommitSelection(input);

  assert.equal(result.cleared, true);
  assert.equal(result.reason, 'CLEARED_TARGET_DRAFT');
  assert.deepEqual(result.clearedFields, ['targetDraft']);
  assert.equal(result.next.targetDraft, null);
  assert.deepEqual(result.next.plan, input.plan);
  assert.deepEqual(input, before);
});

test('target clear fails closed once authoritative target commit occurred', () => {
  const result = clearBattlePrecommitSelection({
    phase: 'target',
    targetCommitted: true,
    position: 'C:0:2',
    plan: { roadId: 'road-7', battleId: 'battle-3', path: ['C:0:0', 'C:0:2'] },
    targetDraft: { defenderId: 'P2', lane: 'C', shield: 'R' },
  });

  assert.equal(result.cleared, false);
  assert.equal(result.reason, 'TARGET_ALREADY_COMMITTED');
  assert.deepEqual(result.next.targetDraft, { defenderId: 'P2', lane: 'C', shield: 'R' });
});

test('resolve and later phases can never use precommit clear as a rollback', () => {
  for (const phase of ['resolve', 'reveal', 'move', 'result']) {
    const result = clearBattlePrecommitSelection({
      phase,
      position: 'C:0:2',
      plan: { roadId: 'road-7', battleId: 'battle-3', path: ['C:0:0', 'C:0:2'] },
      targetDraft: { defenderId: 'P2', lane: 'C', shield: 'R' },
    });
    assert.equal(result.cleared, false);
    assert.equal(result.reason, 'PHASE_NOT_CLEARABLE');
    assert.equal(result.authoritativeRollback, false);
    assert.equal(result.gameStateWrite, false);
  }
});

test('contract explicitly denies gameplay authority and authoritative rollback', () => {
  assert.equal(BATTLE_PRECOMMIT_CLEAR_SCHEMA, 'gameroad.battle-precommit-clear.v1');
  assert.equal(BATTLE_PRECOMMIT_CLEAR_CONTRACT.schema, BATTLE_PRECOMMIT_CLEAR_SCHEMA);
  assert.equal(BATTLE_PRECOMMIT_CLEAR_CONTRACT.authority, 'NONE_CALLER_OWNS_STATE');
  assert.equal(BATTLE_PRECOMMIT_CLEAR_CONTRACT.precommitOnly, true);
  assert.equal(BATTLE_PRECOMMIT_CLEAR_CONTRACT.authoritativeRollback, false);
  assert.equal(BATTLE_PRECOMMIT_CLEAR_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_PRECOMMIT_CLEAR_CONTRACT.planSubmittedRollback, false);
  assert.equal(BATTLE_PRECOMMIT_CLEAR_CONTRACT.committedTargetRollback, false);
  assert.deepEqual(BATTLE_PRECOMMIT_CLEAR_CONTRACT.clearablePhases, ['plan', 'target']);
});

{
const test=(await import('node:test')).default;
const assert=(await import('node:assert/strict')).default;
const {readFileSync}=await import('node:fs');
const vm=(await import('node:vm')).default;
const {clearBattlePrecommitSelection}=await import('../browser/battle-precommit-clear-core.mjs');

// Execute the real HTML's existing clear operation, including its real policy.
const html=readFileSync(new URL('../browser/GAMEROAD.html',import.meta.url),'utf8');
const start=html.indexOf('async function grClearBattlePrecommitSelection(){');
const end=html.indexOf('const __grBattlePrecommitBaseCommitPlans',start);
const clearSource=html.slice(start,end);
function scenario({busy=false,submitted=false,phase='plan',empty=false}={}){
 const me={id:'P1',position:'C:0:0',hand:['a','b','c','d','e','f','g'],openingJankenAssignment:{selectedJankenCardIds:['a','b','c']},plan:{roadId:empty?null:'a',battleId:null,path:['C:0:0']}};
 const match={players:[me],busy,phase};
 const selects=new Map([['#roadSelect',{value:empty?'':'a'}],['#battleSelect',{value:''}],['#endpointText',{textContent:''}]]);
 const context={state:{match},grBattlePrecommitClearCorePromise:Promise.resolve({clearBattlePrecommitSelection}),grBattleFriendPlanSubmitted:()=>submitted,grBattlePrecommitCommitInFlight:null,$:id=>selects.get(id),renderBoard(){},syncDirectPlanRoleUi(){},updateBattleAvatar(){},renderBattle(){},grSyncBattlePrecommitClear(){}};
 vm.createContext(context);vm.runInContext(clearSource,context);
 return{me,context,clear:context.grClearBattlePrecommitSelection};
}
test('accepted clear rearms the same assigned trio, without changing hand or rerolling',async()=>{
 const x=scenario(),assignment=x.me.openingJankenAssignment,hand=[...x.me.hand];
 assert.equal(await x.clear(),true);
 assert.equal(x.me.jankenDraftRevision,1,'renderer needs an authority-owned accepted clear revision');
 assert.strictEqual(x.me.openingJankenAssignment,assignment);
 assert.deepEqual(x.me.hand,hand);
 assert.equal(x.me.plan.roadId,null);
 assert.equal(await x.clear(),false);
 assert.equal(x.me.jankenDraftRevision,1,'nothing-to-clear must not unlock again');
});
test('submitted, busy and post-plan states do not rearm a spent launcher',async()=>{
 for(const options of [{busy:true},{submitted:true},{phase:'resolve'}]){
  const x=scenario(options);assert.equal(await x.clear(),false);assert.equal(x.me.jankenDraftRevision,undefined);
 }
});

}
