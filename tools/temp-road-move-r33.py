from pathlib import Path

HTML = Path('browser/GAMEROAD.html')
BUILD = Path('deploy/cloudflare/scripts/build.mjs')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)


html = HTML.read_text(encoding='utf-8')

old_helpers = """function normalMoveLimitForPlayer(p){return normalMoveLimitForRoad(p?.plan?.roadId)}
function preferredRoadCandidates(hand){const all=(hand||[]).filter(roadSelectable),movable=all.filter(id=>normalMoveLimitForRoad(id)>0);return movable.length?movable:all}"""
new_helpers = """function normalMoveLimitForPlayer(p){return normalMoveLimitForRoad(p?.plan?.roadId)}
function preferredRoadCandidates(hand){const all=(hand||[]).filter(roadSelectable),movable=all.filter(id=>normalMoveLimitForRoad(id)>0);return movable.length?movable:all}
function roadDraftCandidateIds(p){const blocked=p?.plan?.battleId||null;return(p?.hand||[]).filter(id=>id!==blocked&&normalMoveLimitForRoad(id)>0)}
function roadDraftMoveLimit(p){return roadDraftCandidateIds(p).reduce((max,id)=>Math.max(max,normalMoveLimitForRoad(id)),0)}
function roadDraftPathLegal(path,p){if(!Array.isArray(path)||!p||path.length<2||path[0]!==p.position)return false;for(let i=1;i<path.length;i++){if(!neighbors(path[i-1],p).includes(path[i])||path.slice(0,i).includes(path[i]))return false}return true}
function roadDraftPathStoppable(path,p){const max=roadDraftMoveLimit(p),steps=Array.isArray(path)?path.length-1:0;if(!p||steps<1||steps>max)return false;const end=path.at(-1),reach=reachable(p,max);return reach.has(end)&&reach.get(end)===steps}
function compatibleRoadIdsForDraft(p,path=p?.plan?.path||[p?.position]){const fn=globalThis.__GAMEROAD_ROAD_MOVE_COMPATIBILITY__?.compatibleRoadCards;if(typeof fn!=='function'||!p||!Array.isArray(path)||path.length<2)return[];const cards=roadDraftCandidateIds(p);return fn(cards,path,{roadValueOf:id=>normalMoveLimitForRoad(id),pathStepCountOf:x=>Array.isArray(x)?x.length-1:0,isPathLegal:x=>roadDraftPathLegal(x,p),isPathStoppable:x=>roadDraftPathStoppable(x,p)})}
function roadMoveStateFor(id,p){const path=p?.plan?.path||[p?.position],compatible=new Set(compatibleRoadIdsForDraft(p,path)),focused=p?.plan?.roadId===id;if(focused)return compatible.has(id)?'FOCUSED':(path.length>1?'INVALID_FOCUS':'FOCUSED');return compatible.has(id)?'COMPATIBLE':null}
function syncRoadMoveHandState(){const p=state.match?.players?.[0],hand=$('#hand');if(!p||!hand)return;[...hand.querySelectorAll('.handCard[data-card-id]')].forEach(b=>{const s=roadMoveStateFor(b.dataset.cardId,p);if(s)b.dataset.roadMoveState=s;else delete b.dataset.roadMoveState})}"""
html = replace_once(html, old_helpers, new_helpers, 'Road draft helpers')

old_nearest = "const reach=me.plan?.roadId?reachable(me,normalMoveLimitForRoad(me.plan.roadId)):new Map();"
new_nearest = "const draftLimit=roadDraftMoveLimit(me),reach=draftLimit>0?reachable(me,draftLimit):new Map();"
html = replace_once(html, old_nearest, new_nearest, 'nearestProjectedNode draft reach')

old_begin = "function beginRouteDrag(ev){const m=state.match,me=m?.players?.[0];if(!m||m.phase!=='plan'||m.busy||!me.plan?.roadId)return;const power=normalMoveLimitForRoad(me.plan.roadId);if(power<1)return;routeDrag={pointerId:ev.pointerId,before:[...(me.plan.path||[me.position])],path:[me.position]};me.plan.path=[me.position];$('#battleRuntime').classList.add('dragging');try{$('#battleRuntime').setPointerCapture(ev.pointerId)}catch(e){}refreshDragVisual();ev.preventDefault()}"
new_begin = "function beginRouteDrag(ev){const m=state.match,me=m?.players?.[0];if(!m||m.phase!=='plan'||m.busy)return;const power=roadDraftMoveLimit(me);if(power<1)return;routeDrag={pointerId:ev.pointerId,before:[...(me.plan?.path||[me.position])],path:[me.position]};me.plan=me.plan||{roadId:null,battleId:null,path:[me.position]};me.plan.path=[me.position];$('#battleRuntime').classList.add('dragging');try{$('#battleRuntime').setPointerCapture(ev.pointerId)}catch(e){}refreshDragVisual();ev.preventDefault()}"
html = replace_once(html, old_begin, new_begin, 'beginRouteDrag move-first')

old_move = "else if(path.length-1<normalMoveLimitForRoad(me.plan.roadId)&&neighbors(last,me).includes(id)&&!path.includes(id)){path.push(id)}me.plan.path=[...path];renderRouteLine();syncRangeSurfacePath();$$('#board .node').forEach(e=>e.classList.toggle('path',me.plan?.path?.includes(e.dataset.pos)));$('#endpointText').textContent=path.at(-1)||me.position;window.__GAMEROAD_BATTLE_FOCUS_R1__?.decorate?.()}ev.preventDefault()}"
new_move = "else if(path.length-1<roadDraftMoveLimit(me)&&neighbors(last,me).includes(id)&&!path.includes(id)){path.push(id)}me.plan.path=[...path];renderRouteLine();syncRangeSurfacePath();syncRoadMoveHandState();$$('#board .node').forEach(e=>e.classList.toggle('path',me.plan?.path?.includes(e.dataset.pos)));$('#endpointText').textContent=path.at(-1)||me.position;window.__GAMEROAD_BATTLE_FOCUS_R1__?.decorate?.()}ev.preventDefault()}"
html = replace_once(html, old_move, new_move, 'moveRouteDrag draft limit')

old_refresh = "layoutBoardPlayerTokens();renderRouteLine();syncRangeSurfacePath();$$('#board .node').forEach(e=>e.classList.toggle('path',me.plan?.path?.includes(e.dataset.pos)));"
new_refresh = "layoutBoardPlayerTokens();renderRouteLine();syncRangeSurfacePath();syncRoadMoveHandState();$$('#board .node').forEach(e=>e.classList.toggle('path',me.plan?.path?.includes(e.dataset.pos)));"
html = replace_once(html, old_refresh, new_refresh, 'refreshDragVisual candidate sync')

old_board_reach = "const moveLimit=normalMoveLimitForRoad(me.plan?.roadId),reach=m.phase==='plan'&&me.plan?.roadId&&moveLimit>0?reachable(me,moveLimit):new Map();"
new_board_reach = "const moveLimit=roadDraftMoveLimit(me),reach=m.phase==='plan'&&moveLimit>0?reachable(me,moveLimit):new Map();"
html = replace_once(html, old_board_reach, new_board_reach, 'renderBoard move-first reach')

old_board_tail = "renderBoardPlayers();renderRouteLine()}\nfunction battleHandFaceMarkup"
new_board_tail = "renderBoardPlayers();renderRouteLine();syncRoadMoveHandState()}\nfunction battleHandFaceMarkup"
html = replace_once(html, old_board_tail, new_board_tail, 'renderBoard candidate sync')

old_hand_tail = "if(me.plan?.roadId)rs.value=me.plan.roadId;if(me.plan?.battleId)bs.value=me.plan.battleId;syncDirectPlanRoleUi()}"
new_hand_tail = "if(me.plan?.roadId)rs.value=me.plan.roadId;if(me.plan?.battleId)bs.value=me.plan.battleId;syncDirectPlanRoleUi();syncRoadMoveHandState()}"
html = replace_once(html, old_hand_tail, new_hand_tail, 'renderHand candidate sync')

old_plan_reset = "if(r!==me.plan.roadId){me.plan.roadId=r||null;me.plan.path=[me.position]}me.plan.battleId=b||null;"
new_plan_reset = "if(r!==me.plan.roadId)me.plan.roadId=r||null;me.plan.battleId=b||null;"
html = replace_once(html, old_plan_reset, new_plan_reset, 'Road switch preserves draft path')

old_endpoint = "function selectEndpoint(id){const me=state.match.players[0];if(!me.plan?.roadId)return;const path=shortest(me.position,id,normalMoveLimitForRoad(me.plan.roadId),me);if(!path)return;me.plan.path=path;$('#endpointText').textContent=id;renderBoard();updateBattleAvatar()}"
new_endpoint = "function selectEndpoint(id){const me=state.match.players[0],moveLimit=roadDraftMoveLimit(me);if(moveLimit<1)return;me.plan=me.plan||{roadId:null,battleId:null,path:[me.position]};const path=shortest(me.position,id,moveLimit,me);if(!path)return;me.plan.path=path;$('#endpointText').textContent=id;renderBoard();updateBattleAvatar()}"
html = replace_once(html, old_endpoint, new_endpoint, 'selectEndpoint move-first')

old_hand_role = "const road=$('#roadSelect'),battle=$('#battleSelect');\n  if(!road.value)setDirectPlanRole('road');else if(!battle.value)setDirectPlanRole('battle');"
new_hand_role = "const road=$('#roadSelect'),battle=$('#battleSelect'),path=me.plan?.path||[me.position],compatibleNow=new Set(compatibleRoadIdsForDraft(me,path)),focusedRoadInvalid=!!road.value&&path.length>1&&!compatibleNow.has(road.value);\n  if(focusedRoadInvalid&&compatibleNow.has(id))setDirectPlanRole('road');else if(!road.value)setDirectPlanRole('road');else if(!battle.value)setDirectPlanRole('battle');"
html = replace_once(html, old_hand_role, new_hand_role, 'Elastic candidate switches Road focus')

old_ctx_endpoint = "const __ctxBaseSelectEndpoint=selectEndpoint;selectEndpoint=function(id){const me=state.match?.players?.[0];if(!me?.plan?.roadId){ctxSet('PLAN_CARD_MISSING',{message:'先にロードカードを選ぶと移動範囲を決められます。'});return}const path=shortest(me.position,id,normalMoveLimitForRoad(me.plan.roadId),me);if(!path){ctxSet('MOVE_PATH_INVALID');return}const r=__ctxBaseSelectEndpoint(id);ctxClear();return r};"
new_ctx_endpoint = "const __ctxBaseSelectEndpoint=selectEndpoint;selectEndpoint=function(id){const me=state.match?.players?.[0],moveLimit=roadDraftMoveLimit(me);if(!me||moveLimit<1){ctxSet('PLAN_CARD_MISSING',{message:'移動に使えるロードカードが手札にありません。'});return}const path=shortest(me.position,id,moveLimit,me);if(!path){ctxSet('MOVE_PATH_INVALID');return}const r=__ctxBaseSelectEndpoint(id);ctxClear();return r};"
html = replace_once(html, old_ctx_endpoint, new_ctx_endpoint, 'context move-first endpoint')

profile_module = '<script type="module" src="./profile-presentation-runtime-mount.mjs"></script>'
road_module = """<script type=\"module\">\nimport { compatibleRoadCards } from './road-move-compatibility-core.mjs';\nglobalThis.__GAMEROAD_ROAD_MOVE_COMPATIBILITY__=Object.freeze({compatibleRoadCards});\n</script>\n""" + profile_module
html = replace_once(html, profile_module, road_module, 'Road compatibility module binding')

HTML.write_text(html, encoding='utf-8')

build = BUILD.read_text(encoding='utf-8')
anchor = "  { source: 'browser/battle-invalid-action-feedback-live-adapter.mjs', output: 'battle-invalid-action-feedback-live-adapter.mjs', artifact: 'battle_invalid_action_feedback_live_adapter', label: 'Battle invalid-action feedback live adapter' },\n"
road_spec = anchor + "  { source: 'browser/road-move-compatibility-core.mjs', output: 'road-move-compatibility-core.mjs', artifact: 'road_move_compatibility_core', label: 'Road move compatibility core' },\n"
build = replace_once(build, anchor, road_spec, 'Cloudflare Road core artifact pin')
BUILD.write_text(build, encoding='utf-8')

print('Road R33 patch applied: existing compatibility core -> live HTML + public artifact pin')
