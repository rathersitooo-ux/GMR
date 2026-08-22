import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindReadyPlanFeedbackControl,
  createReadyPlanFeedbackAdapter,
} from '../browser/ui-state-feedback-ready-plan-adapter.mjs';

class FakeTarget {
  constructor(){ this.listeners=new Map(); }
  addEventListener(type,handler){
    const set=this.listeners.get(type) || new Set();
    set.add(handler);
    this.listeners.set(type,set);
  }
  removeEventListener(type,handler){ this.listeners.get(type)?.delete(handler); }
  emit(type,event={}){ for (const handler of this.listeners.get(type) || []) handler(event); }
}

test('secondary mouse pointer never commits primary and remains context-menu secondary only',()=>{
  const target=new FakeTarget();
  const calls=[];
  let tokenCounter=0;
  let secondaryCount=0;
  const adapter=createReadyPlanFeedbackAdapter({
    config:{holdMs:500,moveCancelDistance:20,rightSwipeDistance:45},
    commit:(command)=>{calls.push(command);},
  });
  const originalDispatch=adapter.dispatch;
  const observedAdapter={
    ...adapter,
    dispatch(event){
      const out=originalDispatch(event);
      if (event.type === 'SECONDARY') secondaryCount += 1;
      return out;
    },
  };
  bindReadyPlanFeedbackControl({
    target,
    adapter:observedAdapter,
    operationTokenFactory:()=>`secondary-${++tokenCounter}`,
    schedule:()=>({}),
    cancelSchedule:()=>{},
  });

  target.emit('pointerdown',{pointerId:9,button:2,clientX:10,clientY:20});
  target.emit('pointerup',{pointerId:9,button:2,clientX:10,clientY:20});
  const context={prevented:false,preventDefault(){this.prevented=true;}};
  target.emit('contextmenu',context);

  assert.equal(context.prevented,true);
  assert.equal(tokenCounter,0);
  assert.deepEqual(calls,[]);
  assert.equal(secondaryCount,1);
  assert.equal(adapter.getFeedback().feedback,'normal');
});

test('primary mouse pointer still commits exactly once',()=>{
  const target=new FakeTarget();
  const calls=[];
  let tokenCounter=0;
  const adapter=createReadyPlanFeedbackAdapter({
    config:{holdMs:500,moveCancelDistance:20,rightSwipeDistance:45},
    commit:(command)=>{calls.push(command);},
  });
  bindReadyPlanFeedbackControl({
    target,
    adapter,
    operationTokenFactory:()=>`primary-${++tokenCounter}`,
    schedule:()=>({}),
    cancelSchedule:()=>{},
  });

  target.emit('pointerdown',{pointerId:1,button:0,clientX:1,clientY:2});
  target.emit('pointerup',{pointerId:1,button:0,clientX:1,clientY:2});

  assert.equal(tokenCounter,1);
  assert.deepEqual(calls,[{type:'commit',operationToken:'primary-1',source:'pointer_release'}]);
});
