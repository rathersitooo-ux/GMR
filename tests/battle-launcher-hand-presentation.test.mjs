import test from 'node:test';
import assert from 'node:assert/strict';
import {mountLauncherHandPresentation} from '../browser/battle-launcher-hand-presentation.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ensurePostDrawJankenAssignment} from '../browser/new-base-hand3-uniform-assignment-policy.mjs';
test('ordinary guest snapshots retain the same unsubmitted draft and clear revision',()=>{
 const html=readFileSync(new URL('../browser/GAMEROAD.html',import.meta.url),'utf8');
 const code=['preserveFriendLocalJankenDraft','projectionToMatch','applyProjection'].map(name=>html.split('\n').find(l=>l.startsWith(`function ${name}(`))||'').join('\n');
 const hand=['a','b','c'],snapshot=ensurePostDrawJankenAssignment({selectionEpochId:'M1/P2/round/2',roundId:'battle-round:2',hand:hand.map(id=>({id,suit:'CL'})),readUint32:()=>0});
 const pr={code:'r',matchInstanceId:'M1',mode:'4p',contentId:'honey_hunt',round:2,phase:'plan',players:[{id:'P2',hand,jankenAssignment:snapshot,jankenDraftRevision:0,plan:null,position:'C:0:0'}],viewer:'P2',playerCount:4,log:[],target:null,lastBattleResolution:null,battlePresentation:null,private:{planSubmitted:false}};
 const c={clone:x=>JSON.parse(JSON.stringify(x)),FR:{role:'guest',assignedPid:'P2',snapshot:{private:{planSubmitted:false}}},state:{match:null},BUILD:'test',DECK_RULE:{id:'test',revision:1},document:{body:{classList:{add(){}}},getElementById(){return null;}},show(){},renderBattle(){},renderRemoteWait(){},syncFriendPartnerRule(){},globalThis:{GAMEROAD_POST_DRAW_JANKEN_ASSIGNMENT:ensurePostDrawJankenAssignment}};
 vm.createContext(c);vm.runInContext(code,c);c.state.match=c.projectionToMatch(pr);
 c.state.match.players[0].jankenDraftRevision=1;c.state.match.players[0].plan={roadId:'b',battleId:null,path:['C:0:0']};
 c.applyProjection(JSON.parse(JSON.stringify(pr)));assert.equal(c.state.match.players[0].jankenDraftRevision,1);assert.equal(c.state.match.players[0].plan.roadId,'b');
 c.applyProjection(JSON.parse(JSON.stringify(pr)));assert.equal(c.state.match.players[0].jankenDraftRevision,1);assert.equal(c.state.match.players[0].plan.roadId,'b');
 const submitted=JSON.parse(JSON.stringify(pr));submitted.private.planSubmitted=true;c.applyProjection(submitted);assert.equal(c.state.match.players[0].plan,null);assert.equal(c.state.match.players[0].jankenDraftRevision,1,'submission acknowledgement must not rearm the same launcher');
 const resolving=JSON.parse(JSON.stringify(submitted));resolving.phase='reveal';c.applyProjection(resolving);assert.equal(c.state.match.players[0].jankenDraftRevision,1);
 c.state.match.players[0].plan={roadId:'b'};c.state.match.players[0].jankenDraftRevision=2;
 const fresh=JSON.parse(JSON.stringify(pr));fresh.matchInstanceId='M2';c.applyProjection(fresh);assert.equal(c.state.match.players[0].jankenDraftRevision,0);assert.equal(c.state.match.players[0].plan,null);
});

test('the real round initializer retains five cards, reuses the trio and safely handles exhaustion',()=>{
 const html=readFileSync(new URL('../browser/GAMEROAD.html',import.meta.url),'utf8');
 const code=['prepareRoundJankenAssignments','initRoundRuntime'].map(name=>html.split('\n').find(l=>l.startsWith(`function ${name}(`))).join('\n');
 const hand=['a','b','c','d','e'],p={id:'P1',hand:[...hand]},m={id:'M1',round:2,players:[p]};let draws=0;
 const c={CARDS:Object.fromEntries(hand.map(id=>[id,{suit:'CL'}])),globalThis:{GAMEROAD_POST_DRAW_JANKEN_ASSIGNMENT:ensurePostDrawJankenAssignment,crypto:{getRandomValues(a){draws++;a[0]=0;return a;}}},quickStartRound(){}};
 vm.createContext(c);vm.runInContext(code,c);c.initRoundRuntime(m);
 assert.equal(p.jankenAssignment.selectedJankenCardIds.length,3);assert.deepEqual(p.hand,hand);assert.equal(p.jankenAssignment.ordinaryHandCardIds.length,2);assert.equal(draws,4);
 const fixed=p.jankenAssignment;c.initRoundRuntime(m);assert.strictEqual(p.jankenAssignment,fixed);assert.equal(draws,4);
 m.round=3;p.hand=p.hand.slice(0,3);c.initRoundRuntime(m);assert.equal(p.jankenAssignment.roundId,'battle-round:3');assert.equal(draws,8);
 m.round=4;p.hand=p.hand.slice(0,2);c.initRoundRuntime(m);assert.equal(p.jankenAssignment,null);assert.equal(draws,8);assert.equal(p.hand.length,2);
});

test('friend projection exposes the selection receipt only to its owner and restores it without a draw',()=>{
 const html=readFileSync(new URL('../browser/GAMEROAD.html',import.meta.url),'utf8');
 const code=['publicPlayer','projectionToMatch'].map(name=>html.split('\n').find(l=>l.startsWith(`function ${name}(`))).join('\n');
 const hand=['a','b','c','d','e'],snapshot=ensurePostDrawJankenAssignment({selectionEpochId:'M1/P1/round/2',roundId:'battle-round:2',hand:hand.map(id=>({id,suit:'CL'})),readUint32:()=>0});
 const p={id:'P1',name:'one',hand,deck:[],shields:{L:'s1',C:'s2',R:'s3'},jankenAssignment:snapshot,jankenDraftRevision:2};
 const c={clone:x=>JSON.parse(JSON.stringify(x)),FR:{planValues:{}},publicRoyalUsed:()=>0,BUILD:'test',DECK_RULE:{id:'test',revision:1},globalThis:{GAMEROAD_POST_DRAW_JANKEN_ASSIGNMENT:ensurePostDrawJankenAssignment}};
 vm.createContext(c);vm.runInContext(code,c);const own=c.publicPlayer(p,'P1'),other=c.publicPlayer(p,'P2');
 assert.equal(own.jankenDraftRevision,2);assert.equal(own.jankenAssignment.selectedJankenCardIds.length,3);assert.equal('jankenAssignment' in other,false);assert.ok(other.hand.every(id=>id==='__HIDDEN__'));
 const restored=c.projectionToMatch({code:'r',matchInstanceId:'M1',mode:'4p',contentId:'honey_hunt',round:2,phase:'plan',players:[own],viewer:'P1',playerCount:4,log:[],target:null,lastBattleResolution:null,battlePresentation:null,private:{}});
 assert.ok(Object.isFrozen(restored.players[0].jankenAssignment));assert.deepEqual(restored.players[0].jankenAssignment,snapshot);
});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function fixture(){
 const frames=[],animations=[],body=[];
 function node(){return{dataset:{},style:{},setAttribute(){},appendChild(){},querySelectorAll(){return[];},removeAttribute(){},getBoundingClientRect(){return{left:10,top:20,width:60,height:90};},animate(){const f=deferred();const a={finished:f.promise,cancel(){f.reject(new Error('cancelled'));},finish:f.resolve};animations.push(a);return a;}};}
 const doc={getElementById(){return null;},createElement:node,head:{appendChild(){}},body:{appendChild(n){body.push(n);n.remove=()=>{const i=body.indexOf(n);if(i>=0)body.splice(i,1);};}}};
 const real=node(),root={ownerDocument:doc,dataset:{},querySelectorAll(){return[real];}},host=node(),slot=node(),globalRef={requestAnimationFrame:f=>frames.push(f),matchMedia:()=>({matches:false})};real.dataset.cardId='unused';
 const api=mountLauncherHandPresentation({root,host,slotNodes:new Map([['ROCK',slot]]),handle:node(),powerEnergy:node(),globalRef});api.enable(true);
 const card={id:'unused',rect:{left:0,top:0,width:60,height:90},clone:node()};
 async function frame(){frames.shift()?.();await Promise.resolve();await Promise.resolve();}
 return{api,host,body,animations,card,frame};
}
test('a clear before queued return frames never creates an obsolete card clone',async()=>{
 const x=fixture();x.api.release([x.card],'PAPER');const pending=x.host.__gameroadLauncherFlightSettled();
 x.api.reset();await x.frame();await x.frame();await Promise.resolve();
 assert.equal(x.body.length,0,'old return must not create a clone after reset');
 for(const a of x.animations)a.finish();await pending;assert.equal(x.host.dataset.launcherCycle,undefined);
});
test('a clear during return removes the old clone and cannot retract newly rearmed pads',async()=>{
 const x=fixture();let completed=0;x.api.release([x.card],'PAPER',()=>completed++);
 const pending=x.host.__gameroadLauncherFlightSettled();await x.frame();await x.frame();
 assert.equal(x.body.length,1);x.api.reset();assert.equal(x.body.length,0);
 for(const a of x.animations)a.finish();await pending;
 assert.equal(completed,0);assert.equal(x.host.dataset.launcherCycle,undefined);
});
