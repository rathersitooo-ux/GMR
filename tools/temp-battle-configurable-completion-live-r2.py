from pathlib import Path

HTML = Path('browser/GAMEROAD.html')
BUILD = Path('deploy/cloudflare/scripts/build.mjs')
TEST = Path('tests/battle-configurable-completion-live.test.mjs')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 occurrence, found {count}')
    return text.replace(old, new, 1)


html = HTML.read_text(encoding='utf-8')

# Friend-room state: preserve the historical room default of seven, but make it
# explicit room authority instead of an implicit hard-coded win predicate.
html = replace_once(
    html,
    "const FR={role:null,code:'',channel:null,clientId:'',authToken:'',assignedPid:null,playerCount:2,contentId:'road_shield',slots:{}",
    "const FR={role:null,code:'',channel:null,clientId:'',authToken:'',assignedPid:null,playerCount:2,contentId:'road_shield',completionTargetCount:7,slots:{}",
    'friend state completionTargetCount',
)
html = replace_once(
    html,
    "Object.assign(FR,{role:null,code:'',channel:null,clientId:'',authToken:'',assignedPid:null,playerCount:2,contentId:'road_shield',slots:{}",
    "Object.assign(FR,{role:null,code:'',channel:null,clientId:'',authToken:'',assignedPid:null,playerCount:2,contentId:'road_shield',completionTargetCount:7,slots:{}",
    'friend reset completionTargetCount',
)

# Host-owned lobby setting. Changing a rule invalidates ready state so nobody can
# accidentally start under a rule different from the one they accepted.
create_room = "function createRoom(count=2){reset(false);FR.role='host';FR.playerCount=Number(count)===4?4:2;FR.code=randomCode();FR.clientId=randomId('host');FR.authToken=randomId('hostauth');FR.assignedPid='P1';FR.contentId=state.setupContent||'road_shield';FR.roomState='lobby';FR.slots=Object.fromEntries(guestPids().map(pid=>[pid,{pid,clientId:null,authToken:null,connected:false,ready:false,lastSeq:0}]));openChannel();show('friendroom');renderLobby();return FR.code}"
create_room_plus = create_room + "\nfunction setFriendCompletionTarget(value){if(FR.role!=='host'||FR.roomState!=='lobby')return false;const next=Number(value);if(!Number.isSafeInteger(next)||next<=0){toast('勝利枚数は1以上の整数で指定してください');renderLobby();return false}if(next===FR.completionTargetCount)return true;FR.completionTargetCount=next;resetReady();sendAllLobby();return true}"
html = replace_once(html, create_room, create_room_plus, 'friend completion setter')

# Room synchronization: the host is the one authority; guests only consume it.
html = replace_once(
    html,
    "function publicLobby(){return{roomState:FR.roomState,code:FR.code,playerCount:FR.playerCount,contentId:FR.contentId,matchNo:FR.matchNo,participants:participantsHost()}}",
    "function publicLobby(){return{roomState:FR.roomState,code:FR.code,playerCount:FR.playerCount,contentId:FR.contentId,completionTargetCount:FR.completionTargetCount,matchNo:FR.matchNo,participants:participantsHost()}}",
    'public lobby completion rule',
)
html = replace_once(
    html,
    "send({type:'accept',to:cid,pid:a.s.pid,authToken:a.s.authToken,playerCount:FR.playerCount,contentId:FR.contentId,roomState:FR.roomState})",
    "send({type:'accept',to:cid,pid:a.s.pid,authToken:a.s.authToken,playerCount:FR.playerCount,contentId:FR.contentId,completionTargetCount:FR.completionTargetCount,roomState:FR.roomState})",
    'accept completion rule',
)
html = replace_once(
    html,
    "FR.contentId=m.contentId||'road_shield';FR.roomState=m.roomState||'lobby'",
    "FR.contentId=m.contentId||'road_shield';FR.completionTargetCount=Number.isSafeInteger(Number(m.completionTargetCount))&&Number(m.completionTargetCount)>0?Number(m.completionTargetCount):7;FR.roomState=m.roomState||'lobby'",
    'guest accept completion rule',
)
html = replace_once(
    html,
    "FR.contentId=m.lobby?.contentId||FR.contentId;FR.guestReady=!!FR.participants.find(p=>p.pid===FR.assignedPid)?.ready",
    "FR.contentId=m.lobby?.contentId||FR.contentId;FR.completionTargetCount=Number.isSafeInteger(Number(m.lobby?.completionTargetCount))&&Number(m.lobby?.completionTargetCount)>0?Number(m.lobby.completionTargetCount):FR.completionTargetCount;FR.guestReady=!!FR.participants.find(p=>p.pid===FR.assignedPid)?.ready",
    'guest lobby completion rule',
)

# Add the host-editable/read-only guest rule card without creating a second rule
# resolver. The value is room authority and is frozen into the match on start.
render_lobby_tail = "</div>${!idle?`<div class=\"friendActions\"><button class=\"btn ${ownReady?'on':''}\" id=\"friendReadyBtn\" ${canReady?'':'disabled'}>${ownReady?'準備を戻す':'準備完了'}</button>${FR.role==='host'?`<button class=\"btn primary\" id=\"friendStartBtn\" ${allReady()?'':'disabled'}>部屋主が開始</button>`:''}</div>`:''}</div></div>`;document.getElementById('friendCreate2')?.addEventListener('click',()=>createRoom(2));"
render_lobby_replacement = "</div>${!idle?`<div class=\"friendActions\"><button class=\"btn ${ownReady?'on':''}\" id=\"friendReadyBtn\" ${canReady?'':'disabled'}>${ownReady?'準備を戻す':'準備完了'}</button>${FR.role==='host'?`<button class=\"btn primary\" id=\"friendStartBtn\" ${allReady()?'':'disabled'}>部屋主が開始</button>`:''}</div>`:''}</div>${!idle?`<div class=\"friendRoomCard\"><h3>勝利条件</h3>${FR.role==='host'?`<label class=\"friendJoinLabel\">一列の必要枚数<input id=\"friendWinCount\" type=\"number\" min=\"1\" step=\"1\" inputmode=\"numeric\" value=\"${FR.completionTargetCount}\"></label><div class=\"friendStatus\">一列 ${FR.completionTargetCount} 枚で勝利</div>`:`<div class=\"friendStatus\">一列 ${FR.completionTargetCount} 枚で勝利</div>`}</div>`:''}</div>`;document.getElementById('friendCreate2')?.addEventListener('click',()=>createRoom(2));"
html = replace_once(html, render_lobby_tail, render_lobby_replacement, 'friend lobby rule card')
html = replace_once(
    html,
    "document.getElementById('friendJoinBtn')?.addEventListener('click',()=>joinRoom(document.getElementById('friendJoinCode')?.value));document.getElementById('friendReadyBtn')?.addEventListener('click',toggleReady);",
    "document.getElementById('friendJoinBtn')?.addEventListener('click',()=>joinRoom(document.getElementById('friendJoinCode')?.value));document.getElementById('friendWinCount')?.addEventListener('change',e=>setFriendCompletionTarget(e.currentTarget.value));document.getElementById('friendReadyBtn')?.addEventListener('click',toggleReady);",
    'friend lobby rule listener',
)

# Freeze the selected rule into the host match before snapshots are emitted.
host_start_old = "m.friendRoom={build:BUILD,code:FR.code,playerCount:FR.playerCount,localPid:'P1',host:true,resultPersistenceEnabled:false,noBotFill:true};"
host_start_new = "m.completionRule=Object.freeze({completionTargetCount:FR.completionTargetCount,completionConsequence:'DIRECT_COMPLETION_WIN',maxReachableCount:null});m.friendRoom={build:BUILD,code:FR.code,playerCount:FR.playerCount,completionTargetCount:FR.completionTargetCount,localPid:'P1',host:true,resultPersistenceEnabled:false,noBotFill:true};log(`フレンドルーム勝利条件：一列 ${FR.completionTargetCount} 枚で勝利。`);"
html = replace_once(html, host_start_old, host_start_new, 'host match completion rule')

# Propagate immutable match rule in the existing snapshot/reconnect path.
html = replace_once(
    html,
    "contentId:m.contentId,log:[...m.log],players:ordered",
    "contentId:m.contentId,completionRule:clone(m.completionRule||null),log:[...m.log],players:ordered",
    'friend snapshot completion rule',
)
html = replace_once(
    html,
    "mode:pr.mode,contentId:pr.contentId,round:pr.round",
    "mode:pr.mode,contentId:pr.contentId,completionRule:clone(pr.completionRule||null),round:pr.round",
    'guest projected match completion rule',
)
html = replace_once(
    html,
    "friendRoom:{build:BUILD,code:pr.code,playerCount:pr.playerCount,localPid:pr.viewer,host:false,resultPersistenceEnabled:false,noBotFill:true}",
    "friendRoom:{build:BUILD,code:pr.code,playerCount:pr.playerCount,completionTargetCount:Number(pr.completionRule?.completionTargetCount)||FR.completionTargetCount,localPid:pr.viewer,host:false,resultPersistenceEnabled:false,noBotFill:true}",
    'guest friendRoom completion metadata',
)

# Existing checkWin remains the one winner-selection seam. It consumes the merged
# pure completion core when an explicit room rule exists; legacy matches without
# a profile retain their current compatibility path in this bounded slice.
check_old = "function checkWin(){if(state.match.mode==='2v2'){const teams=['A','B'].filter(t=>state.match.players.filter(p=>p.team===t).some(p=>Math.max(...Object.values(p.lanes).map(a=>a.length))>=7));return teams}return state.match.players.filter(p=>Math.max(...Object.values(p.lanes).map(a=>a.length))>=7).map(p=>p.id)}"
check_new = "async function checkWin(){const m=state.match;if(m?.completionRule){const {projectCompletionRule,COMPLETION_CONSEQUENCE}=await import('./new-base-legacy-seven-win-gate-core.mjs');if(m.completionRule.completionConsequence!==COMPLETION_CONSEQUENCE.DIRECT_COMPLETION_WIN)return[];const direct=p=>projectCompletionRule({authoritativeCount:Math.max(...Object.values(p.lanes).map(a=>a.length)),resolvedRule:m.completionRule}).forwardCompletionWin;if(m.mode==='2v2')return['A','B'].filter(t=>m.players.filter(p=>p.team===t).some(direct));return m.players.filter(direct).map(p=>p.id)}if(m.mode==='2v2'){const teams=['A','B'].filter(t=>m.players.filter(p=>p.team===t).some(p=>Math.max(...Object.values(p.lanes).map(a=>a.length))>=7));return teams}return m.players.filter(p=>Math.max(...Object.values(p.lanes).map(a=>a.length))>=7).map(p=>p.id)}"
html = replace_once(html, check_old, check_new, 'live checkWin completion projection')
html = replace_once(
    html,
    "slaykiaAttackEnd?.specialWinnerTokens?.length?[...slaykiaAttackEnd.specialWinnerTokens]:checkWin()",
    "slaykiaAttackEnd?.specialWinnerTokens?.length?[...slaykiaAttackEnd.specialWinnerTokens]:await checkWin()",
    'await configurable checkWin',
)

# Make the room result log state the actual configured target instead of a stale 7.
html = replace_once(
    html,
    "else if(m.contentId==='honey_hunt')log('一列へ実札が七枚以上連続配置され、ハニーハントの勝利条件が成立しました。');",
    "else if(m.completionRule?.completionConsequence==='DIRECT_COMPLETION_WIN')log(`一列へ実札が ${m.completionRule.completionTargetCount} 枚以上連続配置され、勝利条件が成立しました。`);else if(m.contentId==='honey_hunt')log('一列へ実札が七枚以上連続配置され、ハニーハントの勝利条件が成立しました。');",
    'dynamic direct-win result log',
)

# QA/status is read-only; exposing the current room value lets acceptance prove that
# the same host-owned setting reached the live match.
html = replace_once(
    html,
    "playerCount:FR.playerCount,roomState:FR.roomState,ready:",
    "playerCount:FR.playerCount,completionTargetCount:FR.completionTargetCount,roomState:FR.roomState,ready:",
    'friend QA completion target',
)
html = replace_once(
    html,
    "window.GAMEROAD_FRIEND_ROOM_R2={BUILD,create:createRoom,join:joinRoom,ready:toggleReady,start:hostStart",
    "window.GAMEROAD_FRIEND_ROOM_R2={BUILD,create:createRoom,join:joinRoom,setWinCount:setFriendCompletionTarget,ready:toggleReady,start:hostStart",
    'friend QA setter export',
)

HTML.write_text(html, encoding='utf-8')

build = BUILD.read_text(encoding='utf-8')
anchor = "  { source: 'browser/new-base-goal-result-core.mjs', output: 'new-base-goal-result-core.mjs', artifact: 'new_base_goal_result_core', label: 'New Base GOAL result authority core' },"
addition = "  { source: 'browser/new-base-legacy-seven-win-gate-core.mjs', output: 'new-base-legacy-seven-win-gate-core.mjs', artifact: 'new_base_legacy_seven_win_gate_core', label: 'Battle configurable completion rule core' },\n" + anchor
build = replace_once(build, anchor, addition, 'package configurable completion core')
BUILD.write_text(build, encoding='utf-8')

TEST.write_text(r'''import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  COMPLETION_CONSEQUENCE,
  projectCompletionRule,
  resolveCompletionRule,
} from '../browser/new-base-legacy-seven-win-gate-core.mjs';

const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
const build = await readFile(new URL('../deploy/cloudflare/scripts/build.mjs', import.meta.url), 'utf8');

test('arbitrary positive N can be a direct room victory threshold', () => {
  const rule = resolveCompletionRule({
    completionTargetCount: 11,
    completionConsequence: COMPLETION_CONSEQUENCE.DIRECT_COMPLETION_WIN,
  });
  assert.equal(projectCompletionRule({ authoritativeCount: 10, resolvedRule: rule }).forwardCompletionWin, false);
  const reached = projectCompletionRule({ authoritativeCount: 11, resolvedRule: rule });
  assert.equal(reached.forwardCompletionWin, true);
  assert.equal(reached.terminalByCompletionRule, true);
});

test('same configurable N can remain a nonterminal GOAL gate', () => {
  const rule = resolveCompletionRule({
    completionTargetCount: 5,
    completionConsequence: COMPLETION_CONSEQUENCE.CONNECT_GOAL_PATH,
  });
  const reached = projectCompletionRule({ authoritativeCount: 5, resolvedRule: rule });
  assert.equal(reached.forwardCompletionWin, false);
  assert.equal(reached.connectGoalPath, true);
  assert.equal(reached.goalReachStillRequired, true);
  assert.equal(reached.terminalByCompletionRule, false);
});

test('friend-room host owns and synchronizes the direct-win target', () => {
  assert.match(html, /completionTargetCount:7,slots:/);
  assert.match(html, /function setFriendCompletionTarget\(value\)/);
  assert.match(html, /id=\\"friendWinCount\\" type=\\"number\\" min=\\"1\\" step=\\"1\\"/);
  assert.match(html, /completionConsequence:'DIRECT_COMPLETION_WIN'/);
  assert.match(html, /completionRule:clone\(m\.completionRule\|\|null\)/);
  assert.match(html, /completionRule:clone\(pr\.completionRule\|\|null\)/);
  assert.match(html, /setWinCount:setFriendCompletionTarget/);
});

test('existing live checkWin consumes merged completion core exactly at the result seam', () => {
  assert.match(html, /async function checkWin\(\)/);
  assert.match(html, /await import\('\.\/new-base-legacy-seven-win-gate-core\.mjs'\)/);
  assert.match(html, /projectCompletionRule\(\{authoritativeCount:/);
  assert.match(html, /:await checkWin\(\)/);
  assert.match(html, /completionConsequence!==COMPLETION_CONSEQUENCE\.DIRECT_COMPLETION_WIN\)return\[\]/);
});

test('public package includes dynamic completion core', () => {
  assert.match(build, /source: 'browser\/new-base-legacy-seven-win-gate-core\.mjs'/);
  assert.match(build, /output: 'new-base-legacy-seven-win-gate-core\.mjs'/);
});
''', encoding='utf-8')

print('patched browser/GAMEROAD.html, build.mjs, and focused test')
