import test from 'node:test';
import assert from 'node:assert/strict';
import {MATERIAL_FEEDBACK_MATERIALS as M,MATERIAL_FEEDBACK_PHASES as P,projectMaterialFeedback,materialFeedbackCssVars} from '../browser/ui-material-feedback-core.mjs';

const project=(material,phase,extra={})=>projectMaterialFeedback({material,phase,...extra});

test('gummy press reads as compression rather than generic hover scale',()=>{
  const x=project(M.GUMMY,P.PRESSED,{localX:.8,localY:.65});
  assert.ok(x.transform.scaleX>1);
  assert.ok(x.transform.scaleY<1);
  assert.ok(x.transform.translateYEm>0);
  assert.ok(x.surface.shadowCompression>.5);
  assert.ok(x.surface.rimTension>.5);
  assert.ok(x.transform.translateXEm>0);
  assert.equal(x.invariants.mutatesActionState,false);
});

test('droplet has stronger volume/refraction response than gummy',()=>{
  const d=project(M.DROPLET,P.PRESSED);
  const g=project(M.GUMMY,P.PRESSED);
  assert.ok(d.transform.scaleX>g.transform.scaleX);
  assert.ok(d.transform.scaleY<g.transform.scaleY);
  assert.ok(d.surface.refraction>0);
  assert.ok(d.surface.meniscus>g.surface.meniscus);
});

test('hold persists material strain while release phases are distinguishable',()=>{
  const hold=project(M.GUMMY,P.HOLD);
  const cancel=project(M.GUMMY,P.CANCELLED);
  const commit=project(M.GUMMY,P.COMMITTED);
  assert.ok(hold.transform.scaleY<1);
  assert.ok(hold.surface.shadowCompression>.5);
  assert.equal(cancel.channels.audioIntent,'release_cancel');
  assert.equal(commit.channels.audioIntent,'release_confirm');
  assert.ok(commit.motion.wobble>cancel.motion.wobble);
  assert.notEqual(commit.channels.hapticIntent,cancel.channels.hapticIntent);
});

test('pointer-local contact changes deformation direction without changing hitbox authority',()=>{
  const left=project(M.DROPLET,P.PRESSED,{localX:.1,localY:.5});
  const right=project(M.DROPLET,P.PRESSED,{localX:.9,localY:.5});
  assert.ok(left.transform.translateXEm<0);
  assert.ok(right.transform.translateXEm>0);
  assert.equal(left.invariants.requiresStableHitbox,true);
  assert.equal(right.invariants.requiresStableHitbox,true);
});

test('reduced motion removes oscillation but preserves pressed-state identity',()=>{
  const x=project(M.DROPLET,P.PRESSED,{reducedMotion:true});
  assert.equal(x.motion.durationMs,0);
  assert.equal(x.motion.wobble,0);
  assert.equal(x.motion.overshoot,0);
  assert.equal(x.motion.particleStrength,0);
  assert.notEqual(x.transform.scaleY,1);
  assert.ok(x.surface.shadowCompression>0);
});

test('low performance disables expensive liquid channels but keeps deformation',()=>{
  const x=project(M.DROPLET,P.COMMITTED,{lowPerf:true});
  assert.equal(x.surface.refraction,0);
  assert.equal(x.motion.particleStrength,0);
  assert.ok(x.motion.durationMs<=120);
  assert.notEqual(x.transform.scaleY,1);
});

test('material projections are immutable deterministic render tokens',()=>{
  const a=project(M.GUMMY,P.PRESSED,{localX:.2,localY:.7});
  const b=project(M.GUMMY,P.PRESSED,{localX:.2,localY:.7});
  assert.deepEqual(a,b);
  assert.ok(Object.isFrozen(a));
  assert.ok(Object.isFrozen(a.transform));
  assert.throws(()=>{a.transform.scaleX=99;},TypeError);
});

test('css variables expose contact/material channels and no action callback',()=>{
  const p=project(M.DROPLET,P.HOLD,{localX:.25,localY:.75});
  const vars=materialFeedbackCssVars(p);
  assert.equal(vars['--mf-contact-x'],'25%');
  assert.equal(vars['--mf-contact-y'],'75%');
  assert.match(vars['--mf-duration'],/ms$/);
  assert.equal('action' in vars,false);
});

test('invalid materials, phases and coordinates fail closed',()=>{
  assert.throws(()=>projectMaterialFeedback({material:'slime',phase:P.PRESSED}),/unsupported material/);
  assert.throws(()=>projectMaterialFeedback({material:M.GUMMY,phase:'explode'}),/unsupported phase/);
  assert.throws(()=>projectMaterialFeedback({material:M.GUMMY,phase:P.PRESSED,localX:Infinity}),/finite/);
});
