from pathlib import Path
import subprocess

BASE = '0be3a466b55cbd0af23244bc9fc90b2f5f6640fd'
EXPECTED_HTML_BLOB = '35f9203e2be95ba07b44c875e26bfe2047a3cee5'
ALLOWED_PRE = {
    'data/preaction-authorizations/ROAD-MOVE-RUNTIME-R5-20260906T2113-SOL-P8N4V6.json',
    '.github/workflows/zz-temp-road-move-runtime-r5.yml',
    'tools/zz-temp-road-move-runtime-r5.py',
}

def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()

if git('merge-base', 'HEAD', BASE) != BASE:
    raise SystemExit('base ancestry mismatch')
if git('rev-parse', f'{BASE}:browser/GAMEROAD.html') != EXPECTED_HTML_BLOB:
    raise SystemExit('base GAMEROAD.html blob mismatch')
extra = {x for x in git('diff', '--name-only', f'{BASE}...HEAD').splitlines() if x} - ALLOWED_PRE
if extra:
    raise SystemExit(f'unexpected pre-patch branch files: {sorted(extra)}')

p = Path('browser/GAMEROAD.html')
s = p.read_text()
if 'ROAD-MOVE-BIDIRECTIONAL-R5' in s:
    raise SystemExit('R5 marker already present; fail closed instead of double patching')

def one(old, new, label):
    global s
    n = s.count(old)
    if n != 1:
        raise SystemExit(f'{label}: expected 1 match, got {n}')
    s = s.replace(old, new, 1)

one(
"function preferredRoadCandidates(hand){const all=(hand||[]).filter(roadSelectable),movable=all.filter(id=>normalMoveLimitForRoad(id)>0);return movable.length?movable:all}",
"""function preferredRoadCandidates(hand){const all=(hand||[]).filter(roadSelectable),movable=all.filter(id=>normalMoveLimitForRoad(id)>0);return movable.length?movable:all}
/* ROAD-MOVE-BIDIRECTIONAL-R5 — one movement draft, either input order; no second movement authority. */
function roadMoveDraftPath(p){const path=p?.plan?.path;return Array.isArray(path)&&path.length?[...path]:(p?.position?[p.position]:[])}
function roadMoveDraftSteps(p,path=roadMoveDraftPath(p)){return Math.max(0,(path?.length||0)-1)}
function roadMoveReservedCardIds(){const ids=new Set();const snapshot=globalThis.__GAMEROAD_BATTLE_JANKEN_SLIDEPAD__?.snapshot?.();for(const id of snapshot?.assignment?.selectedJankenCardIds||[])if(id)ids.add(id);for(const e of $$('#hand .handCard[data-card-id][data-janken-reserved=\"true\"]'))if(e.dataset.cardId)ids.add(e.dataset.cardId);return ids}
function roadMoveOrdinaryHandIds(p){const nodes=$$('#hand .handCard[data-card-id]'),reserved=roadMoveReservedCardIds();if(nodes.length)return nodes.flatMap(e=>{const id=e.dataset.cardId;if(!id||reserved.has(id)||e.dataset.jankenReserved==='true'||e.disabled||e.getAttribute('aria-disabled')==='true')return[];return[id]});return(p?.hand||[]).filter(id=>!reserved.has(id))}
function roadMoveHeldCandidates(p){const battleId=p?.plan?.battleId||null;return roadMoveOrdinaryHandIds(p).filter(id=>id!==battleId&&normalMoveLimitForRoad(id)>0)}
function roadMovePathStructurallyLegal(p,path=roadMoveDraftPath(p)){if(!p?.position||!path?.length||path[0]!==p.position)return false;const seen=new Set([path[0]]);for(let i=1;i<path.length;i++){if(seen.has(path[i])||!neighbors(path[i-1],p).includes(path[i]))return false;seen.add(path[i])}return true}
function compatibleRoadCandidatesForPath(p,path=roadMoveDraftPath(p)){const steps=roadMoveDraftSteps(p,path);if(steps<1||!roadMovePathStructurallyLegal(p,path))return[];return roadMoveHeldCandidates(p).filter(id=>steps<=normalMoveLimitForRoad(id))}
function draftMoveLimitForPlayer(p){return roadMoveHeldCandidates(p).reduce((max,id)=>Math.max(max,normalMoveLimitForRoad(id)),0)}
function roadMoveDecisionCard(p){const candidates=compatibleRoadCandidatesForPath(p),focused=p?.plan?.roadId||null;if(focused&&candidates.includes(focused))return focused;if(roadMoveDraftSteps(p)>0&&candidates.length===1)return candidates[0];return null}
function roadMoveShouldTreatTapAsRoad(p,id){const candidates=compatibleRoadCandidatesForPath(p);if(!candidates.includes(id))return false;const focused=p?.plan?.roadId||null;return !focused||!candidates.includes(focused)}
function syncRoadMoveDraftUi(){const m=state.match,me=m?.players?.[0],cards=$$('#hand .handCard[data-card-id]'),map=$('#battleMap');cards.forEach(e=>{e.dataset.roadMoveState='NORMAL';e.classList.remove('roadMoveSoft')});if(!m||!me||m.phase!=='plan'){if(map){delete map.dataset.roadMoveSteps;delete map.dataset.roadMoveCompatibleCount}return}const path=roadMoveDraftPath(me),steps=roadMoveDraftSteps(me,path),candidates=compatibleRoadCandidatesForPath(me,path),compatible=new Set(candidates),held=new Set(roadMoveHeldCandidates(me)),focused=me.plan?.roadId||null;cards.forEach(e=>{const id=e.dataset.cardId;if(focused===id){if(steps===0&&held.has(id))e.dataset.roadMoveState='FOCUSED';else e.dataset.roadMoveState=compatible.has(id)?'FOCUSED':'INVALID_FOCUS'}else if(steps>0&&compatible.has(id))e.dataset.roadMoveState='COMPATIBLE';if(steps>0&&candidates.length===1&&compatible.has(id)&&focused!==id)e.classList.add('roadMoveSoft')});if(map){map.dataset.roadMoveSteps=String(steps);map.dataset.roadMoveCompatibleCount=String(candidates.length)}}
let roadMoveHandObserver=null,roadMoveObservedHand=null,roadMoveReservationSyncQueued=false;
function ensureRoadMoveReservationSync(){const hand=$('#hand');if(!hand||hand===roadMoveObservedHand)return;if(roadMoveHandObserver)roadMoveHandObserver.disconnect();roadMoveObservedHand=hand;roadMoveHandObserver=new MutationObserver(records=>{if(!records.some(r=>r.type==='attributes'&&r.attributeName==='data-janken-reserved'))return;if(roadMoveReservationSyncQueued)return;roadMoveReservationSyncQueued=true;queueMicrotask(()=>{roadMoveReservationSyncQueued=false;if(state.match?.phase==='plan'){renderBoard();syncRoadMoveDraftUi()}})});roadMoveHandObserver.observe(hand,{subtree:true,attributes:true,attributeFilter:['data-janken-reserved']})}""",
'draft helpers')

one(
"function fieldMoveFocusNodes(){const m=state.match,me=m?.players?.[0];if(!m||!me||m.phase!=='plan'||!me.plan?.roadId)return null;const moveLimit=normalMoveLimitForRoad(me.plan.roadId);if(moveLimit<=0)return null;const s=new Set([me.position,...reachable(me,moveLimit).keys(),...(me.plan?.path||[])]);return[...s]}",
"function fieldMoveFocusNodes(){const m=state.match,me=m?.players?.[0];if(!m||!me||m.phase!=='plan')return null;const moveLimit=draftMoveLimitForPlayer(me);if(moveLimit<=0)return null;const s=new Set([me.position,...reachable(me,moveLimit).keys(),...(me.plan?.path||[])]);return[...s]}",
'field focus')

one(
"function renderRangeSurfaces(reach,moveLimit,viewer){const layer=$('#rangeSurfaceLayer');if(!layer)return;layer.replaceChildren();if(!reach||moveLimit<=0)return;const ns='http://www.w3.org/2000/svg';for(const [id,d] of reach){if(d>moveLimit)continue;const pts=nodeTopSurface(id,viewer);if(!pts)continue;const e=document.createElementNS(ns,'polygon');e.setAttribute('class','rangeSurface');e.setAttribute('points',pts.map(p=>`${p.x},${p.y}`).join(' '));e.dataset.pos=id;layer.appendChild(e)}syncRangeSurfacePath()}",
"function renderRangeSurfaces(reach,moveLimit,viewer,strongLimit=0){const layer=$('#rangeSurfaceLayer');if(!layer)return;layer.replaceChildren();if(!reach||moveLimit<=0)return;const ns='http://www.w3.org/2000/svg';for(const [id,d] of reach){if(d>moveLimit)continue;const pts=nodeTopSurface(id,viewer);if(!pts)continue;const e=document.createElementNS(ns,'polygon');e.setAttribute('class','rangeSurface'+(strongLimit>0&&d>strongLimit?' roadMoveExtension':''));e.setAttribute('points',pts.map(p=>`${p.x},${p.y}`).join(' '));e.dataset.pos=id;layer.appendChild(e)}syncRangeSurfacePath()}",
'range surfaces')

one(
"const moveLimit=normalMoveLimitForRoad(me.plan?.roadId),reach=m.phase==='plan'&&me.plan?.roadId&&moveLimit>0?reachable(me,moveLimit):new Map();renderRangeSurfaces(reach,moveLimit,me);",
"const moveLimit=draftMoveLimitForPlayer(me),strongMoveLimit=normalMoveLimitForPlayer(me),reach=m.phase==='plan'&&moveLimit>0?reachable(me,moveLimit):new Map();renderRangeSurfaces(reach,moveLimit,me,strongMoveLimit);",
'render board reach')

one("board.appendChild(e)});renderBoardPlayers();renderRouteLine()}","board.appendChild(e)});renderBoardPlayers();renderRouteLine();syncRoadMoveDraftUi()}",'render board sync')
one("if(me.plan?.battleId)bs.value=me.plan.battleId;syncDirectPlanRoleUi()}","if(me.plan?.battleId)bs.value=me.plan.battleId;syncDirectPlanRoleUi();syncRoadMoveDraftUi()}",'render hand sync')
one("if(r!==me.plan.roadId){me.plan.roadId=r||null;me.plan.path=[me.position]}me.plan.battleId=b||null;","if(r!==me.plan.roadId)me.plan.roadId=r||null;me.plan.battleId=b||null;",'preserve path on road focus')
one("function selectEndpoint(id){const me=state.match.players[0];if(!me.plan?.roadId)return;const path=shortest(me.position,id,normalMoveLimitForRoad(me.plan.roadId),me);if(!path)return;me.plan.path=path;$('#endpointText').textContent=id;renderBoard();updateBattleAvatar()}","function selectEndpoint(id){const me=state.match.players[0],moveLimit=draftMoveLimitForPlayer(me);if(moveLimit<1)return;const path=shortest(me.position,id,moveLimit,me);if(!path)return;me.plan=me.plan||{roadId:null,battleId:null,path:[me.position]};me.plan.path=path;$('#endpointText').textContent=id;renderBoard();updateBattleAvatar()}",'endpoint move first')
one("const reach=me.plan?.roadId?reachable(me,normalMoveLimitForRoad(me.plan.roadId)):new Map();","const moveLimit=draftMoveLimitForPlayer(me),reach=moveLimit>0?reachable(me,moveLimit):new Map();",'drag nearest reach')
one("function refreshDragVisual(){const me=state.match.players[0],end=me.plan?.path?.at(-1)||me.position,p=fieldProjection.get(end);if(p){const e=$('#battleRuntime');e.style.left=p.x+'%';e.style.top=p.y+'%'}layoutBoardPlayerTokens();renderRouteLine();syncRangeSurfacePath();$$('#board .node').forEach(e=>e.classList.toggle('path',me.plan?.path?.includes(e.dataset.pos)));$('#endpointText').textContent=end;window.__GAMEROAD_BATTLE_FOCUS_R1__?.decorate?.()}","function refreshDragVisual(){const me=state.match.players[0],end=me.plan?.path?.at(-1)||me.position,p=fieldProjection.get(end);if(p){const e=$('#battleRuntime');e.style.left=p.x+'%';e.style.top=p.y+'%'}layoutBoardPlayerTokens();renderRouteLine();syncRangeSurfacePath();$$('#board .node').forEach(e=>e.classList.toggle('path',me.plan?.path?.includes(e.dataset.pos)));$('#endpointText').textContent=end;syncRoadMoveDraftUi();window.__GAMEROAD_BATTLE_FOCUS_R1__?.decorate?.()}",'drag ui sync')
one("function beginRouteDrag(ev){const m=state.match,me=m?.players?.[0];if(!m||m.phase!=='plan'||m.busy||!me.plan?.roadId)return;const power=normalMoveLimitForRoad(me.plan.roadId);if(power<1)return;routeDrag={pointerId:ev.pointerId,before:[...(me.plan.path||[me.position])],path:[me.position]};me.plan.path=[me.position];","function beginRouteDrag(ev){const m=state.match,me=m?.players?.[0];if(!m||m.phase!=='plan'||m.busy)return;const power=draftMoveLimitForPlayer(me);if(power<1)return;const currentPath=roadMoveDraftPath(me);me.plan=me.plan||{roadId:null,battleId:null,path:[me.position]};routeDrag={pointerId:ev.pointerId,before:[...currentPath],path:[...currentPath]};me.plan.path=[...currentPath];",'drag begin move first')
one("path.length-1<normalMoveLimitForRoad(me.plan.roadId)","path.length-1<draftMoveLimitForPlayer(me)",'drag extension limit')

one(
"const me=m.players[0];updatePlanFromSelect();if(!me.plan?.roadId||!me.plan?.battleId){toast('ロードカードとバトルカードを選択してください');return false}",
"const me=m.players[0];updatePlanFromSelect();const compatibleRoadIds=compatibleRoadCandidatesForPath(me);if(roadMoveDraftSteps(me)>0&&!compatibleRoadIds.includes(me.plan?.roadId)){const decisionRoadId=roadMoveDecisionCard(me);if(decisionRoadId){me.plan.roadId=decisionRoadId;const roadSelect=$('#roadSelect');if(roadSelect)roadSelect.value=decisionRoadId;syncRoadMoveDraftUi()}else{toast(compatibleRoadIds.length>1?'使用するロードカードを選択してください':'この経路に対応するロードカードがありません');return false}}if(!me.plan?.roadId||!me.plan?.battleId){toast('ロードカードとバトルカードを選択してください');return false}",
'explicit decision normalization')

one("if(step==='road'){cue.textContent='手札からロードカードを1枚選ぶ';","if(step==='road'){cue.textContent='ロードカードを選ぶか、先に人物を動かす';",'first10 neutral order')
one("b.onclick=()=>first10SelectHandCard(id)","b.onclick=()=>{if(roadMoveShouldTreatTapAsRoad(me,id))setDirectPlanRole('road');return first10SelectHandCard(id)}",'elastic Road tap routing')
one("function renderBattle(){if(!state.match)return;renderPhase();renderPlayers();renderHand();renderTarget();renderBoard();","function renderBattle(){if(!state.match)return;renderPhase();renderPlayers();renderHand();ensureRoadMoveReservationSync();renderTarget();renderBoard();",'reservation sync mount')
one("snapshot:()=>{const me=state.match?.players?.[0];return{role:directPlanRole,roadId:me?.plan?.roadId||null,battleId:me?.plan?.battleId||null,path:[...(me?.plan?.path||[])],moveLimit:normalMoveLimitForPlayer(me)}}","snapshot:()=>{const me=state.match?.players?.[0];return{role:directPlanRole,roadId:me?.plan?.roadId||null,battleId:me?.plan?.battleId||null,path:[...(me?.plan?.path||[])],moveLimit:normalMoveLimitForPlayer(me),draftMoveLimit:draftMoveLimitForPlayer(me),compatibleRoadIds:compatibleRoadCandidatesForPath(me),decisionRoadId:roadMoveDecisionCard(me),ordinaryRoadIds:roadMoveHeldCandidates(me)}}",'test snapshot')

style = '''\n<style id="gameroad-road-move-bidirectional-r5">\n.battle #hand .handCard[data-road-move-state="COMPATIBLE"]{outline:2px solid rgba(185,245,224,.92)!important;outline-offset:2px!important;filter:brightness(1.12)!important;translate:0 -7px!important;scale:1.015!important}\n.battle #hand .handCard[data-road-move-state="FOCUSED"]{outline:3px double #fff0a8!important;outline-offset:2px!important;filter:brightness(1.18)!important;translate:0 -11px!important;scale:1.035!important;box-shadow:0 0 0 2px rgba(255,240,168,.14),0 0 18px rgba(255,223,125,.32)!important}\n.battle #hand .handCard[data-road-move-state="INVALID_FOCUS"]{outline:2px dashed rgba(255,255,255,.72)!important;outline-offset:2px!important;filter:brightness(.78) saturate(.72)!important;translate:0 -3px!important;scale:.985!important}\n.battle #hand .handCard.roadMoveSoft{outline-width:3px!important;translate:0 -10px!important;scale:1.03!important}\n.battle .rangeSurface.roadMoveExtension{fill:rgba(151,203,190,.055)!important;stroke:rgba(220,241,234,.42)!important;stroke-dasharray:4 4!important;opacity:.72!important}\nhtml.r10LowPerf .battle #hand .handCard[data-road-move-state]{box-shadow:none!important}\n@media(prefers-reduced-motion:reduce){.battle #hand .handCard[data-road-move-state],.battle #hand .handCard.roadMoveSoft{transition:none!important;translate:none!important;scale:1!important}}\n</style>\n'''
one('</body>', style + '</body>', 'R5 style')
p.write_text(s)

Path('tests/road-move-bidirectional-live-r5.spec.mjs').write_text(r'''import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../browser/GAMEROAD.html',import.meta.url),'utf8');

test('R5 source contract preserves one authority and Battle-card behavior',()=>{
  expect(html).toContain('ROAD-MOVE-BIDIRECTIONAL-R5');
  expect(html).toContain("e.dataset.jankenReserved==='true'");
  expect(html).toContain("steps<=normalMoveLimitForRoad(id)");
  expect(html).toContain("compatibleRoadIds.length>1?'使用するロードカードを選択してください'");
  expect(html).toContain("if(me.plan.roadId===me.plan.battleId){toast('別の札を選択してください')");
  expect(html).toContain("removeHand(p,p.plan.battleId)");
  expect(html).not.toContain('if(r!==me.plan.roadId){me.plan.roadId=r||null;me.plan.path=[me.position]}');
  for(const state of ['NORMAL','COMPATIBLE','FOCUSED','INVALID_FOCUS']) expect(html).toContain(state);
  expect(html).toContain('@media(prefers-reduced-motion:reduce)');
});

async function boot(page){
  const response=await page.goto('/browser/GAMEROAD.html',{waitUntil:'domcontentloaded'});expect(response?.ok()).toBeTruthy();
  await page.waitForTimeout(1000);await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}
async function installLegalBattleDeck(page){return page.evaluate(()=>{const t=window.__GAMEROAD_TEST__;const publicMain=new Set(t.deckPublic().filter(c=>c.slot==='main').map(c=>c.id));const standard=window.__CARD_DATA__.filter(c=>publicMain.has(c.id)&&/^(SP|HT|DI|CL)$/.test(c.suit)&&/^(A|[2-9]|10|J|Q|K)$/.test(String(c.rank))).map(c=>c.id);const royal=['SP_J','SP_Q','SP_K'],nonRoyal=standard.filter(id=>!t.isRoyalCard(id)),main=[...nonRoyal.slice(0,37),...royal];t.deckSetDraft(main,[]);return t.deckCommit()})}
async function openRoadBattle(page){await boot(page);expect(await installLegalBattleDeck(page)).toBeTruthy();const setupGo=page.locator('[data-home-target="setup"]:visible,[data-go="setup"]:visible').first();await expect(setupGo).toBeVisible({timeout:15000});await setupGo.click();const setup=page.locator('section[data-screen="setup"]');await expect(setup).toBeVisible();await setup.locator('[data-content="road_shield"]').click();await setup.locator('[data-mode="2p"]').click();await expect(setup.locator('#startMatch')).toBeEnabled();await setup.locator('#startMatch').click();const battle=page.locator('section[data-screen="battle"]');await expect(battle).toBeVisible();await expect(battle.locator('#phaseTitle')).toContainText('行動を計画');await page.waitForTimeout(250);return battle}

async function snapshot(page){return page.evaluate(()=>window.__GAMEROAD_DIRECT_CARD_TEST__.snapshot())}

test('move-first exposes compatible ordinary Road cards and focus keeps the drafted path',async({page})=>{
  const battle=await openRoadBattle(page);const start=await snapshot(page);expect(start.roadId).toBeNull();expect(start.draftMoveLimit).toBeGreaterThan(0);expect(start.ordinaryRoadIds.length).toBeGreaterThan(0);
  const reserved=await battle.locator('#hand .handCard[data-janken-reserved="true"]').evaluateAll(ns=>ns.map(n=>n.dataset.cardId));for(const id of reserved)expect(start.ordinaryRoadIds).not.toContain(id);
  const next=battle.locator('.node.reachable[data-move-distance="1"]').first();await expect(next).toBeEnabled();await next.click();const moved=await snapshot(page);expect(moved.path.length).toBeGreaterThan(1);expect(moved.compatibleRoadIds.length).toBeGreaterThan(0);expect(moved.roadId).toBeNull();
  const candidate=battle.locator('#hand .handCard[data-road-move-state="COMPATIBLE"],#hand .handCard.roadMoveSoft').first();await expect(candidate).toBeVisible();const beforePath=JSON.stringify(moved.path);await candidate.click();await expect.poll(async()=> (await snapshot(page)).roadId).not.toBeNull();const focused=await snapshot(page);expect(JSON.stringify(focused.path)).toBe(beforePath);expect(focused.compatibleRoadIds).toContain(focused.roadId);expect(focused.battleId).toBeNull();await expect(battle.locator(`#hand .handCard[data-card-id="${focused.roadId}"]`)).toHaveAttribute('data-road-move-state','FOCUSED');
});

test('card-first still moves, and undo recomputes compatibility without clearing focus',async({page})=>{
  const battle=await openRoadBattle(page);const initial=await snapshot(page);const id=initial.ordinaryRoadIds[0];expect(id).toBeTruthy();const card=battle.locator(`#hand .handCard[data-card-id="${id}"]`);await expect(card).toBeVisible();await card.click();await expect.poll(async()=> (await snapshot(page)).roadId).toBe(id);const focused0=await snapshot(page);expect(focused0.path.length).toBe(1);await expect(card).toHaveAttribute('data-road-move-state','FOCUSED');
  const next=battle.locator('.node.reachable[data-move-distance="1"]').first();await expect(next).toBeEnabled();await next.click();const moved=await snapshot(page);expect(moved.roadId).toBe(id);expect(moved.path.length).toBeGreaterThan(1);const beforeCount=moved.compatibleRoadIds.length;await battle.locator('#clearPath').click();const backed=await snapshot(page);expect(backed.path.length).toBe(Math.max(1,moved.path.length-1));expect(backed.roadId).toBe(id);expect(backed.compatibleRoadIds.length).toBeGreaterThanOrEqual(beforeCount===0?0:beforeCount);
});
''')

subprocess.run(['git','diff','--check'],check=True)
print('R5_PATCH_READY')
