from pathlib import Path
import re

html_path = Path('browser/GAMEROAD.html')
build_path = Path('deploy/cloudflare/scripts/build.mjs')
probe_path = Path('data/battle-configurable-completion-live-r1-probe.txt')
html = html_path.read_text(encoding='utf-8')
build = build_path.read_text(encoding='utf-8')

MARKER = 'GAMEROAD_BATTLE_CONFIGURABLE_COMPLETION_LIVE_R1'


def replace_exact(text, old, new, label, expected=1):
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{label}: expected {expected} exact anchors, found {count}')
    return text.replace(old, new)


def replace_regex(text, pattern, repl, label, flags=0):
    out, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 regex anchor, found {count}')
    return out


if MARKER not in html:
    # Public module bridge. The large gameplay script stays classic and consumes one immutable core.
    anchor = '<script src="./board-facility-state-core.classic.js"></script>'
    bridge = '''<!-- GAMEROAD_BATTLE_CONFIGURABLE_COMPLETION_LIVE_R1 -->
<script type="module" id="gameroad-battle-completion-rule-bridge-r1">
import { COMPLETION_CONSEQUENCE, resolveCompletionRule, projectCompletionRule } from "./new-base-legacy-seven-win-gate-core.mjs";
const completionRuleCore=Object.freeze({COMPLETION_CONSEQUENCE,resolveCompletionRule,projectCompletionRule});
const existingCompletionRuleCore=globalThis.GAMEROAD_BATTLE_COMPLETION_RULE_CORE;
if(existingCompletionRuleCore&&existingCompletionRuleCore!==completionRuleCore)throw new Error("GAMEROAD_BATTLE_COMPLETION_RULE_CORE_CONFLICT");
if(!existingCompletionRuleCore)Object.defineProperty(globalThis,"GAMEROAD_BATTLE_COMPLETION_RULE_CORE",{value:completionRuleCore,enumerable:false,configurable:false,writable:false});
</script>
''' + anchor
    html = replace_exact(html, anchor, bridge, 'completion module bridge')

    # Current Basic road/shield semantics: 7 connects the GOAL path; GOAL reach remains terminal elsewhere.
    init_anchor = "function initRoundRuntime(m){m.participants=new Map(m.players.map(p=>[p.id,[]]));m.participantSeq=0;m.resolvedAbilityKeys=new Set();m.abilityOrderReceipts=new Map();m.testAutoChoices=false;quickStartRound(m)}"
    helpers = init_anchor + '''
const GR_COMPLETION_DIRECT='DIRECT_COMPLETION_WIN',GR_COMPLETION_GOAL='CONNECT_GOAL_PATH';
const GR_BASIC_COMPLETION_PROFILES=Object.freeze({
  road_shield:Object.freeze({completionTargetCount:7,completionConsequence:GR_COMPLETION_GOAL,maxReachableCount:7}),
  honey_hunt:Object.freeze({completionTargetCount:7,completionConsequence:GR_COMPLETION_DIRECT})
});
function grCompletionCore(){const core=globalThis.GAMEROAD_BATTLE_COMPLETION_RULE_CORE;if(!core?.resolveCompletionRule||!core?.projectCompletionRule)throw Error('battle-completion-rule-core-unavailable');return core}
function grBaseCompletionProfile(contentId){const p=GR_BASIC_COMPLETION_PROFILES[String(contentId||'')];if(!p)throw Error('battle-completion-profile-unresolved:'+String(contentId||''));return p}
function grResolveCompletionRule(input,contentId){const source=input===undefined?grBaseCompletionProfile(contentId):input;return grCompletionCore().resolveCompletionRule({completionTargetCount:source?.completionTargetCount,completionConsequence:source?.completionConsequence,maxReachableCount:source?.maxReachableCount??null})}
function grCompletionProjection(count,m=state.match){if(!m?.completionRule)throw Error('battle-completion-rule-missing');return grCompletionCore().projectCompletionRule({authoritativeCount:Number(count),resolvedRule:m.completionRule})}
function grGoalGateKey(playerId,lane){return String(playerId)+':'+String(lane)}
function grGoalGateIsOpen(playerId,lane,m=state.match){return!!m?.goalGateOpenByLane?.[grGoalGateKey(playerId,lane)]}
function grSyncGoalGates(m=state.match){if(!m?.completionRule||m.completionRule.completionConsequence!==GR_COMPLETION_GOAL)return[];m.goalGateOpenByLane||(m.goalGateOpenByLane={});const opened=[];for(const p of m.players)for(const lane of ['L','C','R']){const projection=grCompletionProjection(p.lanes[lane].length,m),key=grGoalGateKey(p.id,lane);if(projection.connectGoalPath&&!m.goalGateOpenByLane[key]){m.goalGateOpenByLane[key]=true;opened.push({playerId:p.id,lane,count:p.lanes[lane].length,target:m.completionRule.completionTargetCount});log(`${p.name} ${lane==='L'?'左':lane==='C'?'中央':'右'}列：ゲート解放！`)}}return opened}
function grDirectCompletionWinners(m=state.match){if(!m?.completionRule)return[];const completed=m.players.filter(p=>Object.values(p.lanes).some(cards=>grCompletionProjection(cards.length,m).forwardCompletionWin));if(m.mode==='2v2')return['A','B'].filter(team=>completed.some(p=>p.team===team));return completed.map(p=>p.id)}
function grCompletionRuleLabel(rule){if(!rule)return'勝利ルール未設定';const n=rule.completionTargetCount;return rule.completionConsequence===GR_COMPLETION_GOAL?`一列${n}枚でゲート解放 → GOAL到達で勝利`:`一列${n}枚で勝利`}
'''
    html = replace_exact(html, init_anchor, helpers, 'completion helpers')

    html = replace_exact(html, 'function startMatch(){', 'function startMatch(completionRuleInput){', 'startMatch signature')
    start_anchor = "}const n=playerCount(snapshot.setup.mode),ps=[],diagnosticCpuDeck=[...snapshot.deck.main];"
    start_rule = "}let completionRule;try{completionRule=grResolveCompletionRule(completionRuleInput,snapshot.setup.content)}catch(e){console.error(e);toast('勝利ルールを開始できません');show('setup');return null}const n=playerCount(snapshot.setup.mode),ps=[],diagnosticCpuDeck=[...snapshot.deck.main];"
    html = replace_exact(html, start_anchor, start_rule, 'startMatch completion resolve')
    html = replace_exact(html, "busy:false,deckStartSnapshot:snapshot,", "busy:false,completionRule,goalGateOpenByLane:{},deckStartSnapshot:snapshot,", 'match completion state')
    old_log = "log(snapshot.setup.content==='honey_hunt'?'第1巡。ハニーハント：一筆移動・終点ハニー全量取得・一列七枚勝利。人物を直接ドラッグして経路を秘密予約します。':'第1巡。全員が行動を予約します。');"
    new_log = "log(snapshot.setup.content==='honey_hunt'?'第1巡。ハニーハント：一筆移動・終点ハニー全量取得・一列七枚勝利。人物を直接ドラッグして経路を秘密予約します。':`第1巡。${grCompletionRuleLabel(completionRule)}。全員が行動を予約します。`);"
    html = replace_exact(html, old_log, new_log, 'match opening rule log')

    html = replace_exact(
        html,
        "grBattleReplayAcceptResolution(m,m.lastBattleResolution);const slaykiaAttackEnd=grSlaykiaAttackEndHook(m);",
        "grBattleReplayAcceptResolution(m,m.lastBattleResolution);grSyncGoalGates(m);const slaykiaAttackEnd=grSlaykiaAttackEndHook(m);",
        'goal gate sync after authoritative lane mutation'
    )
    old_check = "function checkWin(){if(state.match.mode==='2v2'){const teams=['A','B'].filter(t=>state.match.players.filter(p=>p.team===t).some(p=>Math.max(...Object.values(p.lanes).map(a=>a.length))>=7));return teams}return state.match.players.filter(p=>Math.max(...Object.values(p.lanes).map(a=>a.length))>=7).map(p=>p.id)}"
    html = replace_exact(html, old_check, "function checkWin(){return grDirectCompletionWinners(state.match)}", 'remove hardcoded seven win')
    html = replace_exact(
        html,
        "else if(m.contentId==='honey_hunt')log('一列へ実札が七枚以上連続配置され、ハニーハントの勝利条件が成立しました。');",
        "else if(m.completionRule?.completionConsequence===GR_COMPLETION_DIRECT)log(`一列へ実札が${m.completionRule.completionTargetCount}枚以上連続配置され、勝利条件が成立しました。`);",
        'direct win log'
    )

    lane_old = '<div class="laneMini"><i>左 ${p.lanes.L.length}</i><i>中 ${p.lanes.C.length}</i><i>右 ${p.lanes.R.length}</i></div>'
    lane_new = '<div class="laneMini"><i>左 ${p.lanes.L.length}${grGoalGateIsOpen(p.id,\'L\')?\'・開門\':\'\'}</i><i>中 ${p.lanes.C.length}${grGoalGateIsOpen(p.id,\'C\')?\'・開門\':\'\'}</i><i>右 ${p.lanes.R.length}${grGoalGateIsOpen(p.id,\'R\')?\'・開門\':\'\'}</i></div>'
    html = replace_exact(html, lane_old, lane_new, 'visible gate-open state')
    html = replace_exact(html, '<b id="setupGoalTitle">一列7枚</b>', '<b id="setupGoalTitle">7枚でゲート解放</b>', 'basic setup goal label')

    # Friend Room owns its room-rule authority and broadcasts it with lobby + match snapshots.
    html = replace_exact(html, "const V=2, ALPHABET=", "const V=3, ALPHABET=", 'friend protocol version')
    html = replace_regex(html, r"const BUILD='BROWSERROOM-R32-HATEAUTH-[^']+';", "const BUILD='BROWSERROOM-R33-COMPLETIONRULE-20260910-N6Q4M8';", 'friend build id')
    html = replace_exact(html, "playerCount:2,contentId:'road_shield',", "playerCount:2,contentId:'road_shield',completionTargetCount:7,completionConsequence:'CONNECT_GOAL_PATH',", 'friend rule state fields', expected=2)

    friend_helper_anchor = "const FRIEND_TRANSPORT_PRESENCE_TYPE='transport_presence';"
    friend_helpers = '''function friendCompletionRuleInput(){return{completionTargetCount:FR.completionTargetCount,completionConsequence:FR.completionConsequence,maxReachableCount:FR.completionConsequence===GR_COMPLETION_GOAL?7:null}}
function friendCompletionRuleSnapshot(){const r=grResolveCompletionRule(friendCompletionRuleInput(),FR.contentId);return{completionTargetCount:r.completionTargetCount,completionConsequence:r.completionConsequence,maxReachableCount:r.maxReachableCount}}
function friendApplyCompletionRuleSnapshot(raw){const r=grResolveCompletionRule(raw,FR.contentId);FR.completionTargetCount=r.completionTargetCount;FR.completionConsequence=r.completionConsequence;return r}
function friendUseContentDefaultCompletionRule(){const r=grBaseCompletionProfile(FR.contentId);FR.completionTargetCount=r.completionTargetCount;FR.completionConsequence=r.completionConsequence;return friendCompletionRuleSnapshot()}
function friendSetCompletionRule(target,consequence){if(FR.role!=='host'||FR.roomState!=='lobby')return false;try{const r=grResolveCompletionRule({completionTargetCount:Number(target),completionConsequence:consequence,maxReachableCount:consequence===GR_COMPLETION_GOAL?7:null},FR.contentId);const changed=r.completionTargetCount!==FR.completionTargetCount||r.completionConsequence!==FR.completionConsequence;FR.completionTargetCount=r.completionTargetCount;FR.completionConsequence=r.completionConsequence;if(changed)resetReady();sendAllLobby();return true}catch(e){console.error(e);toast(consequence===GR_COMPLETION_GOAL?'ゲート解放は現在1〜7枚で設定してください':'勝利枚数は1以上の整数で設定してください');renderLobby();return false}}
function friendCompletionRuleLabel(){return grCompletionRuleLabel(friendCompletionRuleSnapshot())}
''' + friend_helper_anchor
    html = replace_exact(html, friend_helper_anchor, friend_helpers, 'friend completion helpers')

    create_anchor = "FR.contentId=state.setupContent||'road_shield';FR.roomState='lobby';"
    html = replace_exact(html, create_anchor, "FR.contentId=state.setupContent||'road_shield';friendUseContentDefaultCompletionRule();FR.roomState='lobby';", 'room default rule')
    html = replace_exact(
        html,
        "function publicLobby(){return{roomState:FR.roomState,code:FR.code,playerCount:FR.playerCount,contentId:FR.contentId,matchNo:FR.matchNo,participants:participantsHost()}}",
        "function publicLobby(){return{roomState:FR.roomState,code:FR.code,playerCount:FR.playerCount,contentId:FR.contentId,completionRule:friendCompletionRuleSnapshot(),matchNo:FR.matchNo,participants:participantsHost()}}",
        'public lobby rule'
    )
    html = replace_exact(
        html,
        "playerCount:FR.playerCount,contentId:FR.contentId,roomState:FR.roomState});",
        "playerCount:FR.playerCount,contentId:FR.contentId,completionRule:friendCompletionRuleSnapshot(),roomState:FR.roomState});",
        'accept room rule'
    )
    html = replace_exact(
        html,
        "FR.contentId=m.contentId||'road_shield';FR.roomState=m.roomState||'lobby';",
        "FR.contentId=m.contentId||'road_shield';friendApplyCompletionRuleSnapshot(m.completionRule);FR.roomState=m.roomState||'lobby';",
        'guest accept rule'
    )
    html = replace_exact(
        html,
        "FR.contentId=m.lobby?.contentId||FR.contentId;FR.guestReady=",
        "FR.contentId=m.lobby?.contentId||FR.contentId;friendApplyCompletionRuleSnapshot(m.lobby?.completionRule);FR.guestReady=",
        'guest lobby rule'
    )
    html = replace_exact(html, "const m=startMatch();if(!m){FR.roomState='lobby';return false}", "const m=startMatch(friendCompletionRuleInput());if(!m){FR.roomState='lobby';return false}", 'host start room rule')
    html = replace_exact(
        html,
        "m.friendRoom={build:BUILD,code:FR.code,playerCount:FR.playerCount,localPid:'P1',host:true,resultPersistenceEnabled:false,noBotFill:true};",
        "m.friendRoom={build:BUILD,code:FR.code,playerCount:FR.playerCount,localPid:'P1',host:true,resultPersistenceEnabled:false,noBotFill:true,completionRule:friendCompletionRuleSnapshot()};",
        'host match room rule'
    )
    html = replace_exact(
        html,
        "contentId:m.contentId,log:[...m.log],players:ordered,",
        "contentId:m.contentId,completionRule:friendCompletionRuleSnapshot(),goalGateOpenByLane:clone(m.goalGateOpenByLane||{}),log:[...m.log],players:ordered,",
        'room projection rule'
    )
    html = replace_exact(
        html,
        "busy:!!pr.busy,honey:{",
        "busy:!!pr.busy,completionRule:grResolveCompletionRule(pr.completionRule,pr.contentId),goalGateOpenByLane:clone(pr.goalGateOpenByLane||{}),honey:{",
        'guest reconstructed match rule'
    )

    # Add a player-visible, host-owned rule card without creating another lobby/state engine.
    ui_inject_anchor = ";document.getElementById('friendCreate2')?.addEventListener('click',()=>createRoom(2));"
    ui_inject = ''';if(!idle){const ruleCard=document.createElement('div');ruleCard.className='friendRoomCard';const rule=friendCompletionRuleSnapshot();ruleCard.innerHTML=`<h3>勝利ルール</h3><div class="friendStatus">${friendCompletionRuleLabel()}</div>${FR.role==='host'&&FR.roomState==='lobby'?`<label class="friendJoinLabel">必要枚数<input id="friendWinCount" type="number" min="1" step="1" inputmode="numeric" value="${rule.completionTargetCount}"></label><div class="friendCreateRow"><button class="btn ${rule.completionConsequence===GR_COMPLETION_GOAL?'on':''}" id="friendRuleGoal">ゲート解放</button><button class="btn ${rule.completionConsequence===GR_COMPLETION_DIRECT?'on':''}" id="friendRuleDirect">その枚数で勝利</button></div><small>ルール変更で全員の準備状態を戻します。</small>`:'<small>部屋主が設定したルールです。</small>'}`;root.querySelector('.friendRoomGrid')?.appendChild(ruleCard)};document.getElementById('friendWinCount')?.addEventListener('change',e=>friendSetCompletionRule(e.currentTarget.value,FR.completionConsequence));document.getElementById('friendRuleGoal')?.addEventListener('click',()=>friendSetCompletionRule(document.getElementById('friendWinCount')?.value||FR.completionTargetCount,GR_COMPLETION_GOAL));document.getElementById('friendRuleDirect')?.addEventListener('click',()=>friendSetCompletionRule(document.getElementById('friendWinCount')?.value||FR.completionTargetCount,GR_COMPLETION_DIRECT))''' + ui_inject_anchor
    html = replace_exact(html, ui_inject_anchor, ui_inject, 'friend room rule UI')

    # Expose the authoritative room rule to current QA without granting guest mutation authority.
    qa_match = "match:state.match?{mode:state.match.mode,phase:state.match.phase,round:state.match.round,activeId:state.match.activeId,friend:!!state.match.friendRoom,"
    html = replace_exact(html, qa_match, "completionRule:friendCompletionRuleSnapshot(),match:state.match?{mode:state.match.mode,phase:state.match.phase,round:state.match.round,activeId:state.match.activeId,friend:!!state.match.friendRoom,", 'friend QA rule snapshot')
    qa_api = "window.GAMEROAD_FRIEND_ROOM_R2={BUILD,create:createRoom,join:joinRoom,ready:toggleReady,start:hostStart,leave:()=>reset(true),returnLobby,status:qaState,"
    html = replace_exact(html, qa_api, "window.GAMEROAD_FRIEND_ROOM_R2={BUILD,create:createRoom,join:joinRoom,ready:toggleReady,start:hostStart,leave:()=>reset(true),returnLobby,status:qaState,setCompletionRule:(n,kind)=>friendSetCompletionRule(n,kind),", 'friend QA rule setter')

    html = replace_exact(
        html,
        "rulings:{honeyPilePickup:'all',win:'one-lane-seven-or-more-real-cards',deckRule:",
        "rulings:{honeyPilePickup:'all',win:'basic-road-shield-seven-connects-goal; room-direct-win-N-configurable',deckRule:",
        'build rule metadata'
    )

if "source: 'browser/new-base-legacy-seven-win-gate-core.mjs'" not in build:
    build_anchor = "  { source: 'browser/new-base-goal-result-core.mjs', output: 'new-base-goal-result-core.mjs', artifact: 'new_base_goal_result_core', label: 'New Base GOAL result authority core' },"
    build_insert = "  { source: 'browser/new-base-legacy-seven-win-gate-core.mjs', output: 'new-base-legacy-seven-win-gate-core.mjs', artifact: 'battle_completion_rule_core', label: 'Battle configurable completion rule core' },\n" + build_anchor
    build = replace_exact(build, build_anchor, build_insert, 'public package completion core')

html_path.write_text(html, encoding='utf-8')
build_path.write_text(build, encoding='utf-8')

# Bounded evidence for readback, not a second source of truth.
checks = {
    'marker': MARKER in html,
    'legacy_hardcoded_checkwin_removed': "function checkWin(){if(state.match.mode==='2v2')" not in html,
    'checkwin_uses_configurable_core': 'function checkWin(){return grDirectCompletionWinners(state.match)}' in html,
    'basic_goal_profile': "road_shield:Object.freeze({completionTargetCount:7,completionConsequence:GR_COMPLETION_GOAL,maxReachableCount:7})" in html,
    'room_rule_ui': 'id="friendWinCount"' in html and 'id="friendRuleDirect"' in html and 'id="friendRuleGoal"' in html,
    'room_protocol_v3': 'const V=3, ALPHABET=' in html,
    'room_snapshot_rule': 'completionRule:friendCompletionRuleSnapshot()' in html,
    'goal_gate_authoritative_state': 'goalGateOpenByLane' in html and 'ゲート解放！' in html,
    'goal_not_terminalized_by_completion': 'grDirectCompletionWinners' in html,
    'public_build_has_core': "source: 'browser/new-base-legacy-seven-win-gate-core.mjs'" in build,
}
failed = [k for k, v in checks.items() if not v]
probe_path.write_text('\n'.join([f'{k}={"PASS" if v else "FAIL"}' for k, v in checks.items()]) + '\n', encoding='utf-8')
if failed:
    raise SystemExit('post-patch checks failed: ' + ', '.join(failed))
