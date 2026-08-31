import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindReadyPlanFeedbackControl,
  createReadyPlanFeedbackAdapter,
} from '../browser/ui-state-feedback-ready-plan-adapter.mjs';

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

test('operation token factory is invoked only when a commit is actually emitted',()=>{
  const {adapter,calls}=make();
  let tokenCalls=0;
  const operationTokenFactory=()=>`op-${++tokenCalls}`;
  adapter.dispatch({type:'POINTER_DOWN',x:0,y:0,atMs:0});
  adapter.dispatch({type:'POINTER_MOVE',x:0,y:21});
  const cancelled=adapter.dispatch({type:'POINTER_UP',operationTokenFactory});
  assert.equal(cancelled.intent,null);
  assert.equal(tokenCalls,0);
  adapter.dispatch({type:'KEY_ACTIVATE',operationTokenFactory});
  assert.equal(tokenCalls,1);
  assert.equal(calls[0].operationToken,'op-1');
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

class FakeStyle {
  constructor(){ this.custom=new Map(); }
  setProperty(name,value){ this.custom.set(name,String(value)); }
  getPropertyValue(name){ return this.custom.get(name) || ''; }
  removeProperty(name){ const old=this.getPropertyValue(name); this.custom.delete(name); return old; }
}

class FakeDocument {
  constructor(){
    this.nodes=new Map();
    this.head={
      children:[],
      appendChild:(node)=>{
        this.head.children.push(node);
        if(node?.id) this.nodes.set(node.id,node);
        return node;
      },
    };
  }
  createElement(tag){ return {tagName:String(tag).toUpperCase(),id:'',textContent:''}; }
  getElementById(id){ return this.nodes.get(id) || null; }
}

class FakeTarget {
  constructor(ownerDocument=null){
    this.listeners=new Map();
    this.capturedPointers=new Set();
    this.rect={left:-10000,top:-10000,right:10000,bottom:10000};
    this.dataset={};
    this.style=new FakeStyle();
    this.ownerDocument=ownerDocument;
  }
  addEventListener(type,handler){
    const set=this.listeners.get(type) || new Set();
    set.add(handler); this.listeners.set(type,set);
  }
  removeEventListener(type,handler){ this.listeners.get(type)?.delete(handler); }
  getBoundingClientRect(){ return {...this.rect}; }
  emit(type,event={}){ for (const handler of this.listeners.get(type) || []) handler(event); }
  setPointerCapture(pointerId){ this.capturedPointers.add(pointerId); }
  hasPointerCapture(pointerId){ return this.capturedPointers.has(pointerId); }
  releasePointerCapture(pointerId){
    if (!this.capturedPointers.delete(pointerId)) return;
    this.emit('lostpointercapture',{pointerId});
  }
  emitOutside(type,event={}){
    if (!this.capturedPointers.has(event.pointerId)) return false;
    this.emit(type,event);
    return true;
  }
  losePointerCapture(pointerId){
    if (!this.capturedPointers.delete(pointerId)) return false;
    this.emit('lostpointercapture',{pointerId});
    return true;
  }
}

function makeBinding({holdMs=500,reducedMotion=false,lowPerf=false,ownerDocument=null}={}){
  const target=new FakeTarget(ownerDocument);
  const calls=[];
  const renders=[];
  const timers=[];
  let nowMs=0;
  let tokenCounter=0;
  const adapter=createReadyPlanFeedbackAdapter({
    config:{...cfg,holdMs},
    commit:(command)=>{calls.push(command); return `sent:${command.operationToken}`;},
    reducedMotion,
    lowPerf,
  });
  const binding=bindReadyPlanFeedbackControl({
    target,
    adapter,
    operationTokenFactory:()=>`bind-${++tokenCounter}`,
    render:(feedback)=>renders.push(feedback.feedback),
    now:()=>nowMs,
    schedule:(fn,ms)=>{const timer={fn,ms,cancelled:false};timers.push(timer);return timer;},
    cancelSchedule:(timer)=>{timer.cancelled=true;},
  });
  return {
    target,adapter,binding,calls,renders,timers,
    get tokenCounter(){return tokenCounter;},
    setNow(value){nowMs=value;},
  };
}

test('binding wires pointer commit, emits one token, and settles matching server ack',()=>{
  const h=makeBinding();
  h.target.emit('pointerdown',{pointerId:7,clientX:10,clientY:20});
  h.target.emit('pointerup',{pointerId:7,clientX:10,clientY:20});
  assert.equal(h.tokenCounter,1);
  assert.deepEqual(h.calls,[{type:'commit',operationToken:'bind-1',source:'pointer_release'}]);
  assert.equal(h.adapter.getFeedback().feedback,'pending');
  const ack=h.binding.acknowledge({operationToken:'bind-1',accepted:true,reason:'server_ack'});
  assert.equal(ack.feedback.feedback,'confirmed');
  assert.equal(h.renders.at(-1),'confirmed');
});

test('binding projects DOM focus and clears it on blur without committing',()=>{
  const h=makeBinding();
  h.target.emit('focus');
  assert.equal(h.adapter.getFeedback().feedback,'focus');
  assert.equal(h.calls.length,0);
  h.target.emit('blur');
  assert.equal(h.adapter.getFeedback().feedback,'normal');
  assert.notEqual(h.target.dataset.gmrMaterialPhase,'focused');
  assert.equal(h.calls.length,0);
});

test('binding installs one static Battle interaction style without selection geometry overrides',()=>{
  const document=new FakeDocument();
  const first=makeBinding({ownerDocument:document});
  const second=makeBinding({ownerDocument:document});
  assert.equal(document.head.children.length,1);
  const css=document.head.children[0].textContent;
  assert.match(css,/button:not\(\.node\):enabled:active/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/button:not\(\.node\):disabled/);
  assert.match(css,/\.handCard:disabled/);
  assert.doesNotMatch(css,/transform\s*:/);
  assert.doesNotMatch(css,/transition\s*:/);
  first.binding.destroy();
  second.binding.destroy();
});

test('binding cancels a captured release outside the target without allocating a token',()=>{
  const h=makeBinding();
  h.target.rect={left:0,top:0,right:20,bottom:40};
  h.target.emit('pointerdown',{pointerId:11,button:0,clientX:10,clientY:20});
  assert.equal(h.target.hasPointerCapture(11),true);
  assert.equal(h.adapter.getFeedback().feedback,'pressed');
  assert.equal(h.target.emitOutside('pointerup',{pointerId:11,button:0,clientX:21,clientY:20}),true);
  assert.equal(h.target.hasPointerCapture(11),false);
  assert.equal(h.tokenCounter,0);
  assert.equal(h.calls.length,0);
  assert.equal(h.adapter.getFeedback().feedback,'normal');
  assert.equal(h.adapter.getFeedback().reason,'pointer_release_outside');
});

test('binding cancels on move-out even before movement distance cancellation',()=>{
  const h=makeBinding();
  h.target.rect={left:0,top:0,right:20,bottom:40};
  h.target.emit('pointerdown',{pointerId:13,button:0,clientX:10,clientY:20});
  h.target.emit('pointermove',{pointerId:13,button:0,clientX:21,clientY:20});
  assert.equal(h.target.hasPointerCapture(13),false);
  assert.equal(h.tokenCounter,0);
  assert.equal(h.calls.length,0);
  assert.equal(h.adapter.getFeedback().feedback,'normal');
  assert.equal(h.adapter.getFeedback().reason,'pointer_left_target');
  assert.equal(h.target.emitOutside('pointerup',{pointerId:13,button:0,clientX:21,clientY:20}),false);
});

test('binding cancels a pressed pointer when capture is lost before release',()=>{
  const h=makeBinding();
  h.target.emit('pointerdown',{pointerId:12,button:0,clientX:10,clientY:20});
  assert.equal(h.target.hasPointerCapture(12),true);
  assert.equal(h.adapter.getFeedback().feedback,'pressed');
  assert.equal(h.target.losePointerCapture(12),true);
  assert.equal(h.target.hasPointerCapture(12),false);
  assert.equal(h.adapter.getFeedback().feedback,'normal');
  assert.equal(h.tokenCounter,0);
  assert.equal(h.calls.length,0);
  assert.equal(h.target.emitOutside('pointerup',{pointerId:12,button:0,clientX:10,clientY:20}),false);
  assert.equal(h.calls.length,0);
});

test('binding cancellation and secondary input do not allocate operation tokens',()=>{
  const h=makeBinding();
  h.target.emit('pointerdown',{pointerId:1,clientX:0,clientY:0});
  h.target.emit('pointermove',{pointerId:1,clientX:0,clientY:21});
  h.target.emit('pointerup',{pointerId:1,clientX:0,clientY:21});
  const context={prevented:false,preventDefault(){this.prevented=true;}};
  h.target.emit('contextmenu',context);
  assert.equal(context.prevented,true);
  assert.equal(h.tokenCounter,0);
  assert.equal(h.calls.length,0);
});

test('binding hold tick emits detail without commit and stops its active timer',()=>{
  const h=makeBinding({holdMs:100});
  h.target.emit('pointerdown',{pointerId:2,clientX:1,clientY:1});
  h.setNow(100);
  h.timers[0].fn();
  assert.equal(h.adapter.getFeedback().feedback,'detail');
  assert.equal(h.calls.length,0);
  assert.equal(h.timers[0].cancelled,true);
  h.target.emit('pointerup',{pointerId:2,clientX:1,clientY:1});
  assert.equal(h.tokenCounter,0);
});

test('binding suppresses duplicate keyboard activation while pending and destroys listeners',()=>{
  const h=makeBinding();
  const first={key:'Enter',prevented:false,preventDefault(){this.prevented=true;}};
  const second={key:' ',prevented:false,preventDefault(){this.prevented=true;}};
  h.target.emit('keydown',first);
  h.target.emit('keydown',second);
  assert.equal(first.prevented,true);
  assert.equal(second.prevented,true);
  assert.equal(h.tokenCounter,1);
  assert.equal(h.calls.length,1);
  assert.equal(h.binding.destroy(),true);
  assert.equal(h.binding.destroy(),false);
  h.target.emit('keydown',{key:'Enter',preventDefault(){}});
  assert.equal(h.calls.length,1);
  assert.throws(()=>h.binding.acknowledge({operationToken:'bind-1',accepted:false,reason:'late'}),/destroyed/);
});

test('binding ignores repeated keyboard keydown even after a fast ack settles',()=>{
  const h=makeBinding();
  const first={key:'Enter',repeat:false,prevented:false,preventDefault(){this.prevented=true;}};
  h.target.emit('keydown',first);
  assert.equal(first.prevented,true);
  assert.equal(h.tokenCounter,1);
  assert.equal(h.calls.length,1);
  h.binding.acknowledge({operationToken:'bind-1',accepted:true,reason:'fast_ack'});
  assert.equal(h.adapter.getFeedback().feedback,'confirmed');
  const repeated={key:'Enter',repeat:true,prevented:false,preventDefault(){this.prevented=true;}};
  h.target.emit('keydown',repeated);
  assert.equal(repeated.prevented,true);
  assert.equal(h.tokenCounter,1);
  assert.equal(h.calls.length,1);
  assert.equal(h.adapter.getFeedback().feedback,'confirmed');
});

test('binding ignores non-active pointers and fails closed on stale ack',()=>{
  const h=makeBinding();
  h.target.emit('pointerdown',{pointerId:3,clientX:5,clientY:5});
  h.target.emit('pointerup',{pointerId:4,clientX:5,clientY:5});
  assert.equal(h.calls.length,0);
  h.target.emit('pointerup',{pointerId:3,clientX:5,clientY:5});
  assert.equal(h.calls.length,1);
  assert.throws(()=>h.binding.acknowledge({operationToken:'old',accepted:true,reason:'server_ack'}),/stale|mismatched/);
  assert.equal(h.adapter.getFeedback().feedback,'pending');
});

test('binding routes secondary mouse through contextmenu without primary commit',()=>{
  const h=makeBinding();
  h.target.emit('pointerdown',{pointerId:9,button:2,clientX:10,clientY:20});
  h.target.emit('pointerup',{pointerId:9,button:2,clientX:10,clientY:20});
  const context={prevented:false,preventDefault(){this.prevented=true;}};
  h.target.emit('contextmenu',context);
  assert.equal(context.prevented,true);
  assert.equal(h.tokenCounter,0);
  assert.equal(h.calls.length,0);
  assert.equal(h.adapter.getFeedback().feedback,'detail');
});

test('binding keeps primary mouse commit behavior with explicit button zero',()=>{
  const h=makeBinding();
  h.target.emit('pointerdown',{pointerId:10,button:0,clientX:10,clientY:20});
  h.target.emit('pointerup',{pointerId:10,button:0,clientX:10,clientY:20});
  assert.equal(h.tokenCounter,1);
  assert.deepEqual(h.calls,[{type:'commit',operationToken:'bind-1',source:'pointer_release'}]);
});


test('binding projects visible paint-only material feedback without changing target geometry',()=>{
  const h=makeBinding();
  h.target.rect={left:0,top:0,right:100,bottom:50};
  const geometryBefore={...h.target.rect};
  h.target.emit('pointerdown',{pointerId:21,button:0,clientX:75,clientY:25});
  assert.equal(h.target.dataset.gmrMaterialPhase,'pressed');
  assert.equal(h.target.dataset.gmrMaterial,'gummy');
  assert.match(h.target.style.filter,/brightness\(/);
  assert.match(h.target.style.boxShadow,/inset/);
  assert.equal(h.target.style.transform ?? '','');
  assert.equal(h.target.style.getPropertyValue('--mf-contact-x'),'75%');
  assert.deepEqual(h.target.rect,geometryBefore);
  assert.equal(h.calls.length,0);
});

test('material phase follows hold cancel commit and ack while semantic commit remains exactly once',()=>{
  const h=makeBinding({holdMs:100});
  h.target.rect={left:0,top:0,right:100,bottom:50};
  h.target.emit('pointerdown',{pointerId:22,button:0,clientX:25,clientY:20});
  h.setNow(100);
  h.timers[0].fn();
  assert.equal(h.target.dataset.gmrMaterialPhase,'hold');
  h.target.emit('pointerup',{pointerId:22,button:0,clientX:25,clientY:20});
  assert.equal(h.calls.length,0);
  h.target.emit('pointerdown',{pointerId:23,button:0,clientX:30,clientY:20});
  h.target.emit('pointercancel',{pointerId:23,clientX:30,clientY:20});
  assert.equal(h.target.dataset.gmrMaterialPhase,'cancelled');
  assert.equal(h.calls.length,0);
  h.target.emit('pointerdown',{pointerId:24,button:0,clientX:50,clientY:20});
  h.target.emit('pointerup',{pointerId:24,button:0,clientX:50,clientY:20});
  assert.equal(h.target.dataset.gmrMaterialPhase,'committed');
  assert.equal(h.calls.length,1);
  h.binding.acknowledge({operationToken:'bind-1',accepted:true,reason:'server_ack'});
  assert.equal(h.target.dataset.gmrMaterialPhase,'settled');
  assert.equal(h.calls.length,1);
});

test('reduced motion removes transition motion but keeps a visible pressed material cue',()=>{
  const h=makeBinding({reducedMotion:true});
  h.target.rect={left:0,top:0,right:100,bottom:50};
  h.target.emit('pointerdown',{pointerId:25,button:0,clientX:50,clientY:25});
  assert.equal(h.target.dataset.gmrMaterialPhase,'pressed');
  assert.equal(h.target.style.transitionDuration,'0ms');
  assert.match(h.target.style.filter,/brightness\(/);
  assert.notEqual(h.target.style.boxShadow,'');
});

test('low performance material projection drops refraction while preserving pressed paint cue',()=>{
  const h=makeBinding({lowPerf:true});
  h.target.rect={left:0,top:0,right:100,bottom:50};
  h.target.emit('pointerdown',{pointerId:26,button:0,clientX:50,clientY:25});
  assert.equal(h.target.dataset.gmrMaterialPhase,'pressed');
  assert.equal(h.target.style.getPropertyValue('--mf-refraction'),'0');
  assert.match(h.target.style.filter,/brightness\(/);
});

test('destroy restores pre-existing inline paint and removes material ownership markers',()=>{
  const target=new FakeTarget();
  target.style.filter='contrast(1.1)';
  target.style.boxShadow='0 1px 2px black';
  const adapter=createReadyPlanFeedbackAdapter({config:cfg,commit:()=>{}});
  const binding=bindReadyPlanFeedbackControl({target,adapter,operationTokenFactory:()=> 'restore-1'});
  target.emit('pointerdown',{pointerId:27,button:0,clientX:0,clientY:0});
  assert.notEqual(target.style.filter,'contrast(1.1)');
  binding.destroy();
  assert.equal(target.style.filter,'contrast(1.1)');
  assert.equal(target.style.boxShadow,'0 1px 2px black');
  assert.equal(target.dataset.gmrMaterialPhase,undefined);
  assert.equal(target.dataset.gmrMaterial,undefined);
});
