import test from 'node:test';
import assert from 'node:assert/strict';
import {createUIFeedbackState,applyUIFeedbackEvent,consumeUIIntent,projectUIFeedback} from '../browser/ui-state-feedback-core.mjs';
const cfg={holdMs:500,moveCancelDistance:20,rightSwipeDistance:45};
const create=(o={})=>createUIFeedbackState({config:cfg,...o});
const ev=(s,type,x={})=>applyUIFeedbackEvent(s,{type,...x});

test('caller owns thresholds and primary fires only on release',()=>{let s=create(); s=ev(s,'POINTER_DOWN',{x:0,y:0,atMs:0}); assert.equal(s.intent,null); s=ev(s,'TICK',{atMs:499}); assert.equal(s.intent,null); s=ev(s,'POINTER_UP'); assert.equal(s.intent,'primary');});
test('hold detail suppresses later primary',()=>{let s=create(); s=ev(s,'POINTER_DOWN',{x:0,y:0,atMs:0}); s=ev(s,'TICK',{atMs:500}); assert.equal(s.intent,'detail'); s=ev(s,'POINTER_UP'); assert.equal(s.intent,'detail'); const c=consumeUIIntent(s); assert.equal(c.intent,'detail'); assert.equal(c.state.intent,null);});
test('movement beyond caller threshold cancels primary',()=>{let s=create(); s=ev(s,'POINTER_DOWN',{x:0,y:0,atMs:0}); s=ev(s,'POINTER_MOVE',{x:0,y:21}); s=ev(s,'POINTER_UP'); assert.equal(s.intent,null); assert.equal(s.reason,'cancelled');});
test('right swipe resolves to one semantic intent',()=>{let s=create(); s=ev(s,'POINTER_DOWN',{x:0,y:0,atMs:0}); s=ev(s,'POINTER_MOVE',{x:45,y:0}); s=ev(s,'POINTER_UP'); assert.equal(s.intent,'swipe_right');});
test('secondary means detail without primary',()=>{let s=create(); s=ev(s,'SECONDARY'); assert.equal(s.intent,'detail'); assert.equal(s.feedback,'detail');});
test('blur clears transient press',()=>{let s=create(); s=ev(s,'POINTER_DOWN',{x:1,y:2,atMs:3}); s=ev(s,'BLUR'); assert.equal(s.pointer,null); assert.equal(s.feedback,'normal');});
test('pending blocks duplicate activation and matching ack confirms',()=>{let s=create(); s=ev(s,'BEGIN_PENDING',{token:'r1'}); const same=ev(s,'POINTER_DOWN',{x:0,y:0,atMs:1}); assert.equal(same,s); assert.throws(()=>ev(s,'BEGIN_PENDING',{token:'r2'}),/already pending/); s=ev(s,'ACK_CONFIRMED',{token:'r1',reason:'server_ack'}); assert.equal(s.feedback,'confirmed');});
test('stale ack rejects and failure remains failure',()=>{let s=create(); s=ev(s,'BEGIN_PENDING',{token:'r1'}); assert.throws(()=>ev(s,'ACK_CONFIRMED',{token:'old',reason:'x'}),/stale/); s=ev(s,'ACK_FAILED',{token:'r1',reason:'server_reject'}); assert.equal(s.feedback,'failed');});
test('disabled state prevents activation until enabled',()=>{let s=create(); s=ev(s,'DISABLE',{reason:'not_allowed'}); const same=ev(s,'POINTER_DOWN',{x:0,y:0,atMs:0}); assert.equal(same,s); s=ev(s,'ENABLE'); s=ev(s,'POINTER_DOWN',{x:0,y:0,atMs:0}); s=ev(s,'POINTER_UP'); assert.equal(s.intent,'primary');});
test('reduced and low performance retain semantic labels',()=>{const a=projectUIFeedback(create({role:'card',reducedMotion:true})); assert.equal(a.motion,'none'); assert.equal(a.semanticLabel,'card:normal'); const b=projectUIFeedback(create({role:'card',lowPerf:true})); assert.equal(b.motion,'reduced'); assert.equal(b.semanticLabel,'card:normal');});
test('input state is immutable and deterministic',()=>{const a=create(); const before=JSON.stringify(a); const b=ev(a,'FOCUS'); const c=ev(create(),'FOCUS'); assert.equal(JSON.stringify(a),before); assert.deepEqual(b,c); assert.ok(Object.isFrozen(b));});
test('invalid configuration and event fail closed',()=>{assert.throws(()=>createUIFeedbackState({config:{holdMs:-1,moveCancelDistance:1,rightSwipeDistance:2}}),/holdMs/); assert.throws(()=>createUIFeedbackState({config:{holdMs:1,moveCancelDistance:1}}),/rightSwipeDistance/); assert.throws(()=>ev(create(),'POINTER_UP'),/without pointer/); assert.throws(()=>ev(create(),'UNKNOWN'),/unsupported/);});
