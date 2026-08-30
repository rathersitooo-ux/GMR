import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveControllerButtonEdge,resolveOutsideDismiss} from '../browser/ui-state-feedback-core.mjs';

test('controller confirm/cancel style buttons fire only on edges, never while held',()=>{
  const down=resolveControllerButtonEdge({previousPressed:false,pressed:true});
  assert.deepEqual(down,{pressed:true,justPressed:true,justReleased:false});

  const held=resolveControllerButtonEdge({previousPressed:true,pressed:true});
  assert.deepEqual(held,{pressed:true,justPressed:false,justReleased:false});

  const up=resolveControllerButtonEdge({previousPressed:true,pressed:false});
  assert.deepEqual(up,{pressed:false,justPressed:false,justReleased:true});

  const idle=resolveControllerButtonEdge({previousPressed:false,pressed:false});
  assert.deepEqual(idle,{pressed:false,justPressed:false,justReleased:false});
});

test('controller edge contract fails closed on ambiguous input',()=>{
  assert.throws(()=>resolveControllerButtonEdge({previousPressed:0,pressed:true}),/previousPressed must be a boolean/);
  assert.throws(()=>resolveControllerButtonEdge({previousPressed:false,pressed:1}),/pressed must be a boolean/);
  assert.throws(()=>resolveControllerButtonEdge(),/previousPressed must be a boolean/);
});

test('outside dismiss closes exactly outside and never permits underlay activation',()=>{
  assert.deepEqual(resolveOutsideDismiss({insideSurface:false}),{
    dismiss:true,
    consumeInput:true,
    allowUnderlayActivation:false,
  });

  assert.deepEqual(resolveOutsideDismiss({insideSurface:true}),{
    dismiss:false,
    consumeInput:false,
    allowUnderlayActivation:false,
  });
});

test('outside dismiss contract fails closed on ambiguous hit classification',()=>{
  assert.throws(()=>resolveOutsideDismiss({insideSurface:null}),/insideSurface must be a boolean/);
  assert.throws(()=>resolveOutsideDismiss(),/insideSurface must be a boolean/);
});
