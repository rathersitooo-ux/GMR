import test from 'node:test';
import assert from 'node:assert/strict';
import { createHumanSessionRecorder,HUMAN_SESSION_RECORDER,serializeHumanSessionRecording } from '../browser/human-session-recorder-core.mjs';
class FakeTarget{
  constructor(){this.handlers=new Map();}
  addEventListener(type,fn){const rows=this.handlers.get(type)??[];rows.push(fn);this.handlers.set(type,rows);}
  removeEventListener(type,fn){this.handlers.set(type,(this.handlers.get(type)??[]).filter(row=>row!==fn));}
  emit(type,event){for(const fn of this.handlers.get(type)??[]) fn(event);}
}
function element({id='',type='',screen='battle',action=''}={}){
  const host={dataset:{screen}};
  return {tagName:'INPUT',id,type,dataset:action?{action}:{},value:'DO-NOT-CAPTURE',closest:()=>host};
}
function make(){
  const target=new FakeTarget();let wall=Date.parse('2026-09-25T05:30:00+09:00'),mono=100;
  const recorder=createHumanSessionRecorder({metadata:{sessionId:'HS-001',buildId:'build-1',buildHash:'abc123',releaseId:'release-1',inputMode:'touch',stateId:'HOME',versions:{rules:'r1',content:'c1',state:'s1'}},eventTarget:target,now:()=>wall+=10,monotonicNow:()=>mono+=5});
  return {target,recorder};
}
test('records interaction classes without raw input values',()=>{
  const {target,recorder}=make();recorder.start();const password=element({id:'secret',type:'password'});
  target.emit('input',{target:password});target.emit('keydown',{key:'x',target:password});target.emit('click',{target:element({id:'readyPlan',type:'button',action:'ready'})});recorder.stop();
  const text=serializeHumanSessionRecording(recorder.snapshot());
  assert.equal(text.includes('DO-NOT-CAPTURE'),false);assert.equal(text.includes('"key":"x"'),false);assert.match(text,/Printable/);assert.match(text,/readyPlan/);
});
test('preserves provenance and optional evidence references',()=>{
  const {recorder}=make();recorder.start();recorder.mark('state',{stateId:'BATTLE-PLAN',eventId:'evt-1'});recorder.stop();
  const shot=recorder.snapshot({battleReplayRef:'replay:match-7',screenVideoRef:'video:local-1',domReplayRef:'rrweb:local-1'});
  assert.equal(shot.schema,HUMAN_SESSION_RECORDER.schema);assert.equal(shot.sessionId,'HS-001');assert.deepEqual(shot.versions,{rules:'r1',content:'c1',state:'s1'});assert.equal(shot.battleReplayRef,'replay:match-7');assert.equal(shot.externalUpload,false);
});
test('blocks markers that attempt to smuggle private text',()=>{
  const {recorder}=make();recorder.start();assert.throws(()=>recorder.mark('note',{rawText:'private'}),/PRIVATE_FIELD_BLOCKED/);assert.throws(()=>recorder.mark('note',{authToken:'private'}),/PRIVATE_FIELD_BLOCKED/);recorder.stop();
});
test('fails closed when required provenance is missing',()=>{assert.throws(()=>createHumanSessionRecorder({metadata:{sessionId:'x'}}),/METADATA_REQUIRED/);});
test('stop removes listeners and stays local-only',()=>{
  const {target,recorder}=make();recorder.start();recorder.stop();const before=recorder.snapshot().events.length;target.emit('click',{target:element({id:'after-stop'})});assert.equal(recorder.snapshot().events.length,before);assert.equal(recorder.snapshot().gameplayAuthoritative,false);
});
