import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadyPlanFeedbackAdapter} from '../browser/ui-state-feedback-ready-plan-adapter.mjs';

const cfg = {holdMs:500, moveCancelDistance:20, rightSwipeDistance:45};
const make = (options={}) => {
  const calls=[];
  const adapter=createReadyPlanFeedbackAdapter({config:cfg, commit:(command)=>{calls.push(command); return `commit:${command.operationToken}`;}, ...options});
  return {adapter,calls};
};

test('primary release commits once and enters pending until matching ack',()=>{
  const {adapter,calls}=make();
  adapter.dispatch({type:'POINTER_DOWN',x:0,y:0,atMs:0});
  const out=adapter.dispatch({type:'POINTER_UP',operationToken:'p1'});
  assert.equal(out.intent,'primary');
  assert.equal(out.feedback.feedback,'pending');
  assert.equal(out.commitResult,'commit:p1');
  assert.deepEqual(calls,[{type:'commit',operationToken:'p1',source:'pointer_release'}]);
  const ack=adapter.dispatch({type:'ACK_CONFIRMED',token:'p1',reason:'server_ack'});
  assert.equal(ack.feedback.feedback,'confirmed');
});

test('keyboard activation is primary and uses caller token',()=>{
  const {adapter,calls}=make();
  const out=adapter.dispatch({type:'KEY_ACTIVATE',operationToken:'k1'});
  assert.equal(out.intent,'primary');
  assert.equal(out.feedback.pending,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].source,'keyboard');
});

test('detail and secondary never commit',()=>{
  const {adapter,calls}=make();
  adapter.dispatch({type:'POINTER_DOWN',x:0,y:0,atMs:0});
  const detail=adapter.dispatch({type:'TICK',atMs:500});
  assert.equal(detail.intent,'detail');
  const up=adapter.dispatch({type:'POINTER_UP',operationToken:'unused'});
  assert.equal(up.intent,'detail');
  const secondary=adapter.dispatch({type:'SECONDARY'});
  assert.equal(secondary.intent,'detail');
  assert.equal(calls.length,0);
});

test('movement cancellation suppresses commit',()=>{
  const {adapter,calls}=make();
  adapter.dispatch({type:'POINTER_DOWN',x:0,y:0,atMs:0});
  adapter.dispatch({type:'POINTER_MOVE',x:0,y:21});
  const out=adapter.dispatch({type:'POINTER_UP',operationToken:'unused'});
  assert.equal(out.intent,null);
  assert.equal(calls.length,0);
});

test('right swipe is surfaced but never commits',()=>{
  const {adapter,calls}=make();
  adapter.dispatch({type:'POINTER_DOWN',x:0,y:0,atMs:0});
  const move=adapter.dispatch({type:'POINTER_MOVE',x:45,y:0});
  assert.equal(move.intent,'swipe_right');
  const up=adapter.dispatch({type:'POINTER_UP',operationToken:'unused'});
  assert.equal(up.intent,null);
  assert.equal(calls.length,0);
});

test('disabled control suppresses pointer and keyboard activation',()=>{
  const {adapter,calls}=make({disabled:true});
  const a=adapter.dispatch({type:'POINTER_DOWN',x:0,y:0,atMs:0});
  const b=adapter.dispatch({type:'KEY_ACTIVATE',operationToken:'nope'});
  assert.equal(a.feedback.feedback,'disabled');
  assert.equal(b.feedback.feedback,'disabled');
  assert.equal(calls.length,0);
});

test('pending suppresses duplicate activation',()=>{
  const {adapter,calls}=make();
  adapter.dispatch({type:'KEY_ACTIVATE',operationToken:'p1'});
  const duplicate=adapter.dispatch({type:'KEY_ACTIVATE',operationToken:'p2'});
  const pointer=adapter.dispatch({type:'POINTER_DOWN',x:0,y:0,atMs:1});
  assert.equal(duplicate.feedback.feedback,'pending');
  assert.equal(pointer.feedback.feedback,'pending');
  assert.equal(calls.length,1);
});

test('matching failure ack is accepted while stale ack fails closed',()=>{
  const {adapter}=make();
  adapter.dispatch({type:'KEY_ACTIVATE',operationToken:'p1'});
  const before=adapter.getState();
  assert.throws(()=>adapter.dispatch({type:'ACK_CONFIRMED',token:'old',reason:'server_ack'}),/stale|mismatched/);
  assert.equal(adapter.getState(),before);
  const failed=adapter.dispatch({type:'ACK_FAILED',token:'p1',reason:'server_reject'});
  assert.equal(failed.feedback.feedback,'failed');
});

test('reducedMotion and lowPerf preserve semantic projection',()=>{
  const reduced=make({reducedMotion:true}).adapter.getFeedback();
  const low=make({lowPerf:true}).adapter.getFeedback();
  assert.equal(reduced.motion,'none');
  assert.equal(reduced.semanticLabel,'ready_plan:normal');
  assert.equal(low.motion,'reduced');
  assert.equal(low.semanticLabel,'ready_plan:normal');
});

test('caller config and input events are not mutated',()=>{
  const config={holdMs:500,moveCancelDistance:20,rightSwipeDistance:45};
  const event={type:'POINTER_DOWN',x:3,y:4,atMs:5};
  const configBefore=structuredClone(config),eventBefore=structuredClone(event);
  const calls=[];
  const adapter=createReadyPlanFeedbackAdapter({config,commit:c=>calls.push(c)});
  adapter.dispatch(event);
  assert.deepEqual(config,configBefore);
  assert.deepEqual(event,eventBefore);
  assert.equal(calls.length,0);
});

test('missing thresholds or operation token fail closed before commit',()=>{
  assert.throws(()=>createReadyPlanFeedbackAdapter({config:{holdMs:1,moveCancelDistance:1},commit:()=>{}}),/rightSwipeDistance/);
  const {adapter,calls}=make();
  adapter.dispatch({type:'POINTER_DOWN',x:0,y:0,atMs:0});
  assert.throws(()=>adapter.dispatch({type:'POINTER_UP'}),/operationToken/);
  assert.equal(calls.length,0);
  assert.notEqual(adapter.getFeedback().feedback,'pending');
});
