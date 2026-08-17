from pathlib import Path

html_path = Path('browser/GAMEROAD.html')
test_path = Path('tests/battle-replay-live-adapter.test.mjs')
html = html_path.read_text(encoding='utf-8')
test = test_path.read_text(encoding='utf-8')

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one anchor, found {count}')
    return text.replace(old, new, 1)

cards_anchor = "const CARDS=Object.fromEntries(window.__CARD_DATA__.map(c=>[c.id,c])); const DEFAULT_DECK=window.__DEFAULT_DECK__;"
replay_runtime = r"""const CARDS=Object.fromEntries(window.__CARD_DATA__.map(c=>[c.id,c])); const DEFAULT_DECK=window.__DEFAULT_DECK__;
const grBattleReplayAdapterPromise=import('./battle-replay-live-adapter.mjs');
let grBattleReplayRuntime=null;
function grBattleReplayBegin(m){const runtime={matchId:m.id,api:null,session:null,error:null,queue:null};grBattleReplayRuntime=runtime;runtime.queue=grBattleReplayAdapterPromise.then(api=>{if(grBattleReplayRuntime!==runtime)return;runtime.api=api;runtime.session=api.createLiveReplaySession({matchId:m.id,versions:api.createBattleReplayVersionAuthority({deckRule:DECK_RULE,cardData:window.__CARD_DATA__})})}).catch(e=>{runtime.error=String(e?.message||e)})}
function grBattleReplayQueue(m,operation){const runtime=grBattleReplayRuntime;if(!runtime||runtime.matchId!==m.id)return;runtime.queue=Promise.resolve(runtime.queue).then(()=>{if(runtime.error||!runtime.api||!runtime.session)return;runtime.session=operation(runtime.api,runtime.session)}).catch(e=>{runtime.error=String(e?.message||e)})}
function grBattleReplayAcceptResolution(m,resolution){grBattleReplayQueue(m,(api,session)=>api.appendAcceptedBattleResolution(session,resolution))}
function grBattleReplayEnd(m,winners){grBattleReplayQueue(m,(api,session)=>api.appendAcceptedMatchEnd(session,{winnerIds:[...winners],round:m.round,mode:m.mode}))}
async function grBattleReplayRead(m){const runtime=grBattleReplayRuntime;if(!runtime||runtime.matchId!==m.id)return null;await Promise.resolve(runtime.queue);if(runtime.error||!runtime.api||!runtime.session)return null;try{const replay=runtime.api.readLiveReplay(runtime.session);return replay?.ok?replay:null}catch(e){runtime.error=String(e?.message||e);return null}}
async function grBattleReplayRenderResult(m){const root=$('#resultReplay'),events=$('#resultReplayEvents');if(!root||!events)return;root.hidden=true;root.open=false;events.replaceChildren();const replay=await grBattleReplayRead(m);if(!replay?.events?.length)return;const playerName=(data,id)=>(data?.players||[]).find(p=>p.id===id)?.name||id;for(const event of replay.events){const row=document.createElement('div'),title=document.createElement('b'),detail=document.createElement('span');row.className='rankLine';if(event.kind==='battle_resolution'){const data=event.publicData||{};title.textContent=`第${data.round}巡 ${playerName(data,data.attackerId)} → ${playerName(data,data.defenderId)}`;detail.textContent=`${laneLabel(data.lane)} / 勝者 ${(data.winnerIds||[]).map(id=>playerName(data,id)).join('・')}`}else if(event.kind==='match_ended'){const data=event.publicData||{};title.textContent='対戦終了';detail.textContent=`第${data.round}巡 / 勝者 ${(data.winnerIds||[]).join('・')}`}else continue;row.append(title,detail);events.appendChild(row)}root.hidden=events.children.length===0}"""
html = replace_once(html, cards_anchor, replay_runtime, 'replay runtime mount')

result_anchor = '<div class="resultBtns"><button class="btn" data-root-go="home">ホーム</button><button class="btn primary" id="rematch">再戦</button></div></section>'
result_replay = '<details id="resultReplay" class="safeNote" hidden><summary>リプレイ</summary><div id="resultReplayEvents"></div></details><div class="resultBtns"><button class="btn" data-root-go="home">ホーム</button><button class="btn primary" id="rematch">再戦</button></div></section>'
html = replace_once(html, result_anchor, result_replay, 'Result replay surface')

start_anchor = "state.match.selectionLock=grCreateSelectionLock(state.match,'P1');initRoundRuntime(state.match);"
html = replace_once(html, start_anchor, "state.match.selectionLock=grCreateSelectionLock(state.match,'P1');grBattleReplayBegin(state.match);initRoundRuntime(state.match);", 'new match replay session')

resolution_anchor = "maxLaneProgress:m.players.map(p=>({id:p.id,before:maxLaneBefore.get(p.id),after:Math.max(...Object.values(p.lanes).map(a=>a.length))}))};const slaykiaAttackEnd=grSlaykiaAttackEndHook(m);"
html = replace_once(html, resolution_anchor, "maxLaneProgress:m.players.map(p=>({id:p.id,before:maxLaneBefore.get(p.id),after:Math.max(...Object.values(p.lanes).map(a=>a.length))}))};grBattleReplayAcceptResolution(m,m.lastBattleResolution);const slaykiaAttackEnd=grSlaykiaAttackEndHook(m);", 'accepted Battle resolution append')

win_anchor = "return endMatch(winners)}nextRound()}catch(e)"
html = replace_once(html, win_anchor, "grBattleReplayEnd(m,winners);return endMatch(winners)}nextRound()}catch(e)", 'accepted match end append')

render_anchor = "resultMount=await mountChar('.resultWorld',state.playerCharacterId,r.grade===1?'joy':'defeated')}"
html = replace_once(html, render_anchor, "await grBattleReplayRenderResult(m);resultMount=await mountChar('.resultWorld',state.playerCharacterId,r.grade===1?'joy':'defeated')}", 'Result replay render')

if html.count("import('./battle-replay-live-adapter.mjs')") != 1:
    raise SystemExit('Replay adapter import count mismatch')
if html.count('grBattleReplayAcceptResolution(m,m.lastBattleResolution)') != 1:
    raise SystemExit('accepted Battle replay append count mismatch')
if html.count('grBattleReplayEnd(m,winners)') != 1:
    raise SystemExit('match end replay append count mismatch')
if html.count('id="resultReplay"') != 1 or html.count('id="resultReplayEvents"') != 1:
    raise SystemExit('Result replay surface count mismatch')
html_path.write_text(html, encoding='utf-8')

import_anchor = "import assert from 'node:assert/strict';\n"
test = replace_once(test, import_anchor, import_anchor + "import { readFileSync } from 'node:fs';\n", 'test fs import')
production_test = r"""

test('production Browser mounts replay at the canonical accepted Battle seam without a guest-side second capture path', () => {
  const html = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
  const count = (needle) => html.split(needle).length - 1;
  assert.equal(count("import('./battle-replay-live-adapter.mjs')"), 1);
  assert.equal(count('grBattleReplayBegin(state.match)'), 1);
  assert.equal(count('grBattleReplayAcceptResolution(m,m.lastBattleResolution)'), 1);
  assert.equal(count('grBattleReplayEnd(m,winners)'), 1);
  assert.equal(count('id="resultReplay"'), 1);
  assert.equal(count('id="resultReplayEvents"'), 1);
  assert.ok(html.indexOf('m.lastBattleResolution={serial:++m.resolutionSeq') < html.indexOf('grBattleReplayAcceptResolution(m,m.lastBattleResolution)'));
  assert.ok(html.indexOf('grBattleReplayAcceptResolution(m,m.lastBattleResolution)') < html.indexOf('const slaykiaAttackEnd=grSlaykiaAttackEndHook(m)'));
  assert.ok(html.indexOf('grBattleReplayEnd(m,winners)') < html.indexOf('return endMatch(winners)}nextRound()'));
  assert.match(html, /createBattleReplayVersionAuthority\(\{deckRule:DECK_RULE,cardData:window\.__CARD_DATA__\}\)/);
  assert.match(html, /appendAcceptedBattleResolution\(session,resolution\)/);
  assert.match(html, /appendAcceptedMatchEnd\(session,\{winnerIds:\[\.\.\.winners\],round:m\.round,mode:m\.mode\}\)/);
});
"""
if 'production Browser mounts replay at the canonical accepted Battle seam' in test:
    raise SystemExit('production mount test already exists')
test_path.write_text(test + production_test, encoding='utf-8')
