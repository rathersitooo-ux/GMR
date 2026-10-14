import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOM_RULE_PRESET, resolveRoomRuleSettings, describeRoomRuleSettings,
  projectRoomColumnMeter, mountRoomRuleSettingsScreen, mountRoomColumnProgressMeter
} from '../browser/room-rules-settings-meter.mjs';

const standard=resolveRoomRuleSettings();
const legacy=resolveRoomRuleSettings({
  preset:ROOM_RULE_PRESET.CUSTOM,completionTargetCount:5,completionConsequence:'DIRECT_COMPLETION_WIN'
});

test('initial map always starts at 7 and requires GOAL, regardless of custom parameters',()=>{
  const rule=resolveRoomRuleSettings({preset:'STANDARD',completionTargetCount:5,
    completionConsequence:'DIRECT_COMPLETION_WIN'});
  assert.equal(rule.completionTargetCount,7);
  assert.equal(rule.completionConsequence,'CONNECT_GOAL_PATH');
  assert.equal(rule.goalReachRequired,true);
  assert.match(describeRoomRuleSettings(rule).description,/ゴールマス/);
});

test('legacy column completion win is selectable only in custom rules',()=>{
  assert.equal(legacy.completionTargetCount,5);
  assert.equal(legacy.completionConsequence,'DIRECT_COMPLETION_WIN');
  assert.equal(legacy.goalReachRequired,false);
  assert.match(describeRoomRuleSettings(legacy).description,/即勝利/);
});

test('unreachable and unapproved settings are rejected',()=>{
  assert.throws(()=>resolveRoomRuleSettings({preset:'CUSTOM',completionTargetCount:8}),/INVALID_COMPLETION_TARGET/);
  assert.throws(()=>resolveRoomRuleSettings({preset:'CUSTOM',completionTargetCount:2}),/INVALID_COMPLETION_TARGET/);
  assert.throws(()=>resolveRoomRuleSettings({preset:'CUSTOM',completionConsequence:'UNKNOWN'}),/INVALID_COMPLETION_CONSEQUENCE/);
  assert.throws(()=>resolveRoomRuleSettings({preset:'UNKNOWN'}),/INVALID_ROOM_PRESET/);
});

test('column meter shows 100 percent without creating a win',()=>{
  const count7=projectRoomColumnMeter({settings:standard,authoritativeCardCount:7});
  assert.equal(count7.percent,100);
  assert.equal(count7.state,'GATE_CONFIRMATION_PENDING');
  assert.equal(count7.forwardsTerminalWin,false);
  const open=projectRoomColumnMeter({settings:standard,authoritativeCardCount:7,authoritativeGateOpen:true});
  assert.equal(open.state,'GOAL_OPEN');
  assert.match(open.message,/ゴール/);
});

test('legacy progress meter also waits for authoritative result',()=>{
  const at5=projectRoomColumnMeter({settings:legacy,authoritativeCardCount:5});
  assert.equal(at5.state,'DIRECT_WIN_CONFIRMATION_PENDING');
  assert.equal(at5.forwardsTerminalWin,false);
  assert.equal(at5.ruleConsequence,'DIRECT_COMPLETION_WIN');
  assert.equal(projectRoomColumnMeter({settings:legacy,authoritativeCardCount:10}).percent,100);
  assert.equal(projectRoomColumnMeter({settings:legacy,authoritativeCardCount:5,
    authoritativeMatchEnded:true}).state,'MATCH_ENDED');
});

test('meter rejects untrusted values',()=>{
  assert.throws(()=>projectRoomColumnMeter({settings:standard,authoritativeCardCount:-1}),/AUTHORITATIVE_CARD_COUNT_REQUIRED/);
  assert.throws(()=>projectRoomColumnMeter({settings:standard,authoritativeCardCount:5,
    authoritativeMatchEnded:'true'}),/AUTHORITATIVE_STATE_BOOLEAN_REQUIRED/);
});

class FakeElement {
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag;this.children=[];this.attrs={};
    this.textContent='';this.listeners={};this.value='';}
  append(...children){this.children.push(...children);}
  appendChild(c){this.children.push(c);return c;}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(event,callback){this.listeners[event]=callback;}
}
function fakeDom(){
  const doc={head:null,createElement(tag){return new FakeElement(doc,tag);}};
  doc.head=doc.createElement('head');
  return{doc,host:doc.createElement('main')};
}
function find(root,predicate){
  if(predicate(root))return root;
  for(const child of root.children||[]){
    const got=find(child,predicate);if(got)return got;
  }
  return null;
}

test('settings screen lets host select legacy rules and displays a numeric slider',async()=>{
  const {host}=fakeDom();
  let submitted=null;
  const screen=mountRoomRuleSettingsScreen({host,initialSettings:standard,
    onCommit:async rule=>{submitted=rule;return{accepted:true};}});
  const standardSlider=find(host,n=>n.tagName==='input'&&n.type==='range');
  assert.equal(standardSlider.disabled,true);
  const custom=find(host,n=>n.tagName==='input'&&n.value==='CUSTOM');
  custom.checked=true;custom.listeners.change();
  const slider=find(host,n=>n.tagName==='input'&&n.type==='range');
  slider.value='5';slider.listeners.input();
  const direct=find(host,n=>n.tagName==='input'&&n.value==='DIRECT_COMPLETION_WIN');
  direct.checked=true;direct.listeners.change();
  assert.equal(screen.getDraft().completionTargetCount,5);
  assert.equal(screen.getDraft().completionConsequence,'DIRECT_COMPLETION_WIN');
  const apply=find(host,n=>n.tagName==='button');
  await apply.listeners.click();
  assert.equal(submitted.completionTargetCount,5);
  assert.match(find(host,n=>n.attrs?.role==='status').textContent,/確定/);
  assert.equal(screen.gameStateWrite,false);
});

test('screen refuses an editable settings view without a room-authority callback',()=>{
  const {host}=fakeDom();
  assert.throws(()=>mountRoomRuleSettingsScreen({host,editable:true}),/ROOM_RULE_COMMIT_CALLBACK_REQUIRED/);
});

test('battle meter is read-only and bound to confirmed room rules',()=>{
  const {host}=fakeDom();
  const meter=mountRoomColumnProgressMeter({host,settings:standard});
  const outcome=meter.update({authoritativeCardCount:6,settings:legacy});
  assert.equal(outcome.target,7);
  assert.equal(find(host,n=>n.tagName==='meter').value,6);
  assert.equal(meter.terminalAuthority,false);
  assert.equal(meter.destroy(),true);
});
