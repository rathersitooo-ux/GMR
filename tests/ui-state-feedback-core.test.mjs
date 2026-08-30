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

const {
  resolveOrientationProjection,
  createOrientationProjectionAdapter,
  ORIENTATION_PROJECTIONS,
  ORIENTATION_MOTION_PROFILE,
}=await import('../browser/ui-state-feedback-core.mjs');

test('orientation projection resolves viewport geometry without inventing a square tie-break',()=>{
  assert.equal(resolveOrientationProjection({width:1280,height:720}),ORIENTATION_PROJECTIONS.LANDSCAPE);
  assert.equal(resolveOrientationProjection({width:390,height:844}),ORIENTATION_PROJECTIONS.PORTRAIT);
  assert.equal(resolveOrientationProjection({width:500,height:500,currentProjection:'portrait'}),ORIENTATION_PROJECTIONS.PORTRAIT);
  assert.throws(()=>resolveOrientationProjection({width:500,height:500}),/square viewport/);
  assert.throws(()=>resolveOrientationProjection({width:0,height:720}),/width/);
});

test('orientation adapter preserves semantic snapshot and swaps presentation exactly once',async()=>{
  let projection='landscape';
  let swaps=0;
  let appliedSnapshot=null;
  const phases=[];
  const sourceSnapshot={route:'home',themeId:'HOME_INITIAL_DEFAULT',business:{selectedPartnerId:'p1'}};
  const adapter=createOrientationProjectionAdapter({
    getCurrentProjection:()=>projection,
    applyProjection:(next,context)=>{swaps+=1; projection=next; appliedSnapshot=context.semanticSnapshot;},
    runVisualPhase:async(phase,context)=>phases.push([phase,context.motionProfile,context.semanticSnapshot]),
  });

  const result=await adapter.requestViewport({width:390,height:844},{semanticSnapshot:sourceSnapshot});
  assert.equal(result.status,'completed');
  assert.equal(result.swapped,true);
  assert.equal(projection,'portrait');
  assert.equal(swaps,1);
  assert.deepEqual(phases.map(([phase])=>phase),['PREPARE','EXIT','SWAP','ENTER','SETTLE']);
  assert.ok(phases.every(([,profile])=>profile==='normal'));
  assert.notEqual(appliedSnapshot,sourceSnapshot);
  assert.notEqual(appliedSnapshot.business,sourceSnapshot.business);
  assert.ok(Object.isFrozen(appliedSnapshot));
  assert.ok(Object.isFrozen(appliedSnapshot.business));
  sourceSnapshot.business.selectedPartnerId='changed-after-request';
  assert.equal(appliedSnapshot.business.selectedPartnerId,'p1');
});

test('orientation same-projection request is a no-op without animation or duplicate shell mutation',async()=>{
  let phases=0;
  let swaps=0;
  const adapter=createOrientationProjectionAdapter({
    getCurrentProjection:()=>ORIENTATION_PROJECTIONS.LANDSCAPE,
    applyProjection:()=>{swaps+=1;},
    runVisualPhase:async()=>{phases+=1;},
  });
  const result=await adapter.requestViewport({width:1280,height:720});
  assert.equal(result.status,'ignored');
  assert.equal(result.reason,'current_projection');
  assert.equal(result.swapped,false);
  assert.equal(phases,0);
  assert.equal(swaps,0);
});

test('rapid landscape to portrait to landscape before swap cancels stale portrait without any swap',async()=>{
  let projection='landscape';
  let swaps=0;
  const gate=deferred();
  const adapter=createOrientationProjectionAdapter({
    getCurrentProjection:()=>projection,
    applyProjection:(next)=>{swaps+=1; projection=next;},
    runVisualPhase:async(phase,context)=>{
      if (context.to==='portrait' && phase===TRANSITION_PHASES.EXIT) await gate.promise;
    },
  });

  const portrait=adapter.requestProjection('portrait');
  await turn();
  assert.equal(adapter.getState().phase,TRANSITION_PHASES.EXIT);
  const back=await adapter.requestProjection('landscape');
  assert.equal(back.status,'retained');
  assert.equal(back.reason,'latest_projection_matches_current');
  assert.equal(projection,'landscape');
  assert.equal(swaps,0);
  gate.resolve();
  const stale=await portrait;
  assert.equal(stale.status,'superseded');
  assert.equal(stale.swapped,false);
  assert.equal(projection,'landscape');
  assert.equal(swaps,0);
});

test('rapid reversal after swap uses a new revision and latest projection wins',async()=>{
  let projection='landscape';
  const swaps=[];
  const enterGate=deferred();
  const adapter=createOrientationProjectionAdapter({
    getCurrentProjection:()=>projection,
    applyProjection:(next)=>{swaps.push(next); projection=next;},
    runVisualPhase:async(phase,context)=>{
      if (context.to==='portrait' && phase===TRANSITION_PHASES.ENTER) await enterGate.promise;
    },
  });

  const portrait=adapter.requestProjection('portrait');
  await turn();
  assert.equal(projection,'portrait');
  assert.equal(adapter.getState().phase,TRANSITION_PHASES.ENTER);
  const landscape=await adapter.requestProjection('landscape');
  assert.equal(landscape.status,'completed');
  assert.equal(projection,'landscape');
  assert.deepEqual(swaps,['portrait','landscape']);
  enterGate.resolve();
  const stale=await portrait;
  assert.equal(stale.status,'superseded');
  assert.equal(stale.swapped,true);
  assert.equal(projection,'landscape');
});

test('orientation reduced-motion and low-perf profiles change effects only',async()=>{
  let projection='landscape';
  let reduce=true;
  let low=true;
  const profiles=[];
  const adapter=createOrientationProjectionAdapter({
    getCurrentProjection:()=>projection,
    applyProjection:(next)=>{projection=next;},
    reducedMotion:()=>reduce,
    lowPerf:()=>low,
    runVisualPhase:async(_phase,context)=>profiles.push(context.motionProfile),
  });

  assert.equal((await adapter.requestProjection('portrait')).status,'completed');
  assert.ok(profiles.every((profile)=>profile===ORIENTATION_MOTION_PROFILE.NONE));
  profiles.length=0;
  reduce=false;
  assert.equal((await adapter.requestProjection('landscape')).status,'completed');
  assert.ok(profiles.every((profile)=>profile===ORIENTATION_MOTION_PROFILE.REDUCED));
});

test('orientation adapter fails closed when projection mutation is asynchronous',async()=>{
  let projection='landscape';
  const adapter=createOrientationProjectionAdapter({
    getCurrentProjection:()=>projection,
    applyProjection:()=>Promise.resolve(),
  });
  const result=await adapter.requestProjection('portrait');
  assert.equal(result.status,'failed');
  assert.equal(result.phase,TRANSITION_PHASES.SWAP);
  assert.match(result.message,/applyProjection must be synchronous/);
  assert.equal(projection,'landscape');
});

const {
  MATERIAL_FEEDBACK_MATERIALS:MATERIALS,
  MATERIAL_FEEDBACK_PHASES:MATERIAL_PHASES,
  projectMaterialFeedback,
  materialFeedbackCssVars,
}=await import('../browser/ui-state-feedback-core.mjs');
const materialProject=(material,phase,extra={})=>projectMaterialFeedback({material,phase,...extra});

test('gummy press reads as compression rather than generic hover scale',()=>{
  const x=materialProject(MATERIALS.GUMMY,MATERIAL_PHASES.PRESSED,{localX:.8,localY:.65});
  assert.ok(x.transform.scaleX>1);
  assert.ok(x.transform.scaleY<1);
  assert.ok(x.transform.translateYEm>0);
  assert.ok(x.surface.shadowCompression>.5);
  assert.ok(x.surface.rimTension>.5);
  assert.ok(x.transform.translateXEm>0);
  assert.equal(x.invariants.mutatesActionState,false);
});

test('droplet has stronger volume and refraction response than gummy',()=>{
  const d=materialProject(MATERIALS.DROPLET,MATERIAL_PHASES.PRESSED);
  const g=materialProject(MATERIALS.GUMMY,MATERIAL_PHASES.PRESSED);
  assert.ok(d.transform.scaleX>g.transform.scaleX);
  assert.ok(d.transform.scaleY<g.transform.scaleY);
  assert.ok(d.surface.refraction>0);
  assert.ok(d.surface.meniscus>g.surface.meniscus);
});

test('hold persists material strain while release phases are distinguishable',()=>{
  const hold=materialProject(MATERIALS.GUMMY,MATERIAL_PHASES.HOLD);
  const cancel=materialProject(MATERIALS.GUMMY,MATERIAL_PHASES.CANCELLED);
  const commit=materialProject(MATERIALS.GUMMY,MATERIAL_PHASES.COMMITTED);
  assert.ok(hold.transform.scaleY<1);
  assert.ok(hold.surface.shadowCompression>.5);
  assert.equal(cancel.channels.audioIntent,'release_cancel');
  assert.equal(commit.channels.audioIntent,'release_confirm');
  assert.ok(commit.motion.wobble>cancel.motion.wobble);
  assert.notEqual(commit.channels.hapticIntent,cancel.channels.hapticIntent);
});

test('pointer-local contact changes deformation direction without changing hitbox authority',()=>{
  const left=materialProject(MATERIALS.DROPLET,MATERIAL_PHASES.PRESSED,{localX:.1,localY:.5});
  const right=materialProject(MATERIALS.DROPLET,MATERIAL_PHASES.PRESSED,{localX:.9,localY:.5});
  assert.ok(left.transform.translateXEm<0);
  assert.ok(right.transform.translateXEm>0);
  assert.equal(left.invariants.requiresStableHitbox,true);
  assert.equal(right.invariants.requiresStableHitbox,true);
});

test('reduced motion removes oscillation but preserves pressed-state identity',()=>{
  const x=materialProject(MATERIALS.DROPLET,MATERIAL_PHASES.PRESSED,{reducedMotion:true});
  assert.equal(x.motion.durationMs,0);
  assert.equal(x.motion.wobble,0);
  assert.equal(x.motion.overshoot,0);
  assert.equal(x.motion.particleStrength,0);
  assert.notEqual(x.transform.scaleY,1);
  assert.ok(x.surface.shadowCompression>0);
});

test('low performance disables expensive liquid channels but keeps deformation',()=>{
  const x=materialProject(MATERIALS.DROPLET,MATERIAL_PHASES.COMMITTED,{lowPerf:true});
  assert.equal(x.surface.refraction,0);
  assert.equal(x.motion.particleStrength,0);
  assert.ok(x.motion.durationMs<=120);
  assert.notEqual(x.transform.scaleY,1);
});

test('material projections are immutable deterministic render tokens',()=>{
  const a=materialProject(MATERIALS.GUMMY,MATERIAL_PHASES.PRESSED,{localX:.2,localY:.7});
  const b=materialProject(MATERIALS.GUMMY,MATERIAL_PHASES.PRESSED,{localX:.2,localY:.7});
  assert.deepEqual(a,b);
  assert.ok(Object.isFrozen(a));
  assert.ok(Object.isFrozen(a.transform));
  assert.throws(()=>{a.transform.scaleX=99;},TypeError);
});

test('css variables expose contact and material channels without action callback',()=>{
  const projection=materialProject(MATERIALS.DROPLET,MATERIAL_PHASES.HOLD,{localX:.25,localY:.75});
  const vars=materialFeedbackCssVars(projection);
  assert.equal(vars['--mf-contact-x'],'25%');
  assert.equal(vars['--mf-contact-y'],'75%');
  assert.match(vars['--mf-duration'],/ms$/);
  assert.equal('action' in vars,false);
});

test('invalid material inputs fail closed',()=>{
  assert.throws(()=>projectMaterialFeedback({material:'slime',phase:MATERIAL_PHASES.PRESSED}),/unsupported material/);
  assert.throws(()=>projectMaterialFeedback({material:MATERIALS.GUMMY,phase:'explode'}),/unsupported phase/);
  assert.throws(()=>projectMaterialFeedback({material:MATERIALS.GUMMY,phase:MATERIAL_PHASES.PRESSED,localX:Infinity}),/finite/);
});

const {
  resolveControllerButtonEdge,
  resolveOutsideDismiss,
}=await import('../browser/ui-state-feedback-core.mjs');

test('controller button edge fires once on press and release, never while held',()=>{
  assert.deepEqual(resolveControllerButtonEdge({previousPressed:false,pressed:true}),{pressed:true,justPressed:true,justReleased:false});
  assert.deepEqual(resolveControllerButtonEdge({previousPressed:true,pressed:true}),{pressed:true,justPressed:false,justReleased:false});
  assert.deepEqual(resolveControllerButtonEdge({previousPressed:true,pressed:false}),{pressed:false,justPressed:false,justReleased:true});
  assert.deepEqual(resolveControllerButtonEdge({previousPressed:false,pressed:false}),{pressed:false,justPressed:false,justReleased:false});
});

test('controller button edge fails closed on ambiguous input',()=>{
  assert.throws(()=>resolveControllerButtonEdge({previousPressed:0,pressed:true}),/previousPressed must be a boolean/);
  assert.throws(()=>resolveControllerButtonEdge({previousPressed:false,pressed:1}),/pressed must be a boolean/);
  assert.throws(()=>resolveControllerButtonEdge(),/previousPressed must be a boolean/);
});

test('outside dismiss closes only outside and blocks underlay activation',()=>{
  assert.deepEqual(resolveOutsideDismiss({insideSurface:false}),{dismiss:true,consumeInput:true,allowUnderlayActivation:false});
  assert.deepEqual(resolveOutsideDismiss({insideSurface:true}),{dismiss:false,consumeInput:false,allowUnderlayActivation:false});
});

test('outside dismiss fails closed on ambiguous hit classification',()=>{
  assert.throws(()=>resolveOutsideDismiss({insideSurface:null}),/insideSurface must be a boolean/);
  assert.throws(()=>resolveOutsideDismiss(),/insideSurface must be a boolean/);
});
