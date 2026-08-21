import test from 'node:test';
import assert from 'node:assert/strict';
import {createUIFeedbackState,applyUIFeedbackEvent,consumeUIIntent,projectUIFeedback,createTransitionDirector,TRANSITION_PHASES} from '../browser/ui-state-feedback-core.mjs';
const cfg={holdMs:500,moveCancelDistance:20,rightSwipeDistance:45};
const create=(o={})=>createUIFeedbackState({config:cfg,...o});
const ev=(s,type,x={})=>applyUIFeedbackEvent(s,{type,...x});
const deferred=()=>{let resolve,reject; const promise=new Promise((res,rej)=>{resolve=res;reject=rej;}); return {promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));

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

test('transition director completes deterministic presentation phases and swaps once',async()=>{
  const phases=[];
  let swaps=0;
  const d=createTransitionDirector({runPhase:async(phase,ctx)=>{phases.push([phase,ctx.revision,ctx.to]);}});
  const result=await d.start({from:'Home',to:'Cards',applySwap:()=>{swaps+=1;}});
  assert.equal(result.status,'completed');
  assert.equal(result.swapped,true);
  assert.equal(swaps,1);
  assert.deepEqual(phases.map(x=>x[0]),[
    TRANSITION_PHASES.PREPARE,
    TRANSITION_PHASES.EXIT,
    TRANSITION_PHASES.SWAP,
    TRANSITION_PHASES.ENTER,
    TRANSITION_PHASES.SETTLE,
  ]);
  assert.deepEqual(d.getState(),{phase:'IDLE',revision:1,activeRevision:null,from:null,to:null,swapped:false});
});

test('rapid A to B supersedes stale A before swap and stale completion cannot reset B',async()=>{
  const gate=deferred();
  let aSwaps=0;
  let bSwaps=0;
  const d=createTransitionDirector({runPhase:async(phase,ctx)=>{
    if (ctx.to==='A' && phase===TRANSITION_PHASES.EXIT) await gate.promise;
  }});
  const a=d.start({from:'Home',to:'A',applySwap:()=>{aSwaps+=1;}});
  await turn();
  assert.equal(d.getState().phase,TRANSITION_PHASES.EXIT);
  const b=d.start({from:'Home',to:'B',applySwap:()=>{bSwaps+=1;}});
  const br=await b;
  assert.equal(br.status,'completed');
  assert.equal(bSwaps,1);
  gate.resolve();
  const ar=await a;
  assert.equal(ar.status,'superseded');
  assert.equal(ar.swapped,false);
  assert.equal(aSwaps,0);
  assert.equal(d.getState().phase,TRANSITION_PHASES.IDLE);
  assert.equal(d.getState().revision,2);
});

test('driver AbortError caused by supersession is normalized without stale swap',async()=>{
  let swaps=0;
  const d=createTransitionDirector({runPhase:(phase,ctx)=>{
    if (ctx.to==='A' && phase===TRANSITION_PHASES.EXIT) {
      return new Promise((resolve,reject)=>{
        ctx.signal.addEventListener('abort',()=>{
          const e=new Error('animation cancelled');
          e.name='AbortError';
          reject(e);
        },{once:true});
      });
    }
  }});
  const a=d.start({from:'Home',to:'A',applySwap:()=>{swaps+=1;}});
  await turn();
  const b=d.start({from:'Home',to:'B',applySwap:()=>{swaps+=1;}});
  assert.equal((await b).status,'completed');
  const ar=await a;
  assert.equal(ar.status,'superseded');
  assert.equal(ar.swapped,false);
  assert.equal(swaps,1);
});

test('cancel before swap prevents business-state mutation',async()=>{
  const gate=deferred();
  let swaps=0;
  const d=createTransitionDirector({runPhase:async(phase)=>{if(phase===TRANSITION_PHASES.EXIT) await gate.promise;}});
  const p=d.start({from:'Home',to:'Deck',applySwap:()=>{swaps+=1;}});
  await turn();
  assert.equal(d.getState().phase,TRANSITION_PHASES.EXIT);
  assert.equal(d.cancel(),true);
  gate.resolve();
  const r=await p;
  assert.equal(r.status,'superseded');
  assert.equal(r.swapped,false);
  assert.equal(swaps,0);
  assert.equal(d.getState().phase,TRANSITION_PHASES.IDLE);
  assert.equal(d.getState().revision,2);
});

test('current non-abort driver failure is explicit and does not swap',async()=>{
  const d=createTransitionDirector({runPhase:async(phase)=>{if(phase===TRANSITION_PHASES.EXIT) throw new Error('driver failed');}});
  const r=await d.start({from:'Home',to:'Shop',applySwap:()=>assert.fail('swap must not run')});
  assert.equal(r.status,'failed');
  assert.equal(r.swapped,false);
  assert.equal(r.phase,TRANSITION_PHASES.EXIT);
  assert.equal(r.errorName,'Error');
  assert.match(r.message,/driver failed/);
  assert.equal(d.getState().phase,TRANSITION_PHASES.IDLE);
});

test('cancel after swap keeps committed swap while stale enter completion cannot mutate director',async()=>{
  const enterGate=deferred();
  let swaps=0;
  const d=createTransitionDirector({runPhase:async(phase)=>{if(phase===TRANSITION_PHASES.ENTER) await enterGate.promise;}});
  const p=d.start({from:'Home',to:'Battle',applySwap:()=>{swaps+=1;}});
  await turn();
  assert.equal(swaps,1);
  assert.equal(d.getState().phase,TRANSITION_PHASES.ENTER);
  assert.equal(d.cancel(),true);
  enterGate.resolve();
  const r=await p;
  assert.equal(r.status,'superseded');
  assert.equal(r.swapped,true);
  assert.equal(swaps,1);
  assert.equal(d.getState().phase,TRANSITION_PHASES.IDLE);
});

test('reducedMotion and lowPerf are effect-driver context only and preserve semantic lifecycle',async()=>{
  const seen=[];
  const d=createTransitionDirector({runPhase:async(phase,ctx)=>seen.push({phase,reducedMotion:ctx.reducedMotion,lowPerf:ctx.lowPerf})});
  const r=await d.start({from:'Home',to:'Cards',reducedMotion:true,lowPerf:true,applySwap:()=>{}});
  assert.equal(r.status,'completed');
  assert.equal(seen.length,5);
  assert.ok(seen.every(x=>x.reducedMotion && x.lowPerf));
  assert.deepEqual(seen.map(x=>x.phase),['PREPARE','EXIT','SWAP','ENTER','SETTLE']);
});

test('transition director validates route and synchronous swap contract',async()=>{
  const d=createTransitionDirector();
  await assert.rejects(()=>d.start({to:'Cards'}),/applySwap/);
  const r=await d.start({to:'Cards',applySwap:()=>Promise.resolve()});
  assert.equal(r.status,'failed');
  assert.equal(r.phase,'SWAP');
  assert.match(r.message,/synchronous/);
});
