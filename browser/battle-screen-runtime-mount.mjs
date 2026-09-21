import { auditBattleScreenModel } from './battle-screen-presentation-core.mjs';
import { mountBattleCriticalResourceHud } from './battle-critical-resource-hud-runtime.mjs';
import { mountBattleCurrentPlayerUi } from './battle-current-player-ui-runtime.mjs';
import {
  buildBattleLoadCardChainPresentation,
  verifyBattleLoadCommitTransition
} from './battle-load-card-chain-presentation-core.mjs';
import {
  createSaasunaBattleMotionController,
  SAASUNA_BATTLE_MOTION_RUNTIME
} from './saasuna-battle-motion-core.mjs';

const RUNTIME_SCHEMA = 'gameroad.battle-screen-runtime-mount.v1';
const STYLE_ID = 'gameroad-battle-screen-runtime-r1-style';
const SHELL_ATTR = 'data-gr-battle-screen';
const GRID_ATTR = 'data-battle-screen-causal-grid';
const PLAN_SLOT_ATTR = 'data-battle-plan-slot';
const LANE_ATTR = 'data-battle-screen-lane';
const HUD_ATTR = 'data-battle-r75-hud';
const CURRENT_ACTION_ATTR = 'data-battle-current-action';
const CAUSAL_TRACE_ATTR = 'data-battle-causal-trace';
const PROGRESS_GUIDE_ATTR = 'data-battle-progress-guide';
const FIELD_LANDMARK_ATTR = 'data-battle-field-landmark';
const SHIELD_RAIL_ATTR = 'data-battle-shield-lane-rail';
const SHIELD_SLOT_ATTR = 'data-battle-shield-slot';
const CINEMATIC_ORDER_ATTR = 'data-battle-cinematic-order';
const CINEMATIC_DUEL_ATTR = 'data-battle-cinematic-duel';
const CINEMATIC_DUEL_CHARACTER_ATTR = 'data-battle-cinematic-character';
const SHIELD_SLOTS = Object.freeze(['L', 'C', 'R']);
const BATTLE_FIELD_IDS = Object.freeze(['FIELD-01', 'FIELD-02', 'FIELD-03', 'FIELD-04', 'FIELD-05', 'FIELD-08', 'FIELD-09']);
const PLAYER_ROLE_LABELS = Object.freeze({
  source: '攻撃',
  target: '対象'
});
const CURRENT_ACTION_PHASE_LABELS = Object.freeze({
  plan: '選択',
  partner_cutin: '相棒',
  reveal: '公開',
  attack: '攻撃',
  ability: '能力',
  compare4: '4人比較',
  finisher: '決着',
  settle: '盤面反映'
});
const LOAD_JANKEN_LABELS = Object.freeze({
  rock: 'グー',
  scissors: 'チョキ',
  paper: 'パー',
  'グー': 'グー',
  'チョキ': 'チョキ',
  'パー': 'パー'
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requireDocument(global) {
  const document = global?.document;
  if (!document || typeof document.createElement !== 'function') {
    throw new TypeError('BATTLE_SCREEN_DOCUMENT_REQUIRED');
  }
  return document;
}

function createNode(document, tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function setData(node, key, value) {
  if (!node?.dataset) return;
  if (value == null) delete node.dataset[key];
  else node.dataset[key] = String(value);
}

function addStyle(document) {
  if (document.getElementById?.(STYLE_ID)) return;
  const style = createNode(document, 'style');
  style.id = STYLE_ID;
  style.textContent = `
[${SHELL_ATTR}="1"]{position:relative;isolation:isolate;width:100%;height:100%;min-height:0;overflow:hidden;background:linear-gradient(180deg,#173f42 0%,#286052 42%,#102f2c 100%);color:#f7fbfa;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
[${SHELL_ATTR}="1"].grBattleScreenAdoptedOverlay{position:absolute;inset:0;z-index:3;width:auto;height:auto;min-height:0;overflow:hidden;background:transparent;color:inherit;font-family:inherit;pointer-events:none}
[${SHELL_ATTR}="1"] .grBattleScreenTop{position:absolute;z-index:9;top:0;left:0;right:0;height:clamp(42px,9vh,72px);display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:clamp(6px,1.2vw,14px);padding:clamp(5px,.8vh,8px) clamp(8px,1.6vw,18px);pointer-events:none;background:linear-gradient(180deg,rgba(4,10,11,.76),rgba(4,10,11,.18) 72%,rgba(4,10,11,0));text-shadow:0 2px 10px rgba(0,0,0,.75)}
[${SHELL_ATTR}="1"] .grBattleHudLeft,[${SHELL_ATTR}="1"] .grBattleHudRight{display:flex;align-items:center;gap:clamp(5px,.8vw,9px);min-width:0}
[${SHELL_ATTR}="1"] .grBattleHudRight{justify-content:flex-end}
[${SHELL_ATTR}="1"] .grBattleHudSettings{pointer-events:auto;width:clamp(32px,4.3vw,42px);height:clamp(32px,4.3vw,42px);border-radius:50%;border:1px solid rgba(235,247,238,.52);background:rgba(8,28,25,.78);color:inherit;font:inherit;font-weight:900;box-shadow:0 4px 14px rgba(0,0,0,.24)}
[${SHELL_ATTR}="1"] .grBattleHudMetric{display:grid;gap:1px;min-width:clamp(48px,7vw,76px);padding:4px 7px;border-radius:9px;background:rgba(3,20,17,.64);border:1px solid rgba(225,244,215,.18)}
[${SHELL_ATTR}="1"] .grBattleHudMetric small{font-size:clamp(8px,.7vw,10px);font-weight:800;letter-spacing:.11em;opacity:.72;text-transform:uppercase}
[${SHELL_ATTR}="1"] .grBattleHudMetric b{font-size:clamp(13px,1.35vw,17px);line-height:1}
[${SHELL_ATTR}="1"] .grBattleHudCenter{min-width:0;display:flex;justify-content:center;align-items:flex-start;gap:clamp(6px,.8vw,10px)}
[${SHELL_ATTR}="1"] .grBattleHudChain{min-width:0;display:flex;align-items:center;justify-content:center;gap:3px;padding-top:1px;overflow:hidden}
[${SHELL_ATTR}="1"] .grBattleHudPlayedCard{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:clamp(28px,4.2vw,42px);height:clamp(36px,5.6vw,54px);padding:2px;border-radius:6px;border:1px solid rgba(235,247,226,.38);background:rgba(9,35,30,.82);font-size:clamp(8px,.8vw,11px);font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[${SHELL_ATTR}="1"] .grBattleHudPlayedCardArt{display:block;width:100%;height:100%;object-fit:cover;border-radius:4px}
[${SHELL_ATTR}="1"] .grBattleHudPlayedCard:nth-of-type(4n+1){transform:translateY(4px) rotate(-4deg)}
[${SHELL_ATTR}="1"] .grBattleHudPlayedCard:nth-of-type(4n+3){transform:translateY(4px) rotate(4deg)}
[${SHELL_ATTR}="1"] .grBattleHudChainArrow{flex:0 0 auto;font-weight:900;opacity:.78}
[${SHELL_ATTR}="1"] .grBattleHudLoad{flex:0 0 auto;display:grid;place-items:center;align-content:center;width:clamp(50px,6.8vw,70px);height:clamp(40px,6vw,62px);border-radius:8px;border:1px solid rgba(255,233,158,.66);background:linear-gradient(180deg,rgba(108,88,38,.86),rgba(35,42,26,.80));box-shadow:0 5px 16px rgba(0,0,0,.22)}
[${SHELL_ATTR}="1"] .grBattleHudLoad small{font-size:clamp(8px,.72vw,10px);font-weight:900;letter-spacing:.12em;opacity:.72}
[${SHELL_ATTR}="1"] .grBattleHudLoad b{font-size:clamp(14px,1.6vw,20px);line-height:1.1}
[${CURRENT_ACTION_ATTR}]{position:absolute;z-index:8;top:clamp(206px,34vh,264px);left:50%;transform:translateX(-50%);max-width:min(42vw,420px);padding:5px 10px;border:1px solid rgba(245,248,225,.48);border-radius:999px;background:rgba(4,28,24,.80);box-shadow:0 6px 18px rgba(0,0,0,.24);pointer-events:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f8fbeb;text-shadow:0 2px 8px rgba(0,0,0,.72);font-size:clamp(11px,1vw,14px);font-weight:900;letter-spacing:.05em}
[${CURRENT_ACTION_ATTR}][data-phase="settle"]{max-width:min(76vw,620px)}
[${CAUSAL_TRACE_ATTR}]{position:absolute;z-index:8;top:clamp(144px,24vh,190px);left:50%;transform:translateX(-50%);width:min(76vw,720px);display:flex;align-items:stretch;justify-content:center;gap:4px;pointer-events:none;color:#f8fbeb;text-shadow:0 2px 8px rgba(0,0,0,.72)}
[${CAUSAL_TRACE_ATTR}][hidden]{display:none!important}
[${CAUSAL_TRACE_ATTR}] .grBattleCausalTraceStage{position:relative;min-width:0;flex:1 1 0;padding:5px 7px;border:1px solid rgba(245,248,225,.38);border-radius:8px;background:rgba(4,28,24,.76);box-shadow:0 5px 14px rgba(0,0,0,.2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;font-size:clamp(9px,.84vw,12px);font-weight:900;letter-spacing:.03em;opacity:.9}
[${CAUSAL_TRACE_ATTR}] .grBattleCausalTraceStage:not(:last-child)::after{content:"›";position:absolute;right:-6px;top:50%;transform:translateY(-52%);z-index:2;color:#ffe181;font-size:15px;text-shadow:0 1px 6px rgba(0,0,0,.8)}
[${CAUSAL_TRACE_ATTR}] .grBattleCausalTraceStage[data-kind="processing"]{border-color:rgba(161,219,255,.48);background:rgba(12,43,58,.8)}
[${CAUSAL_TRACE_ATTR}] .grBattleCausalTraceStage[data-kind="accepted_resolution"]{border-color:rgba(255,226,129,.54);background:rgba(70,57,18,.82)}
[${CAUSAL_TRACE_ATTR}] .grBattleCausalTraceStage[data-kind="destination"]{border-color:rgba(255,190,135,.64);background:rgba(78,38,18,.84)}
[${CAUSAL_TRACE_ATTR}][data-motion="causal_return"] .grBattleCausalTraceStage{animation:grBattleCausalTraceStage 1.35s cubic-bezier(.2,.72,.24,1) both}
[${CAUSAL_TRACE_ATTR}][data-motion="static_causal_trace"] .grBattleCausalTraceStage{animation:none!important;opacity:1!important;transform:none!important}
@keyframes grBattleCausalTraceStage{0%{opacity:.18;transform:translateY(8px) scale(.97)}45%{opacity:1;transform:translateY(0) scale(1.02)}100%{opacity:.9;transform:translateY(0) scale(1)}}
[${SHELL_ATTR}="1"] [${PLAN_SLOT_ATTR}]{position:absolute;inset:0;z-index:2;min-width:0;min-height:0}
[${SHELL_ATTR}="1"] #battlePhaseSurface{position:static!important;inset:auto!important;z-index:auto!important;overflow:visible!important;background:none!important;pointer-events:none!important;display:contents}
[${SHELL_ATTR}="1"] #battlePhaseSurface[hidden]{display:none!important}
[${SHELL_ATTR}="1"] #battlePhaseSurface::before,[${SHELL_ATTR}="1"] #battlePhaseSurface::after{content:none!important;display:none!important}
[${SHELL_ATTR}="1"] [${PROGRESS_GUIDE_ATTR}]{position:absolute;z-index:6;left:clamp(12px,3vw,34px);top:clamp(86px,28vh,150px);width:min(33vw,300px);display:flex;align-items:center;gap:clamp(6px,1vw,10px);pointer-events:none;opacity:.86;color:#f2f7e6;text-shadow:0 2px 8px rgba(0,0,0,.72);font-size:clamp(10px,.95vw,13px);font-weight:900;letter-spacing:.13em}
[${SHELL_ATTR}="1"] [${PROGRESS_GUIDE_ATTR}] .grBattleProgressEndpoint{flex:0 0 auto;padding:4px 7px;border:1px solid rgba(235,248,217,.28);border-radius:999px;background:rgba(5,28,23,.62);box-shadow:0 5px 14px rgba(0,0,0,.18)}
[${SHELL_ATTR}="1"] [${PROGRESS_GUIDE_ATTR}] .grBattleProgressGoal{border-color:rgba(255,226,129,.58);background:rgba(73,62,22,.72)}
[${SHELL_ATTR}="1"] [${PROGRESS_GUIDE_ATTR}] .grBattleProgressArrow{position:relative;flex:1 1 auto;min-width:36px;height:2px;border-radius:999px;background:linear-gradient(90deg,rgba(255,226,129,.88),rgba(219,241,207,.36));box-shadow:0 0 10px rgba(255,226,129,.18)}
[${SHELL_ATTR}="1"] [${PROGRESS_GUIDE_ATTR}] .grBattleProgressArrow::before{content:"◀";position:absolute;left:-2px;top:50%;transform:translate(-35%,-53%);font-size:14px;color:#ffe181;text-shadow:0 1px 8px rgba(0,0,0,.72)}
[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}]{position:absolute;z-index:1;left:2%;bottom:5%;width:min(28vw,250px);height:min(34vh,220px);pointer-events:none;opacity:.22;overflow:visible;filter:drop-shadow(0 10px 18px rgba(0,0,0,.22))}
[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}]::before,[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}]::after{content:"";position:absolute;display:block;box-sizing:border-box}
[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}="FIELD-01"]::before{left:5%;bottom:0;width:76%;height:64%;background:rgba(35,67,48,.82);clip-path:polygon(0 100%,8% 46%,28% 38%,39% 16%,58% 27%,69% 5%,100% 22%,100% 100%)}
[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}="FIELD-01"]::after{left:53%;top:4%;width:13%;height:82%;border-radius:45% 45% 18% 18%;background:linear-gradient(180deg,rgba(225,244,239,.84),rgba(124,193,187,.64) 50%,rgba(225,244,239,.22));transform:skewX(-5deg)}
[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}="FIELD-02"]::before{left:35%;top:27%;width:31%;aspect-ratio:1;border-radius:50%;background:rgba(220,190,202,.72);box-shadow:-34px 0 0 rgba(220,190,202,.52),34px 0 0 rgba(220,190,202,.52),0 -31px 0 rgba(220,190,202,.52),0 31px 0 rgba(220,190,202,.52)}
[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}="FIELD-02"]::after{left:49%;top:54%;width:5%;height:43%;border-radius:999px;background:rgba(70,108,66,.78);transform:rotate(7deg);transform-origin:50% 0}
[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}="FIELD-03"]::before{left:14%;bottom:2%;width:70%;height:90%;background:rgba(185,218,226,.74);clip-path:polygon(9% 100%,28% 42%,41% 69%,54% 0,68% 61%,82% 31%,100% 100%)}
[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}="FIELD-03"]::after{left:34%;bottom:2%;width:28%;height:67%;border:2px solid rgba(235,249,249,.68);clip-path:polygon(50% 0,100% 100%,0 100%);transform:rotate(-8deg)}
[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}="FIELD-04"]::before{left:41%;top:28%;width:24%;height:29%;border-radius:45% 45% 36% 36%;border:2px solid rgba(239,190,101,.76);background:radial-gradient(circle,rgba(255,205,98,.74),rgba(181,109,50,.28) 66%,transparent 70%);box-shadow:0 0 25px rgba(255,176,64,.28)}
[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}="FIELD-04"]::after{left:52%;top:0;width:2px;height:31%;background:rgba(112,91,62,.78);box-shadow:0 62px 0 rgba(112,91,62,.45)}
[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}="FIELD-05"]::before{left:8%;bottom:25%;width:84%;height:14%;border-radius:5px;background:repeating-linear-gradient(90deg,rgba(104,79,54,.82) 0 11px,rgba(180,151,105,.55) 11px 14px);transform:rotate(-4deg)}
[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}="FIELD-05"]::after{left:7%;top:24%;width:86%;height:44%;border-top:4px solid rgba(141,112,74,.72);border-radius:50% 50% 0 0;transform:rotate(-4deg)}
[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}="FIELD-08"]::before{left:8%;bottom:30%;width:84%;height:15%;border-radius:999px;background:rgba(107,83,58,.78);transform:rotate(13deg);box-shadow:0 18px 0 rgba(81,68,54,.58)}
[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}="FIELD-08"]::after{left:16%;bottom:31%;width:72%;height:12%;border-radius:999px;background:rgba(139,111,74,.64);transform:rotate(-12deg)}
[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}="FIELD-09"]::before{left:2%;bottom:0;width:96%;height:66%;background:rgba(225,235,232,.72);clip-path:polygon(0 100%,0 62%,17% 48%,31% 59%,49% 27%,62% 48%,77% 21%,100% 51%,100% 100%)}
[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}="FIELD-09"]::after{left:48%;top:28%;width:28%;height:57%;border-left:4px solid rgba(96,111,100,.68);border-bottom:4px solid rgba(96,111,100,.58);transform:skewX(-24deg) rotate(-8deg);transform-origin:0 100%;box-shadow:-18px 9px 0 -15px rgba(96,111,100,.65)}

#battlePhaseSurface[data-battle-phase-presentation="FULLSCREEN_ANIMATION"]{position:absolute!important;inset:0!important;z-index:40!important;overflow:hidden!important;background:radial-gradient(circle at 50% 44%,rgba(26,40,58,.96),rgba(5,8,14,.985) 58%,#020305 100%)!important;pointer-events:auto!important}
#battlePhaseSurface[data-battle-phase-presentation="FULLSCREEN_ANIMATION"]>[${SHELL_ATTR}="1"]{position:absolute!important;inset:0!important;width:auto!important;height:auto!important;background:radial-gradient(circle at 50% 48%,rgba(36,55,76,.78),rgba(4,8,13,.86) 62%,rgba(0,0,0,.97) 100%)!important;perspective:1200px}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleScreenTop,
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] [${PROGRESS_GUIDE_ATTR}],
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] [${FIELD_LANDMARK_ATTR}],
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] [${CAUSAL_TRACE_ATTR}]{display:none!important}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] [${GRID_ATTR}]{position:absolute!important;inset:8% 4% 8%!important;height:auto!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:clamp(10px,2.4vw,38px)!important;overflow:visible!important;perspective:1100px;pointer-events:none}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] [${LANE_ATTR}]{flex:0 1 clamp(118px,18vw,250px)!important;width:clamp(118px,18vw,250px)!important;height:74%!important;min-height:0!important;display:grid!important;place-items:center!important;overflow:visible!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;transform-origin:50% 60%;opacity:.72;transition:transform 240ms cubic-bezier(.2,.8,.2,1),opacity 180ms ease,filter 180ms ease}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleLaneIdentity{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:max-content;max-width:90%;text-align:center;opacity:.8}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleLaneIdentity small,
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleLaneViewerRole,
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] [${SHIELD_RAIL_ATTR}],
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleLaneRole,
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleLaneAfterstate{display:none!important}

[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleLanePublicCard{position:relative!important;inset:auto!important;right:auto!important;top:auto!important;width:clamp(98px,14vw,198px)!important;height:clamp(138px,20vw,278px)!important;border-radius:12px!important;box-shadow:0 24px 54px rgba(0,0,0,.48),0 0 0 1px rgba(255,255,255,.12)!important;transform-style:preserve-3d;overflow:hidden;background:linear-gradient(155deg,rgba(244,244,238,.16),rgba(15,20,27,.92) 36%,rgba(5,7,11,.98))}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleLanePublicCardFallback{position:absolute;inset:0;display:block;color:transparent!important;font-size:0!important;background:radial-gradient(circle at 34% 24%,rgba(255,255,255,.14),transparent 30%),linear-gradient(145deg,rgba(93,112,130,.58),rgba(18,24,31,.96) 52%,rgba(5,8,12,.98))}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleLanePublicCardNumber{position:absolute;left:7%;top:5%;z-index:2;font-size:clamp(22px,3.4vw,48px);font-weight:1000;line-height:1;text-shadow:0 4px 16px rgba(0,0,0,.82)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleLanePublicCardHand{position:absolute;right:6%;bottom:5%;z-index:2;font-size:clamp(13px,1.6vw,21px);font-weight:1000;text-shadow:0 3px 12px rgba(0,0,0,.82)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] [${CINEMATIC_ORDER_ATTR}]{position:absolute;z-index:14;top:clamp(8px,2.7vh,22px);left:50%;transform:translateX(-50%);width:min(66vw,720px);height:clamp(54px,11vh,96px);display:flex;align-items:flex-start;justify-content:center;gap:clamp(4px,.9vw,10px);pointer-events:none;perspective:900px}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] [${CINEMATIC_ORDER_ATTR}][hidden]{display:none!important}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicOrderCard{position:relative;flex:0 0 auto;width:clamp(38px,5.3vw,68px);height:clamp(52px,7.4vw,92px);border-radius:8px;border:1px solid rgba(245,247,240,.34);overflow:hidden;background:linear-gradient(155deg,rgba(238,242,244,.14),rgba(18,24,31,.94) 40%,rgba(4,7,10,.99));box-shadow:0 10px 24px rgba(0,0,0,.42);transform-style:preserve-3d;transition:opacity 180ms ease,filter 180ms ease,box-shadow 180ms ease}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicOrderCardArt{display:block;width:100%;height:100%;object-fit:cover}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicOrderCardFallback{position:absolute;inset:0;background:radial-gradient(circle at 34% 24%,rgba(255,255,255,.13),transparent 28%),linear-gradient(145deg,rgba(94,113,132,.58),rgba(16,22,30,.98) 58%,rgba(4,7,10,.99))}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicOrderCardNumber{position:absolute;left:7%;top:6%;z-index:2;font-size:clamp(15px,2vw,25px);font-weight:1000;line-height:1;text-shadow:0 3px 10px rgba(0,0,0,.84)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicOrderCardHand{position:absolute;right:6%;bottom:6%;z-index:2;font-size:clamp(9px,1.05vw,13px);font-weight:1000;text-shadow:0 2px 8px rgba(0,0,0,.84)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicOrderCard[data-final-state="invalidated"]{opacity:.28;filter:grayscale(.9) brightness(.58)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicOrderCard[data-final-state="unresolved-final"]{opacity:.74;filter:saturate(.72)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicOrderCard[data-final-state="resolved-win"]{opacity:1;filter:brightness(1.16);box-shadow:0 10px 28px rgba(0,0,0,.44),0 0 0 2px rgba(255,233,152,.56),0 0 26px rgba(255,225,115,.34)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] [${CINEMATIC_DUEL_ATTR}]{position:absolute;z-index:13;inset:14% 5% 8%;display:grid;grid-template-columns:minmax(0,1fr) minmax(110px,18vw,220px) minmax(0,1fr);align-items:end;pointer-events:none;overflow:visible}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] [${CINEMATIC_DUEL_ATTR}][hidden]{display:none!important}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelSide{position:relative;display:grid;justify-items:center;align-content:end;gap:7px;min-width:0;height:78%;filter:drop-shadow(0 18px 22px rgba(0,0,0,.42))}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelSide[data-role="source"]{grid-column:1;justify-self:start;width:min(34vw,330px)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelSide[data-role="target"]{grid-column:3;justify-self:end;width:min(34vw,330px)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelSide[data-movement-intent="ENTER_STAGE"]{animation:grBattleCinematicDuelEnter 260ms cubic-bezier(.18,.78,.2,1) both}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-motion="static_only"] .grBattleCinematicDuelSide[data-movement-intent="ENTER_STAGE"]{animation:none!important}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelFigure{position:relative;width:clamp(84px,14vw,168px);height:clamp(150px,34vh,310px);transform-origin:50% 100%;opacity:.96}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelFigure::before{content:"";position:absolute;left:50%;top:3%;width:42%;aspect-ratio:1;transform:translateX(-50%);border-radius:50%;background:radial-gradient(circle at 40% 32%,rgba(255,255,255,.24),transparent 24%),linear-gradient(150deg,rgba(171,221,232,.95),rgba(37,76,91,.96) 58%,rgba(9,18,27,.98));box-shadow:0 0 0 2px rgba(238,250,255,.18),0 0 34px rgba(126,211,237,.2)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelFigure::after{content:"";position:absolute;left:50%;bottom:0;width:78%;height:72%;transform:translateX(-50%);border-radius:44% 44% 20% 20% / 28% 28% 12% 12%;background:linear-gradient(145deg,rgba(104,179,196,.96),rgba(31,72,87,.98) 46%,rgba(7,17,26,.99));clip-path:polygon(25% 0,75% 0,100% 36%,82% 48%,76% 100%,24% 100%,18% 48%,0 36%);box-shadow:inset 0 0 0 2px rgba(229,249,255,.12)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelSide[data-role="target"] .grBattleCinematicDuelFigure[data-visual-kind="css-proxy"]{filter:hue-rotate(154deg) saturate(.76) brightness(.93)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelFigure[data-visual-kind="character-runtime"]::before,
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelFigure[data-visual-kind="character-runtime"]::after{display:none!important}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelCharacterHost{position:absolute;inset:0;display:grid;place-items:end center;overflow:visible}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelCharacterHost[hidden]{display:none!important}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelCharacterHost>*{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelCharacterHost .grtc-image{display:block!important;width:100%!important;height:100%!important;object-fit:contain!important;object-position:50% 100%!important}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelFx{position:relative;grid-column:2;align-self:center;justify-self:stretch;height:clamp(72px,18vh,150px);pointer-events:none;overflow:visible}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelFx::before{content:"";position:absolute;left:-18%;top:50%;width:clamp(24px,4.8vw,66px);aspect-ratio:1.7;border:2px solid rgba(226,248,255,.72);border-radius:50%;background:radial-gradient(ellipse at 35% 48%,rgba(255,255,255,.82),rgba(173,226,239,.28) 42%,transparent 70%);box-shadow:0 0 18px rgba(185,236,249,.52),inset -8px 0 14px rgba(45,129,158,.32);transform:translateY(-50%) scaleX(.72);opacity:0;animation:grBattleCinematicCompressedShot 620ms cubic-bezier(.18,.78,.2,1) both}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelFx::after{content:"";position:absolute;right:-9%;top:50%;width:clamp(22px,4vw,54px);height:2px;background:linear-gradient(90deg,transparent,rgba(239,252,255,.96),transparent);box-shadow:0 -10px 0 -1px rgba(217,246,255,.56),0 10px 0 -1px rgba(217,246,255,.48);opacity:0;transform:translateY(-50%) rotate(-8deg);animation:grBattleCinematicImpactLine 620ms ease-out both}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-motion="static_only"] .grBattleCinematicDuelFx::before,
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-motion="static_only"] .grBattleCinematicDuelFx::after{animation:none!important;opacity:.38!important}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelMeta{min-width:0;max-width:100%;padding:5px 10px;border:1px solid rgba(241,247,239,.28);border-radius:999px;background:rgba(3,10,15,.72);text-align:center;text-shadow:0 2px 8px rgba(0,0,0,.8)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelMeta small{display:block;font-size:clamp(9px,.85vw,12px);font-weight:900;letter-spacing:.12em;opacity:.7}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"] .grBattleCinematicDuelMeta b{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(12px,1.2vw,17px)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="attack"] .grBattleCinematicDuelSide[data-role="source"] .grBattleCinematicDuelFigure,
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="ability"] .grBattleCinematicDuelSide[data-role="source"] .grBattleCinematicDuelFigure{animation:grBattleCinematicDuelStrike 620ms cubic-bezier(.18,.78,.2,1) both}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="attack"] .grBattleCinematicDuelSide[data-role="target"] .grBattleCinematicDuelFigure,
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="ability"] .grBattleCinematicDuelSide[data-role="target"] .grBattleCinematicDuelFigure{animation:grBattleCinematicDuelHit 620ms cubic-bezier(.2,.74,.22,1) both}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-motion="static_only"] .grBattleCinematicDuelFigure{animation:none!important;transform:none!important}
@keyframes grBattleCinematicDuelEnter{0%{opacity:.2;transform:translateY(4%) scale(.96)}100%{opacity:1;transform:translateY(0) scale(1)}}
@keyframes grBattleCinematicDuelStrike{0%{transform:translateX(-10vw) scale(.92);opacity:.25}34%{transform:translateX(0) scale(1);opacity:1}58%{transform:translateX(14vw) rotate(3deg) scale(1.08);opacity:1}100%{transform:translateX(0) rotate(0) scale(1);opacity:.96}}
@keyframes grBattleCinematicDuelHit{0%,48%{transform:translateX(8vw) scale(.96);opacity:.35}62%{transform:translateX(-2.4vw) rotate(-4deg) scale(.98);opacity:1;filter:brightness(1.35)}100%{transform:translateX(0) rotate(0) scale(1);opacity:.96;filter:none}}
@keyframes grBattleCinematicCompressedShot{0%,24%{left:-18%;opacity:0;transform:translateY(-50%) scale(.45,.72)}34%{opacity:.92}68%{left:92%;opacity:1;transform:translateY(-50%) scale(1.08,.72)}78%,100%{left:108%;opacity:0;transform:translateY(-50%) scale(.62,.46)}}
@keyframes grBattleCinematicImpactLine{0%,60%{opacity:0;transform:translateY(-50%) scaleX(.25) rotate(-8deg)}69%{opacity:1;transform:translateY(-50%) scaleX(1.35) rotate(-8deg)}82%,100%{opacity:0;transform:translateY(-50%) scaleX(.55) rotate(-8deg)}}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="reveal"] [${LANE_ATTR}]{animation:grBattleCinematicReveal 520ms cubic-bezier(.16,.78,.24,1) both}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="reveal"] [${LANE_ATTR}]:nth-child(2){animation-delay:60ms}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="reveal"] [${LANE_ATTR}]:nth-child(3){animation-delay:120ms}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="reveal"] [${LANE_ATTR}]:nth-child(4){animation-delay:180ms}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="attack"] [${LANE_ATTR}][data-role="source"],
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="ability"] [${LANE_ATTR}][data-role="source"]{transform:translate3d(0,-2%,170px) scale(1.22);opacity:1;filter:brightness(1.14);z-index:4}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="attack"] [${LANE_ATTR}][data-role="source"] .grBattleLanePublicCard,
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="ability"] [${LANE_ATTR}][data-role="source"] .grBattleLanePublicCard{animation:grBattleCinematicStrike 460ms cubic-bezier(.18,.78,.24,1) both}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="attack"] [${LANE_ATTR}][data-role="target"],
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="ability"] [${LANE_ATTR}][data-role="target"]{transform:translate3d(0,3%,18px) scale(.96);opacity:.9;filter:brightness(.88)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="compare4"] [${LANE_ATTR}]{opacity:.97;transform:translateZ(54px)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="compare4"] .grBattleLanePublicCard{animation:grBattleCinematicCompare 720ms cubic-bezier(.2,.72,.24,1) both}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="finisher"] [${LANE_ATTR}]:not([data-role="winner"]){transform:translate3d(0,7%,-130px) scale(.78);opacity:.16;filter:grayscale(.72) brightness(.5)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="finisher"] [${LANE_ATTR}][data-role="winner"]{transform:translate3d(0,-4%,220px) scale(1.38);opacity:1;filter:brightness(1.24);z-index:5}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="finisher"] [${LANE_ATTR}][data-role="winner"] .grBattleLanePublicCard{animation:grBattleCinematicWinner 760ms cubic-bezier(.16,.8,.2,1) both}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="settle"] [${LANE_ATTR}]{animation:grBattleCinematicSettle 420ms ease both}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="settle"] [${LANE_ATTR}][data-final-state="resolved-win"]{animation:none!important;transform:translate3d(0,-2%,150px) scale(1.18);opacity:1;filter:brightness(1.16)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="settle"] [${LANE_ATTR}][data-final-state="invalidated"]{animation:none!important;transform:translate3d(0,7%,-120px) scale(.78);opacity:.18;filter:grayscale(.86) brightness(.56)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-phase="settle"] [${LANE_ATTR}][data-final-state="unresolved-final"]{animation:none!important;transform:translateZ(-24px) scale(.94);opacity:.64;filter:saturate(.72)}
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-motion="static_only"] [${LANE_ATTR}],
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-motion="static_only"] .grBattleLanePublicCard,
[${SHELL_ATTR}="1"][data-presentation-mode="cinematic"][data-motion="static_only"] .grBattleCinematicOrderCard{animation:none!important;transition:none!important}
@keyframes grBattleCinematicReveal{0%{opacity:0;transform:translateY(28px) translateZ(-180px) scale(.72)}65%{opacity:1;transform:translateY(-4px) translateZ(42px) scale(1.04)}100%{opacity:.92;transform:none}}
@keyframes grBattleCinematicStrike{0%{transform:translateY(8px) rotate(-1deg) scale(.97)}42%{transform:translateY(-10px) rotate(1.5deg) scale(1.07)}58%{transform:translateY(-10px) rotate(1.5deg) scale(1.07)}100%{transform:translateY(0) rotate(0) scale(1)}}
@keyframes grBattleCinematicCompare{0%{transform:translateY(14px) scale(.94);filter:brightness(.82)}58%{transform:translateY(-2px) scale(1.04);filter:brightness(1.12)}100%{transform:translateY(0) scale(1);filter:brightness(1)}}
@keyframes grBattleCinematicWinner{0%{transform:translateY(16px) scale(.86)}52%{transform:translateY(-10px) scale(1.09)}100%{transform:translateY(0) scale(1)}}
@keyframes grBattleCinematicSettle{0%{opacity:1;transform:translateZ(40px)}100%{opacity:.38;transform:translateY(-10px) translateZ(-120px) scale(.86)}}

@media(max-width:540px) and (orientation:portrait){[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}]{left:2px;top:82px;bottom:auto;width:72px;height:90px;opacity:.13}}
@media(max-height:420px) and (orientation:landscape){[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}]{left:4px;bottom:4px;width:120px;height:76px;opacity:.16}}
[${SHELL_ATTR}="1"] [${GRID_ATTR}]{position:absolute;z-index:4;top:clamp(96px,16vh,122px);right:clamp(8px,1.5vw,18px);bottom:auto;left:40%;height:clamp(86px,15vh,116px);display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:minmax(0,1fr);gap:clamp(4px,.7vw,8px);align-items:stretch;overflow:visible;pointer-events:none}
[${SHELL_ATTR}="1"] [${GRID_ATTR}]::before{content:"";display:none;position:absolute;z-index:-1;left:50%;top:50%;width:clamp(56px,8vw,104px);aspect-ratio:1;transform:translate(-50%,-50%) rotate(45deg);clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);background:radial-gradient(circle at 34% 30%,rgba(249,255,229,.82),rgba(171,211,127,.72) 19%,rgba(67,126,85,.76) 53%,rgba(16,60,50,.94) 76%);border:1px solid rgba(237,255,217,.52);box-shadow:0 0 0 8px rgba(20,68,52,.18),0 15px 36px rgba(0,0,0,.28)}
[${SHELL_ATTR}="1"] [${LANE_ATTR}]{position:relative;min-width:0;overflow:hidden;display:grid;grid-template-rows:auto 1fr auto;gap:4px;padding:clamp(5px,.7vw,8px);border:1px solid rgba(219,241,207,.18);border-radius:clamp(8px,1vw,11px);background:linear-gradient(180deg,rgba(19,56,49,.62),rgba(6,25,24,.46));box-shadow:0 5px 12px rgba(2,20,17,.16),inset 0 0 0 1px rgba(255,255,255,.02);transition:transform 180ms ease,opacity 180ms ease,border-color 180ms ease,background 180ms ease}
[${SHELL_ATTR}="1"] [${LANE_ATTR}]:nth-child(1){left:-10%;top:9%}
[${SHELL_ATTR}="1"] [${LANE_ATTR}]:nth-child(2){left:5%;top:-5%}
[${SHELL_ATTR}="1"] [${LANE_ATTR}]:nth-child(3){left:5%;top:5%}
[${SHELL_ATTR}="1"] [${LANE_ATTR}]:nth-child(4){left:-10%;top:-9%}
[${SHELL_ATTR}="1"] [${GRID_ATTR}] > [${LANE_ATTR}]{left:0!important;top:0!important}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-role="source"]{transform:translateY(-1.4%);border-color:rgba(165,230,213,.58);background:linear-gradient(180deg,rgba(35,90,72,.82),rgba(6,31,26,.62))}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-role="target"]{border-color:rgba(246,198,145,.58);background:linear-gradient(180deg,rgba(105,67,38,.74),rgba(31,32,20,.62))}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-role="winner"]{transform:translateY(-2.2%);border-color:rgba(255,232,145,.72);background:linear-gradient(180deg,rgba(111,91,35,.78),rgba(27,38,23,.58));box-shadow:0 0 28px rgba(237,202,102,.18),0 10px 22px rgba(2,20,17,.20),inset 0 0 0 1px rgba(255,245,196,.10)}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-viewer-role="self"]{border-color:transparent;background:linear-gradient(180deg,rgba(15,46,41,.28),rgba(5,25,23,.12));box-shadow:none}
[${SHELL_ATTR}="1"] .grBattleLaneViewerRole{display:none;align-items:center;width:max-content;margin-bottom:2px;padding:1px 5px;border-radius:999px;border:1px solid rgba(244,246,224,.32);background:rgba(4,24,22,.58);font-size:9px;font-weight:900;letter-spacing:.08em;line-height:1.35}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-viewer-role="self"] .grBattleLaneViewerRole{display:inline-flex}
[${SHELL_ATTR}="1"] .grBattleLaneIdentity{min-width:0}.grBattleLaneIdentity b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(13px,1.25vw,16px);letter-spacing:.04em}.grBattleLaneIdentity small{display:block;margin-top:2px;opacity:.72;font-size:clamp(11px,.9vw,13px)}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-public-card-visible="true"] .grBattleLaneIdentity{padding-right:clamp(30px,4.8vw,46px)}
[${SHELL_ATTR}="1"] .grBattleLanePublicCard{position:absolute;z-index:3;right:5px;top:5px;width:clamp(28px,4.1vw,42px);height:clamp(38px,5.6vw,56px);display:block;overflow:hidden;border-radius:6px;border:1px solid rgba(255,236,167,.72);background:linear-gradient(160deg,rgba(242,246,220,.96),rgba(70,103,88,.94) 48%,rgba(13,42,37,.98));box-shadow:0 5px 12px rgba(0,0,0,.30),0 0 0 1px rgba(255,255,255,.08);pointer-events:none}
[${SHELL_ATTR}="1"] .grBattleLanePublicCard[hidden]{display:none!important}
[${SHELL_ATTR}="1"] .grBattleLanePublicCardArt{display:block;width:100%;height:100%;object-fit:cover}
[${SHELL_ATTR}="1"] .grBattleLanePublicCardFallback{position:absolute;inset:0;display:grid;place-items:center;padding:2px;text-align:center;font-size:clamp(7px,.65vw,9px);font-weight:900;line-height:1.05;overflow:hidden}
[${SHELL_ATTR}="1"] .grBattleLanePublicCardNumber,[${SHELL_ATTR}="1"] .grBattleLanePublicCardHand{position:absolute;z-index:2;min-width:13px;padding:1px 2px;border-radius:4px;background:rgba(3,17,16,.88);color:#fff6c9;font-size:clamp(7px,.62vw,9px);font-weight:1000;line-height:1.15;text-align:center}
[${SHELL_ATTR}="1"] .grBattleLanePublicCardNumber{left:2px;top:2px}.grBattleLanePublicCardHand{right:2px;bottom:2px}
[${SHELL_ATTR}="1"] [${SHIELD_RAIL_ATTR}]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;width:min(100%,220px);margin-top:5px;pointer-events:none}
[${SHELL_ATTR}="1"] [${SHIELD_SLOT_ATTR}]{min-width:0;display:grid;grid-template-columns:auto auto minmax(8px,1fr);align-items:center;gap:3px;padding:2px 4px;border:1px solid rgba(255,226,129,.32);border-radius:7px;background:linear-gradient(180deg,rgba(78,68,35,.46),rgba(6,28,24,.42));box-shadow:inset 0 0 0 1px rgba(255,255,255,.025)}
[${SHELL_ATTR}="1"] .grBattleShieldToken{display:grid;place-items:center;width:13px;height:15px;clip-path:polygon(50% 0,92% 15%,82% 72%,50% 100%,18% 72%,8% 15%);background:linear-gradient(180deg,#ffe28a,#9d7c32);color:#17352f;font-size:8px;font-weight:1000;line-height:1;text-shadow:none}
[${SHELL_ATTR}="1"] .grBattleShieldSlot{font-size:9px;font-weight:1000;line-height:1;letter-spacing:.04em;color:#fff4bd}
[${SHELL_ATTR}="1"] .grBattleShieldTrack{display:block;min-width:8px;height:2px;border-radius:999px;background:linear-gradient(90deg,rgba(255,226,129,.80),rgba(219,241,207,.24))}
[${SHELL_ATTR}="1"] [${SHIELD_SLOT_ATTR}][data-board-return-target="true"]{position:relative;border-color:rgba(255,240,174,.96);background:linear-gradient(180deg,rgba(145,105,37,.92),rgba(30,46,26,.84));box-shadow:0 0 0 1px rgba(255,249,204,.42),0 0 18px rgba(255,211,105,.58),inset 0 0 10px rgba(255,238,154,.20);animation:grBattleShieldReturn 520ms ease-out 1}
[${SHELL_ATTR}="1"] [${SHIELD_SLOT_ATTR}][data-board-return-target="true"] .grBattleShieldTrack{height:3px;background:linear-gradient(90deg,rgba(255,248,198,1),rgba(255,211,105,.98));box-shadow:0 0 9px rgba(255,222,123,.86)}
[${SHELL_ATTR}="1"] [${SHIELD_SLOT_ATTR}][data-board-return-target="true"]::after{content:"";position:absolute;inset:-3px;border:1px solid rgba(255,248,198,.54);border-radius:9px;pointer-events:none}
@keyframes grBattleShieldReturn{0%{transform:scale(.94);filter:brightness(1.7)}100%{transform:scale(1);filter:brightness(1)}}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-role="target"] [${SHIELD_RAIL_ATTR}]{filter:drop-shadow(0 0 6px rgba(255,205,139,.22))}
[${SHELL_ATTR}="1"] .grBattleLaneRole{align-self:center;justify-self:center;padding:5px 7px;border-radius:999px;border:1px solid rgba(230,248,218,.24);background:rgba(3,20,17,.54);font-size:clamp(11px,.9vw,13px);font-weight:800;letter-spacing:.08em;text-transform:uppercase}
[${SHELL_ATTR}="1"] .grBattleLaneAfterstate{align-self:end;display:grid;gap:4px;min-height:20px;font-size:clamp(11px,.92vw,13px);line-height:1.35;color:#e8f1df}
[${SHELL_ATTR}="1"] .grBattleLaneAfterstate span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 5px;border-radius:6px;background:rgba(2,19,16,.60);border:1px solid rgba(225,244,215,.12)}
[${SHELL_ATTR}="1"] #battleResolution{position:absolute;z-index:7;left:50%;bottom:clamp(8px,2vh,18px);transform:translateX(-50%);max-width:min(72vw,760px);min-height:24px;pointer-events:none;text-align:center}
[${SHELL_ATTR}="1"][data-motion="static_only"] [${LANE_ATTR}]{transition:none!important;transform:none!important}
[${SHELL_ATTR}="1"][data-motion="static_only"] [${SHIELD_SLOT_ATTR}][data-board-return-target="true"]{animation:none!important;transform:none!important}
@media(max-width:720px){[${SHELL_ATTR}="1"] [${GRID_ATTR}]{left:38%;right:3%}}
@media(max-width:540px){[${SHELL_ATTR}="1"] [${GRID_ATTR}]{left:4px;right:4px;gap:3px;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:minmax(0,1fr)}[${SHELL_ATTR}="1"] [${LANE_ATTR}]{left:0!important;top:0!important;padding:7px 6px;border-radius:8px}.grBattleLaneRole{max-width:100%;overflow:hidden;text-overflow:ellipsis}[${SHELL_ATTR}="1"] [${SHIELD_RAIL_ATTR}]{gap:2px;margin-top:3px}[${SHELL_ATTR}="1"] [${SHIELD_SLOT_ATTR}]{gap:2px;padding:2px 3px}[${SHELL_ATTR}="1"] .grBattleShieldToken{width:11px;height:13px;font-size:7px}[${SHELL_ATTR}="1"] .grBattleShieldSlot{font-size:8px}[${SHELL_ATTR}="1"] .grBattleHudMetric{min-width:42px;padding:3px 5px}[${SHELL_ATTR}="1"] .grBattleHudPlayedCard{width:26px;height:34px}[${SHELL_ATTR}="1"] .grBattleHudLoad{width:44px;height:38px}[${SHELL_ATTR}="1"] [${CURRENT_ACTION_ATTR}]{top:58px;left:8px;right:8px;transform:none;max-width:none;font-size:11px;padding:4px 8px}}
@media(max-width:540px) and (orientation:portrait){[${SHELL_ATTR}="1"] [${GRID_ATTR}]{top:88px;right:8px;bottom:96px;left:8px;height:auto;gap:6px;grid-template-columns:minmax(0,1fr);grid-template-rows:repeat(4,minmax(0,1fr))}[${SHELL_ATTR}="1"] [${GRID_ATTR}]::before{display:none}[${SHELL_ATTR}="1"] [${LANE_ATTR}]{grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto minmax(20px,auto);column-gap:8px;row-gap:3px;padding:8px 10px;transform:none!important}[${SHELL_ATTR}="1"] .grBattleLaneIdentity{grid-column:1;grid-row:1}[${SHELL_ATTR}="1"] .grBattleLaneRole{grid-column:2;grid-row:1 / span 2;align-self:center;justify-self:end}[${SHELL_ATTR}="1"] .grBattleLaneAfterstate{grid-column:1;grid-row:2;align-self:end;min-height:0}[${SHELL_ATTR}="1"] #battleResolution{left:8px;right:8px;bottom:12px;transform:none;max-width:none}[${SHELL_ATTR}="1"] [${PROGRESS_GUIDE_ATTR}]{left:8px;top:22%;bottom:27%;width:auto;height:auto;flex-direction:column;justify-content:space-between;gap:5px;font-size:10px;letter-spacing:.09em}[${SHELL_ATTR}="1"] [${PROGRESS_GUIDE_ATTR}] .grBattleProgressArrow{width:2px;min-width:2px;min-height:42px;flex:1 1 auto;background:linear-gradient(180deg,rgba(255,226,129,.88),rgba(219,241,207,.30))}[${SHELL_ATTR}="1"] [${PROGRESS_GUIDE_ATTR}] .grBattleProgressArrow::before{content:"▲";left:50%;top:-2px;transform:translate(-50%,-45%)}}
@media(max-height:420px){[${SHELL_ATTR}="1"] [${GRID_ATTR}]{top:78px;bottom:auto;height:72px;left:36%;right:4px;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:minmax(0,1fr)}[${SHELL_ATTR}="1"] .grBattleScreenTop{height:46px;padding-top:3px}.grBattleLaneAfterstate{gap:2px}[${SHELL_ATTR}="1"] [${SHIELD_RAIL_ATTR}]{margin-top:2px}[${SHELL_ATTR}="1"] .grBattleHudPlayedCard{height:32px}[${SHELL_ATTR}="1"] .grBattleHudLoad{height:34px}[${SHELL_ATTR}="1"] [${CURRENT_ACTION_ATTR}]{top:158px;left:50%;right:auto;transform:translateX(-50%);max-width:min(46vw,320px);padding:3px 7px;font-size:10px}[${SHELL_ATTR}="1"] [${PROGRESS_GUIDE_ATTR}]{top:82px;left:10px;width:min(30vw,200px);font-size:9px}}
@media(max-height:470px) and (orientation:landscape){.battle .royalUsageStrip{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;width:151px!important;gap:2px!important}}
@media(prefers-reduced-motion:reduce){[${SHELL_ATTR}="1"] [${LANE_ATTR}]{transition:none!important;transform:none!important}[${SHELL_ATTR}="1"] .grBattleHudPlayedCard{transform:none!important}[${SHELL_ATTR}="1"] [${SHIELD_SLOT_ATTR}][data-board-return-target="true"]{animation:none!important;transform:none!important}}
/* BATTLE_PORTRAIT_390X844_R7B: presentation-only exact portrait recomposition */
@media(max-width:430px) and (orientation:portrait){
[${SHELL_ATTR}="1"] .grBattleScreenTop{height:56px!important;padding:4px 6px!important;gap:4px!important}
[${SHELL_ATTR}="1"] [${CURRENT_ACTION_ATTR}]{top:auto!important;bottom:248px!important;left:8px!important;right:8px!important;transform:none!important;max-width:none!important;min-height:44px!important;display:flex!important;align-items:center!important;justify-content:center!important;white-space:normal!important;padding:6px 9px!important}
[${SHELL_ATTR}="1"] [${GRID_ATTR}]{top:56px!important;right:8px!important;bottom:auto!important;left:8px!important;height:52px!important;gap:4px!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;grid-template-rows:minmax(0,1fr)!important}
[${SHELL_ATTR}="1"] [${GRID_ATTR}]::before{display:none!important}
[${SHELL_ATTR}="1"] [${LANE_ATTR}]{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:auto!important;column-gap:0!important;row-gap:1px!important;padding:3px!important;transform:none!important;min-height:0!important}
[${SHELL_ATTR}="1"] .grBattleLaneIdentity{grid-column:1!important;grid-row:1!important}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-public-card-visible="true"] .grBattleLaneIdentity{padding-right:25px!important}
[${SHELL_ATTR}="1"] .grBattleLanePublicCard{right:3px!important;top:3px!important;width:22px!important;height:30px!important;border-radius:4px!important}
[${SHELL_ATTR}="1"] .grBattleLanePublicCardNumber,[${SHELL_ATTR}="1"] .grBattleLanePublicCardHand{font-size:6px!important;min-width:9px!important;padding:0 1px!important}
[${SHELL_ATTR}="1"] .grBattleLaneRole,[${SHELL_ATTR}="1"] .grBattleLaneAfterstate{display:none!important}
[${SHELL_ATTR}="1"] #battleResolution{left:8px!important;right:8px!important;bottom:12px!important;transform:none!important;max-width:none!important}
[${SHELL_ATTR}="1"] [${PROGRESS_GUIDE_ATTR}]{display:none!important}
}
`;
  document.head?.appendChild(style);
}

function ensureAnchor(document, root, explicit, id, tag = 'section') {
  if (explicit) {
    if (explicit.id && explicit.id !== id) throw new TypeError(`BATTLE_SCREEN_ANCHOR_ID_MISMATCH:${id}`);
    if (!explicit.id) explicit.id = id;
    return { node: explicit, created: false };
  }
  const existing = document.getElementById?.(id);
  if (existing) return { node: existing, created: false };
  if (!root || typeof root.appendChild !== 'function') throw new TypeError(`BATTLE_SCREEN_ANCHOR_ROOT_REQUIRED:${id}`);
  const node = createNode(document, tag);
  node.id = id;
  root.appendChild(node);
  return { node, created: true };
}

function createShieldRail(document) {
  const rail = createNode(document, 'div', 'grBattleShieldRail');
  rail.setAttribute?.(SHIELD_RAIL_ATTR, '1');
  rail.setAttribute?.('aria-label', '3つのShieldと対応ROAD');
  rail.dataset.presentationOnly = 'true';
  rail.dataset.authority = 'existing-shield-linked-lane-structure-only';
  for (const slot of SHIELD_SLOTS) {
    const link = createNode(document, 'span', 'grBattleShieldLink');
    link.setAttribute?.(SHIELD_SLOT_ATTR, slot);
    link.setAttribute?.('aria-label', `Shield ${slot} → ROAD ${slot}`);
    link.dataset.roadLane = slot;
    const token = createNode(document, 'span', 'grBattleShieldToken', 'S');
    token.setAttribute?.('aria-hidden', 'true');
    const label = createNode(document, 'span', 'grBattleShieldSlot', slot);
    label.setAttribute?.('aria-hidden', 'true');
    const track = createNode(document, 'span', 'grBattleShieldTrack');
    track.setAttribute?.('aria-hidden', 'true');
    link.appendChild(token);
    link.appendChild(label);
    link.appendChild(track);
    rail.appendChild(link);
  }
  return rail;
}

function createLane(document, participantIndex) {
  const lane = createNode(document, 'article', 'grBattleLane');
  lane.setAttribute?.(LANE_ATTR, String(participantIndex + 1));
  lane.dataset.role = 'idle';
  lane.dataset.viewerRole = 'neutral';
  const identity = createNode(document, 'div', 'grBattleLaneIdentity');
  const viewerRole = createNode(document, 'span', 'grBattleLaneViewerRole', '自分');
  viewerRole.hidden = true;
  viewerRole.setAttribute?.('aria-hidden', 'true');
  const name = createNode(document, 'b');
  const team = createNode(document, 'small');
  const shieldRail = createShieldRail(document);
  identity.appendChild(viewerRole);
  identity.appendChild(name);
  identity.appendChild(team);
  identity.appendChild(shieldRail);
  const role = createNode(document, 'div', 'grBattleLaneRole');
  role.hidden = true;
  const afterstate = createNode(document, 'div', 'grBattleLaneAfterstate');
  const publicCard = createNode(document, 'div', 'grBattleLanePublicCard');
  publicCard.hidden = true;
  publicCard.setAttribute?.('aria-hidden', 'true');
  publicCard.dataset.presentationOnly = 'true';
  publicCard.dataset.authority = 'accepted-public-model-only';
  lane.appendChild(identity);
  lane.appendChild(role);
  lane.appendChild(afterstate);
  lane.appendChild(publicCard);
  return { lane, viewerRole, name, team, shieldRail, role, afterstate, publicCard };
}

function normalizeViewerParticipantId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveViewerParticipantId(model, requestedViewerParticipantId) {
  const requested = normalizeViewerParticipantId(requestedViewerParticipantId);
  if (!requested) return Object.freeze({ requested: null, resolved: null, status: 'not-provided' });
  const resolved = Array.isArray(model?.lanes) && model.lanes.some(lane => lane?.id === requested) ? requested : null;
  return Object.freeze({ requested, resolved, status: resolved ? 'caller-explicit' : 'explicit-id-not-in-model' });
}

function readBattleFieldId(...nodes) {
  for (const start of nodes) {
    let node = start;
    while (node) {
      const candidate = typeof node.dataset?.battleFieldId === 'string' ? node.dataset.battleFieldId.trim() : '';
      if (BATTLE_FIELD_IDS.includes(candidate)) return candidate;
      node = node.parentNode ?? null;
    }
  }
  return '';
}

function createFieldLandmark(document) {
  const landmark = createNode(document, 'div', 'grBattleFieldLandmark');
  landmark.setAttribute?.(FIELD_LANDMARK_ATTR, '');
  landmark.setAttribute?.('aria-hidden', 'true');
  landmark.dataset.presentationOnly = 'true';
  landmark.dataset.authority = 'existing-field-selection-id-only';
  landmark.hidden = true;
  return landmark;
}

function syncFieldLandmark(landmark, ...sources) {
  const fieldId = readBattleFieldId(...sources);
  landmark.hidden = !fieldId;
  landmark.setAttribute?.(FIELD_LANDMARK_ATTR, fieldId);
  setData(landmark, 'fieldId', fieldId || null);
  return fieldId || null;
}

function createProgressGuide(document) {
  const guide = createNode(document, 'div', 'grBattleProgressGuide');
  guide.setAttribute?.(PROGRESS_GUIDE_ATTR, '1');
  guide.setAttribute?.('aria-label', 'ROADからGOALへの進行方向');
  guide.dataset.presentationOnly = 'true';
  guide.dataset.authority = 'existing-road-goal-meaning-only';
  const goal = createNode(document, 'span', 'grBattleProgressEndpoint grBattleProgressGoal', 'GOAL');
  const arrow = createNode(document, 'span', 'grBattleProgressArrow');
  arrow.setAttribute?.('aria-hidden', 'true');
  const road = createNode(document, 'span', 'grBattleProgressEndpoint grBattleProgressRoad', 'ROAD');
  guide.appendChild(goal);
  guide.appendChild(arrow);
  guide.appendChild(road);
  return guide;
}

function createCurrentActionCue(document) {
  const cue = createNode(document, 'div', 'grBattleCurrentAction');
  cue.setAttribute?.(CURRENT_ACTION_ATTR, '1');
  cue.setAttribute?.('role', 'status');
  cue.setAttribute?.('aria-live', 'polite');
  cue.setAttribute?.('aria-atomic', 'true');
  cue.dataset.presentationOnly = 'true';
  cue.dataset.authority = 'accepted-public-model-only';
  cue.hidden = true;
  return cue;
}

function participantLabelById(model, participantId) {
  if (!participantId) return '';
  const lane = Array.isArray(model?.lanes) ? model.lanes.find(row => row?.id === participantId) : null;
  return typeof lane?.label === 'string' ? lane.label : '';
}

function writeCurrentActionCue(cue, model) {
  const phase = typeof model?.phase === 'string' ? model.phase : '';
  const phaseLabel = CURRENT_ACTION_PHASE_LABELS[phase] ?? '';
  const source = participantLabelById(model, model?.focus?.causeId);
  const targets = Array.isArray(model?.focus?.targetIds)
    ? model.focus.targetIds.map(id => participantLabelById(model, id)).filter(Boolean)
    : [];
  const winners = Array.isArray(model?.focus?.winnerIds)
    ? model.focus.winnerIds.map(id => participantLabelById(model, id)).filter(Boolean)
    : [];

  let detail = '';
  if ((phase === 'attack' || phase === 'ability') && source) {
    detail = targets.length ? `${source} → ${targets.join('・')}` : source;
  } else if ((phase === 'finisher' || phase === 'compare4') && winners.length) {
    detail = winners.join('・');
  } else if (phase === 'settle' && model?.boardReturn) {
    const target = targets[0] || participantLabelById(model, model.boardReturn.opponentId);
    const causal = model?.causalReturn;
    const handKey = typeof causal?.sourceCard?.jankenHand === 'string'
      ? causal.sourceCard.jankenHand.trim().toLowerCase()
      : '';
    const hand = LOAD_JANKEN_LABELS[handKey] ?? causal?.sourceCard?.jankenHand ?? '';
    const sourceCard = typeof causal?.sourceCard?.cardId === 'string' ? causal.sourceCard.cardId.trim() : '';
    const destination = [target, `Shield ${model.boardReturn.shieldLane}`].filter(Boolean).join(' / ');
    detail = sourceCard ? `${sourceCard}${hand ? `（${hand}）` : ''} → 解決 → ${destination}` : destination;
  }

  const text = phaseLabel ? `今：${phaseLabel}${detail ? ` ${detail}` : ''}` : '';
  cue.textContent = text;
  cue.hidden = !text;
  setData(cue, 'phase', text ? phase : null);
  setData(cue, 'eventId', text ? model?.eventId : null);
  setData(cue, 'boardReturnDestination', model?.boardReturn?.destinationKey ?? null);
  setData(cue, 'causalTraceKey', model?.causalReturn?.traceKey ?? null);
  setData(cue, 'causalCardId', model?.causalReturn?.sourceCard?.cardId ?? null);
  setData(cue, 'causalJanken', model?.causalReturn?.sourceCard?.jankenHand ?? null);
  return text;
}

function causalStageLabel(stage, model) {
  if (!stage || typeof stage !== 'object') return '';
  if (stage.kind === 'cause') {
    const handKey = typeof stage.jankenHand === 'string' ? stage.jankenHand.trim().toLowerCase() : '';
    const hand = LOAD_JANKEN_LABELS[handKey] ?? stage.jankenHand ?? '';
    return `攻撃 ${stage.cardId ?? ''}${hand ? `（${hand}）` : ''}`.trim();
  }
  if (stage.kind === 'processing') {
    const order = Array.isArray(stage.processingOrder)
      ? stage.processingOrder.map(id => participantLabelById(model, id) || id).filter(Boolean)
      : [];
    return order.length ? `比較 ${order.join(' → ')}` : '比較';
  }
  if (stage.kind === 'accepted_resolution') return '結果確定';
  if (stage.kind === 'return_path') return '盤面へ帰着';
  if (stage.kind === 'destination') {
    const participant = participantLabelById(model, stage.opponentId) || stage.opponentId || '';
    const shield = stage.shieldLane ? `Shield ${stage.shieldLane}` : '';
    return [participant, shield].filter(Boolean).join(' / ');
  }
  return '';
}

function createCausalTrace(document) {
  const trace = createNode(document, 'section', 'grBattleCausalTrace');
  trace.setAttribute?.(CAUSAL_TRACE_ATTR, '1');
  trace.setAttribute?.('role', 'status');
  trace.setAttribute?.('aria-live', 'polite');
  trace.setAttribute?.('aria-atomic', 'true');
  trace.setAttribute?.('aria-label', '攻撃から盤面反映までの因果');
  trace.dataset.presentationOnly = 'true';
  trace.dataset.authority = 'accepted-causal-return-stages-only';
  trace.hidden = true;
  return trace;
}

function writeCausalTrace(document, trace, model) {
  clearChildren(trace);
  const causal = model?.causalReturn;
  const stages = Array.isArray(causal?.stages) ? causal.stages : [];
  setData(trace, 'traceKey', null);
  setData(trace, 'eventId', null);
  setData(trace, 'motion', null);
  setData(trace, 'stageCount', null);
  setData(trace, 'preserveStageOrder', null);
  if (!causal || stages.length === 0) {
    trace.hidden = true;
    trace.setAttribute?.('aria-hidden', 'true');
    return null;
  }

  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    const label = causalStageLabel(stage, model);
    const item = createNode(document, 'span', 'grBattleCausalTraceStage', label);
    setData(item, 'kind', stage.kind ?? null);
    setData(item, 'stageIndex', index + 1);
    item.style.animationDelay = `${index * 160}ms`;
    trace.appendChild(item);
  }
  trace.hidden = false;
  trace.setAttribute?.('aria-hidden', 'false');
  setData(trace, 'traceKey', causal.traceKey ?? null);
  setData(trace, 'eventId', causal.eventId ?? null);
  setData(trace, 'motion', causal.motion?.mode ?? null);
  setData(trace, 'stageCount', stages.length);
  setData(trace, 'preserveStageOrder', causal.motion?.preserveStageOrder === true ? 'true' : null);
  return trace;
}

function clearChildren(node) {
  if (typeof node.replaceChildren === 'function') node.replaceChildren();
  else {
    while (node.firstChild) node.removeChild(node.firstChild);
    if (Array.isArray(node.children)) node.children.length = 0;
  }
}

function writeAfterstate(document, host, rows) {
  clearChildren(host);
  for (const row of rows) {
    const item = createNode(document, 'span', '', row.text);
    item.dataset.afterstateId = row.id;
    host.appendChild(item);
  }
}

function validRoot(root) {
  return root && typeof root.appendChild === 'function';
}

function authoritativeText(value, unresolvedToken) {
  if (typeof value === 'number' && Number.isFinite(value)) return { text: String(value), resolved: true };
  if (typeof value === 'string' && value.trim()) return { text: value.trim(), resolved: true };
  return { text: unresolvedToken, resolved: false };
}

export function resolveViewerLocalPlayedCardArt(document, cardId) {
  if (!document || typeof document.querySelectorAll !== 'function' || typeof cardId !== 'string' || !cardId) return null;
  const nodes = document.querySelectorAll('#collectionGrid [data-id]') ?? [];
  let sourceCard = null;
  for (const node of nodes) {
    if (String(node?.dataset?.id ?? '') === cardId) {
      sourceCard = node;
      break;
    }
  }
  const localArt = sourceCard?.querySelector?.('[data-role="fanart-local-skin-overlay"]');
  const src = typeof localArt?.src === 'string' ? localArt.src.trim() : '';
  if (!src) return null;
  return deepFreeze({ src, source: 'viewer_local' });
}

function writePlayedCard(document, cardNode, card) {
  const art = resolveViewerLocalPlayedCardArt(document, card.cardId);
  if (!art) {
    cardNode.textContent = card.label;
    return 'label';
  }
  const image = createNode(document, 'img', 'grBattleHudPlayedCardArt');
  image.src = art.src;
  image.alt = '';
  image.setAttribute?.('aria-hidden', 'true');
  cardNode.setAttribute?.('aria-label', card.label);
  cardNode.appendChild(image);
  setData(cardNode, 'artSource', art.source);
  return art.source;
}

const cinematicDuelRuntimeState = new WeakMap();
const cinematicDuelPairState = new WeakMap();

function exactCinematicCharacterId(global, document, participantId, context = {}) {
  const mapped = context?.cinematicCharacterByParticipant?.[participantId];
  if (typeof mapped === 'string' && mapped.trim()) return mapped.trim();

  const markers = typeof document.querySelectorAll === 'function'
    ? document.querySelectorAll('[data-board-controlled-character]')
    : [];
  for (const marker of markers ?? []) {
    if (marker?.dataset?.participantId !== participantId) continue;
    const characterId = marker?.dataset?.characterId;
    if (typeof characterId === 'string' && characterId.trim()) return characterId.trim();
  }

  if (participantId === context?.viewerParticipantId) {
    try {
      const currentPlayer = global?.GAMEROAD_PARTNER_STATE?.player?.();
      if (typeof currentPlayer?.id === 'string' && currentPlayer.id.trim()) return currentPlayer.id.trim();
    } catch {}
  }
  return null;
}

function disposeCinematicDuelRuntime(global, scene) {
  const active = cinematicDuelRuntimeState.get(scene);
  if (!active) return;
  if (typeof global?.clearTimeout === 'function') {
    for (const timer of active.timers) {
      try { global.clearTimeout(timer); } catch {}
    }
  }
  for (const controller of active.motionControllers ?? []) {
    try { controller.destroy?.(); } catch {}
  }
  const runtime = global?.GameRoadThreeCharRuntime;
  if (typeof runtime?.unmount === 'function') {
    for (const mount of active.mounts) {
      try { runtime.unmount(mount); } catch {}
    }
  }
  cinematicDuelRuntimeState.delete(scene);
}

function createCinematicDuel(document) {
  const scene = createNode(document, 'section', 'grBattleCinematicDuel');
  scene.setAttribute?.(CINEMATIC_DUEL_ATTR, '1');
  scene.setAttribute?.('aria-label', '攻撃側と受け側');
  scene.dataset.presentationOnly = 'true';
  scene.dataset.authority = 'model-lane-role-only-no-target-inference';
  scene.hidden = true;
  return scene;
}

function createCinematicDuelSide(document, role, lane) {
  const side = createNode(document, 'div', 'grBattleCinematicDuelSide');
  side.dataset.role = role;
  side.dataset.participantId = lane.id;
  side.setAttribute?.('aria-label', (role === 'source' ? '攻撃側 ' : '受け側 ') + lane.label);
  const figure = createNode(document, 'div', 'grBattleCinematicDuelFigure');
  figure.dataset.visualKind = 'css-proxy';
  figure.setAttribute?.('aria-hidden', 'true');
  const characterHost = createNode(document, 'div', 'grBattleCinematicDuelCharacterHost');
  characterHost.setAttribute?.(CINEMATIC_DUEL_CHARACTER_ATTR, '');
  characterHost.hidden = true;
  figure.appendChild(characterHost);
  const meta = createNode(document, 'div', 'grBattleCinematicDuelMeta');
  meta.appendChild(createNode(document, 'small', '', role === 'source' ? '攻撃側' : '受け側'));
  meta.appendChild(createNode(document, 'b', '', lane.label));
  side.appendChild(figure);
  side.appendChild(meta);
  return { side, figure, characterHost };
}

function createCinematicDuelFx(document) {
  const fx = createNode(document, 'div', 'grBattleCinematicDuelFx');
  fx.dataset.layer = 'vfx';
  fx.dataset.presentationOnly = 'true';
  fx.dataset.vfxKind = 'provisional-neutral-compressed-shot';
  fx.setAttribute?.('aria-hidden', 'true');
  return fx;
}

function mountCinematicDuelCharacter(global, scene, view, characterId, role, motion, motionContext = {}) {
  const runtime = global?.GameRoadThreeCharRuntime;
  if (!characterId || typeof runtime?.mount !== 'function') return false;
  const active = cinematicDuelRuntimeState.get(scene);
  if (!active) return false;

  let pending;
  try {
    pending = runtime.mount(view.characterHost, {
      characterId,
      state: 'idle',
      assetMode: 'embedded',
      performance: motion === 'static_only' ? 'low' : 'normal',
      allowNetwork: false
    });
  } catch {
    return false;
  }

  void Promise.resolve(pending).then((mount) => {
    const current = cinematicDuelRuntimeState.get(scene);
    if (!mount || current !== active) {
      if (mount && typeof runtime.unmount === 'function') {
        try { runtime.unmount(mount); } catch {}
      }
      return;
    }
    if (mount?.status === 'unknown-character') {
      if (typeof runtime.unmount === 'function') {
        try { runtime.unmount(mount); } catch {}
      }
      return;
    }

    active.mounts.push(mount);
    view.figure.dataset.visualKind = 'character-runtime';
    view.figure.dataset.characterId = characterId;
    view.characterHost.hidden = false;

    const motionController = createSaasunaBattleMotionController({
      doc: global?.document,
      host: view.figure,
      characterHost: view.characterHost,
      characterId,
      role,
      motion,
      phase: motionContext?.phase,
      transition: motionContext?.transition,
      motionState: motionContext?.motionState
    });
    if (motionController) {
      active.motionControllers.push(motionController);
      view.figure.dataset.motionVisualKind = 'provisional-keyframe-sheet';
      view.figure.dataset.provisionalArt = 'true';
    }

    if (typeof runtime.setState !== 'function') return;
    const performance = motion === 'static_only' ? 'low' : 'normal';
    const facing = role === 'source' ? 'right' : 'left';
    try { runtime.setState(mount, role === 'source' && motion !== 'static_only' ? 'attack' : 'idle', { facing, performance }); } catch {}

    if (role === 'source' && motion !== 'static_only' && typeof global?.setTimeout === 'function') {
      const timer = global.setTimeout(() => {
        if (cinematicDuelRuntimeState.get(scene) !== active) return;
        try { runtime.setState(mount, 'idle', { facing, performance }); } catch {}
      }, 560);
      active.timers.push(timer);
    }
  }).catch(() => {});
  return true;
}

function writeCinematicDuel(global, document, scene, model, context = {}) {
  const previousPair = [...(cinematicDuelPairState.get(scene) ?? [])];
  disposeCinematicDuelRuntime(global, scene);
  clearChildren(scene);
  setData(scene, 'eventId', null);
  setData(scene, 'sourceId', null);
  setData(scene, 'targetId', null);
  setData(scene, 'sourceCharacterId', null);
  setData(scene, 'targetCharacterId', null);
  setData(scene, 'vfx', null);
  setData(scene, 'handoff', null);
  setData(scene, 'conveyorTransition', null);
  setData(scene, 'retainedParticipants', null);
  setData(scene, 'incomingParticipants', null);
  setData(scene, 'outgoingParticipants', null);
  setData(scene, 'phase', null);
  setData(scene, 'transition', null);
  setData(scene, 'motion', null);
  setData(scene, 'saasunaMotionRuntime', null);
  const phase = model?.phase;
  const enabled = model?.battlePhasePresentationMode === 'FULLSCREEN_ANIMATION'
    && (phase === 'attack' || phase === 'ability');
  const modelLanes = Array.isArray(model?.lanes) ? model.lanes : [];
  const sources = enabled ? modelLanes.filter(lane => lane?.role === 'source') : [];
  const targets = enabled ? modelLanes.filter(lane => lane?.role === 'target') : [];
  if (!enabled || sources.length !== 1 || targets.length !== 1) {
    if (context?.preserveConveyorPair !== true
      && (!model || model.screenMode !== 'BATTLE_PHASE' || phase === 'settle')) {
      cinematicDuelPairState.delete(scene);
    }
    scene.hidden = true;
    scene.setAttribute?.('aria-hidden', 'true');
    return scene;
  }

  const source = sources[0];
  const target = targets[0];
  const currentPair = [source.id, target.id];
  const previousSet = new Set(previousPair);
  const currentSet = new Set(currentPair);
  const retainedParticipants = currentPair.filter(id => previousSet.has(id));
  const incomingParticipants = currentPair.filter(id => !previousSet.has(id));
  const outgoingParticipants = previousPair.filter(id => !currentSet.has(id));
  const active = { mounts: [], timers: [], motionControllers: [] };
  cinematicDuelRuntimeState.set(scene, active);
  cinematicDuelPairState.set(scene, currentPair);
  const sourceView = createCinematicDuelSide(document, 'source', source);
  const targetView = createCinematicDuelSide(document, 'target', target);
  setData(sourceView.side, 'movementIntent', retainedParticipants.includes(source.id) ? 'REMAIN_STAGE' : 'ENTER_STAGE');
  setData(targetView.side, 'movementIntent', retainedParticipants.includes(target.id) ? 'REMAIN_STAGE' : 'ENTER_STAGE');
  const motionByParticipant = context?.cinematicMotionByParticipant ?? {};
  const sourceCharacterId = exactCinematicCharacterId(global, document, source.id, context);
  const targetCharacterId = exactCinematicCharacterId(global, document, target.id, context);

  scene.appendChild(sourceView.side);
  scene.appendChild(createCinematicDuelFx(document));
  scene.appendChild(targetView.side);
  mountCinematicDuelCharacter(global, scene, sourceView, sourceCharacterId, 'source', model.motion, {
    phase,
    transition: model.transition,
    motionState: motionByParticipant[source.id] ?? null
  });
  mountCinematicDuelCharacter(global, scene, targetView, targetCharacterId, 'target', model.motion, {
    phase,
    transition: model.transition,
    motionState: motionByParticipant[target.id] ?? null
  });

  scene.hidden = false;
  scene.setAttribute?.('aria-hidden', 'false');
  setData(scene, 'eventId', model.eventId ?? null);
  setData(scene, 'phase', phase);
  setData(scene, 'transition', model.transition ?? null);
  setData(scene, 'motion', model.motion ?? null);
  setData(scene, 'saasunaMotionRuntime', SAASUNA_BATTLE_MOTION_RUNTIME.schema);
  setData(scene, 'sourceId', source.id);
  setData(scene, 'targetId', target.id);
  setData(scene, 'sourceCharacterId', sourceCharacterId);
  setData(scene, 'targetCharacterId', targetCharacterId);
  setData(scene, 'vfx', 'provisional-neutral-compressed-shot');
  setData(scene, 'handoff', model.transition ?? 'CONTINUE');
  setData(scene, 'conveyorTransition', model.transition ?? 'CONTINUE');
  setData(scene, 'retainedParticipants', retainedParticipants.join('|') || null);
  setData(scene, 'incomingParticipants', incomingParticipants.join('|') || null);
  setData(scene, 'outgoingParticipants', outgoingParticipants.join('|') || null);
  return scene;
}
function createCinematicOrderRail(document) {
  const rail = createNode(document, 'section', 'grBattleCinematicOrder');
  rail.setAttribute?.(CINEMATIC_ORDER_ATTR, '1');
  rail.setAttribute?.('aria-label', '確定した処理順のカード');
  rail.dataset.presentationOnly = 'true';
  rail.dataset.authority = 'accepted-causal-processing-order-only';
  rail.hidden = true;
  rail.setAttribute?.('aria-hidden', 'true');
  return rail;
}

function writeCinematicOrderRail(document, rail, model) {
  clearChildren(rail);
  setData(rail, 'eventId', null);
  setData(rail, 'cardCount', null);
  setData(rail, 'orderSource', null);
  const causalProcessing = model?.causalReturn?.processing ?? null;
  const compareProcessing = model?.phase === 'compare4' ? model?.actionOrderChain ?? null : null;
  const processing = causalProcessing ?? compareProcessing;
  const slots = Array.isArray(processing?.finalSlots) ? processing.finalSlots : [];
  if (model?.battlePhasePresentationMode !== 'FULLSCREEN_ANIMATION' || slots.length === 0) {
    rail.hidden = true;
    rail.setAttribute?.('aria-hidden', 'true');
    return null;
  }

  const tilt = [-7, -2, 2, 7];
  const lift = [7, 1, 1, 7];
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    const card = createNode(document, 'div', 'grBattleCinematicOrderCard');
    setData(card, 'sequenceIndex', index);
    setData(card, 'playerId', slot.playerId ?? null);
    setData(card, 'cardId', slot.cardId ?? null);
    setData(card, 'finalState', slot.visualState ?? null);
    card.style.transform = `translateY(${lift[index] ?? 0}px) rotate(${tilt[index] ?? 0}deg)`;
    const handKey = typeof slot.hand === 'string' ? slot.hand.trim().toLowerCase() : '';
    const handLabel = LOAD_JANKEN_LABELS[handKey] ?? slot.hand ?? '';
    const numberLabel = slot.displayNumber == null ? '' : String(slot.displayNumber);
    const readable = [numberLabel, handLabel].filter(Boolean).join('、');
    card.setAttribute?.('aria-label', `処理順${index + 1}${readable ? `、${readable}` : ''}`);

    const art = typeof slot.cardId === 'string' ? resolveViewerLocalPlayedCardArt(document, slot.cardId) : null;
    if (art) {
      const image = createNode(document, 'img', 'grBattleCinematicOrderCardArt');
      image.src = art.src;
      image.alt = '';
      image.setAttribute?.('aria-hidden', 'true');
      card.appendChild(image);
      setData(card, 'artSource', art.source);
    } else {
      const fallback = createNode(document, 'span', 'grBattleCinematicOrderCardFallback');
      fallback.setAttribute?.('aria-hidden', 'true');
      card.appendChild(fallback);
    }
    if (numberLabel) card.appendChild(createNode(document, 'span', 'grBattleCinematicOrderCardNumber', numberLabel));
    if (handLabel) card.appendChild(createNode(document, 'span', 'grBattleCinematicOrderCardHand', handLabel));
    rail.appendChild(card);
  }

  rail.hidden = false;
  rail.setAttribute?.('aria-hidden', 'false');
  setData(rail, 'eventId', model?.eventId ?? null);
  setData(rail, 'cardCount', slots.length);
  setData(
    rail,
    'orderSource',
    causalProcessing ? 'accepted-causal-processing-order' : 'accepted-action-order-compare4'
  );
  return rail;
}

function writePublicLaneCard(document, cardNode, card) {
  clearChildren(cardNode);
  setData(cardNode, 'playerId', null);
  setData(cardNode, 'cardId', null);
  setData(cardNode, 'displayNumber', null);
  setData(cardNode, 'hand', null);
  setData(cardNode, 'artSource', null);
  if (!card) {
    cardNode.hidden = true;
    cardNode.setAttribute?.('aria-hidden', 'true');
    return null;
  }
  const handKey = typeof card.hand === 'string' ? card.hand.toLowerCase() : '';
  const handLabel = LOAD_JANKEN_LABELS[handKey] ?? card.hand ?? '';
  const numberLabel = card.displayNumber == null ? '' : String(card.displayNumber);
  cardNode.hidden = false;
  cardNode.setAttribute?.('aria-hidden', 'false');
  cardNode.setAttribute?.('aria-label', `公開カード ${card.cardId}${numberLabel ? ` / ${numberLabel}` : ''}${handLabel ? ` / ${handLabel}` : ''}`);
  setData(cardNode, 'playerId', card.playerId);
  setData(cardNode, 'cardId', card.cardId);
  setData(cardNode, 'displayNumber', numberLabel || null);
  setData(cardNode, 'hand', card.hand ?? null);
  const art = resolveViewerLocalPlayedCardArt(document, card.cardId);
  if (art) {
    const image = createNode(document, 'img', 'grBattleLanePublicCardArt');
    image.src = art.src;
    image.alt = '';
    image.setAttribute?.('aria-hidden', 'true');
    cardNode.appendChild(image);
    setData(cardNode, 'artSource', art.source);
  } else {
    cardNode.appendChild(createNode(document, 'span', 'grBattleLanePublicCardFallback', card.cardId));
  }
  if (numberLabel) cardNode.appendChild(createNode(document, 'span', 'grBattleLanePublicCardNumber', numberLabel));
  if (handLabel) cardNode.appendChild(createNode(document, 'span', 'grBattleLanePublicCardHand', handLabel));
  return cardNode;
}

const FOCUS_RUNTIME_SELECTOR = '[data-gr-janken-focus-runtime]';
const FOCUS_PHYSICAL_CARD_SELECTOR = '[data-physical-card-id]';
const FOCUS_JANKEN_ROLE_SELECTOR = '[data-janken-role]';
const FOCUS_ACCEPTED_IDENTITY_SOURCES = Object.freeze(['GLOBAL_CARD_DATA_EXACT_ID', 'PACKAGE_CARD_ID_ONLY']);

function hudSourceOf(snapshot) {
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};
}

function normalizePlayedCards(value) {
  if (!Array.isArray(value)) return [];
  const cards = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const cardId = typeof raw.cardId === 'string' ? raw.cardId.trim() : '';
    if (!cardId) continue;
    const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : cardId;
    cards.push({ ...raw, cardId, label });
  }
  return cards;
}

function samePlayedCardSequence(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((card, index) => card?.cardId === right[index]?.cardId);
}

function copyPlayedCards(cards) {
  return normalizePlayedCards(cards).map(card => ({ ...card }));
}

function readFocusCommittingCandidate(host) {
  if (!host || host.hidden || String(host.dataset?.surface ?? '') !== 'COMMITTING') return null;
  const physicalCard = host.querySelector?.(FOCUS_PHYSICAL_CARD_SELECTOR) ?? null;
  const cardId = typeof physicalCard?.dataset?.physicalCardId === 'string'
    ? physicalCard.dataset.physicalCardId.trim()
    : '';
  const identitySource = typeof physicalCard?.dataset?.cardIdentitySource === 'string'
    ? physicalCard.dataset.cardIdentitySource.trim()
    : '';
  if (!cardId || !FOCUS_ACCEPTED_IDENTITY_SOURCES.includes(identitySource)) return null;

  const roleNode = physicalCard.querySelector?.(FOCUS_JANKEN_ROLE_SELECTOR)
    ?? host.querySelector?.(FOCUS_JANKEN_ROLE_SELECTOR)
    ?? null;
  const role = typeof roleNode?.dataset?.jankenRole === 'string'
    ? roleNode.dataset.jankenRole.trim().toUpperCase()
    : '';
  const jankenHand = role === 'ROCK' ? 'rock' : role === 'SCISSORS' ? 'scissors' : role === 'PAPER' ? 'paper' : null;
  const nativeSuit = typeof physicalCard.dataset?.nativeSuit === 'string' && physicalCard.dataset.nativeSuit.trim()
    ? physicalCard.dataset.nativeSuit.trim()
    : null;
  const printedNumber = typeof physicalCard.dataset?.printedRank === 'string' && physicalCard.dataset.printedRank.trim()
    ? physicalCard.dataset.printedRank.trim()
    : null;

  return Object.freeze({ cardId, identitySource, jankenHand, nativeSuit, printedNumber });
}

function normalizeHudSnapshot(snapshot = {}) {
  const source = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};
  const score = authoritativeText(source.score, 'X');
  const hate = authoritativeText(source.hate, 'XXX');
  const turn = authoritativeText(source.turn, 'XX');
  const playedCards = normalizePlayedCards(source.playedCards);
  const lineage = buildBattleLoadCardChainPresentation({
    loadCard: source.loadCard ?? null,
    loadJanken: source.loadJanken ?? null,
    playedCards
  });
  const handKey = typeof lineage.loadSlot.jankenHand === 'string'
    ? lineage.loadSlot.jankenHand.trim().toLowerCase()
    : '';
  const hand = LOAD_JANKEN_LABELS[handKey] ?? '?';
  const lineageLoadCard = lineage.loadSlot.card;
  const loadCard = lineageLoadCard
    ? {
        ...lineageLoadCard,
        label: typeof lineageLoadCard.label === 'string' && lineageLoadCard.label
          ? lineageLoadCard.label
          : (typeof lineageLoadCard.name === 'string' && lineageLoadCard.name ? lineageLoadCard.name : lineageLoadCard.cardId)
      }
    : null;
  return {
    score,
    hate,
    turn,
    loadCard,
    loadIdentityState: lineage.loadSlot.identityState,
    loadJanken: { text: hand, resolved: hand !== '?' },
    playedCards
  };
}

function createHud(document, shell) {
  const root = createNode(document, 'div', 'grBattleScreenTop');
  root.setAttribute?.(HUD_ATTR, '1');
  root.dataset.presentationOnly = 'true';
  root.dataset.authority = 'caller';

  const left = createNode(document, 'div', 'grBattleHudLeft');
  const settingsButton = createNode(document, 'button', 'grBattleHudSettings', '⚙');
  settingsButton.setAttribute?.('type', 'button');
  settingsButton.setAttribute?.('aria-label', '設定');
  settingsButton.dataset.action = 'settings';
  settingsButton.dataset.owner = 'caller';
  const score = createNode(document, 'div', 'grBattleHudMetric');
  score.appendChild(createNode(document, 'small', '', 'SCORE'));
  const scoreValue = createNode(document, 'b');
  score.appendChild(scoreValue);
  left.appendChild(settingsButton);
  left.appendChild(score);

  const center = createNode(document, 'div', 'grBattleHudCenter');
  const chain = createNode(document, 'div', 'grBattleHudChain');
  chain.setAttribute?.('aria-label', '使用済みBattleカード');
  const load = createNode(document, 'div', 'grBattleHudLoad');
  load.style.position = 'relative';
  const loadLabel = createNode(document, 'small', '', 'LOAD');
  loadLabel.style.position = 'absolute';
  loadLabel.style.left = '3px';
  loadLabel.style.top = '2px';
  loadLabel.style.zIndex = '3';
  load.appendChild(loadLabel);
  const loadCard = createNode(document, 'span', 'grBattleHudPlayedCard');
  loadCard.hidden = true;
  loadCard.setAttribute?.('aria-hidden', 'true');
  loadCard.dataset.role = 'load-card';
  loadCard.style.position = 'absolute';
  loadCard.style.inset = '3px';
  loadCard.style.width = 'auto';
  loadCard.style.height = 'auto';
  loadCard.style.boxSizing = 'border-box';
  loadCard.style.zIndex = '1';
  load.appendChild(loadCard);
  const loadValue = createNode(document, 'b');
  loadValue.style.position = 'absolute';
  loadValue.style.right = '2px';
  loadValue.style.bottom = '2px';
  loadValue.style.zIndex = '3';
  loadValue.style.padding = '1px 3px';
  loadValue.style.borderRadius = '4px';
  loadValue.style.background = 'rgba(3,17,16,.88)';
  load.appendChild(loadValue);
  center.appendChild(chain);
  center.appendChild(load);

  const right = createNode(document, 'div', 'grBattleHudRight');
  const hate = createNode(document, 'div', 'grBattleHudMetric');
  hate.appendChild(createNode(document, 'small', '', 'HATE'));
  const hateValue = createNode(document, 'b');
  hate.appendChild(hateValue);
  const turn = createNode(document, 'div', 'grBattleHudMetric');
  turn.appendChild(createNode(document, 'small', '', 'Turn'));
  const turnValue = createNode(document, 'b');
  turn.appendChild(turnValue);
  right.appendChild(hate);
  right.appendChild(turn);

  root.appendChild(left);
  root.appendChild(center);
  root.appendChild(right);
  shell.appendChild(root);
  return { root, right, settingsButton, scoreValue, chain, loadCard, loadValue, hateValue, turnValue };
}

function writeHud(document, hud, snapshot) {
  const model = normalizeHudSnapshot(snapshot);
  hud.scoreValue.textContent = model.score.text;
  hud.hateValue.textContent = model.hate.text;
  hud.turnValue.textContent = model.turn.text;
  hud.loadValue.textContent = model.loadJanken.text;
  setData(hud.scoreValue, 'resolved', model.score.resolved);
  setData(hud.hateValue, 'resolved', model.hate.resolved);
  setData(hud.turnValue, 'resolved', model.turn.resolved);
  setData(hud.loadValue, 'resolved', model.loadJanken.resolved);

  clearChildren(hud.loadCard);
  hud.loadCard.textContent = '';
  hud.loadCard.hidden = !model.loadCard;
  hud.loadCard.setAttribute?.('aria-hidden', model.loadCard ? 'false' : 'true');
  setData(hud.loadCard, 'cardId', null);
  setData(hud.loadCard, 'displayNumber', null);
  setData(hud.loadCard, 'nativeSuit', null);
  setData(hud.loadCard, 'artSource', null);
  if (model.loadCard) {
    setData(hud.loadCard, 'cardId', model.loadCard.cardId);
    setData(hud.loadCard, 'displayNumber', model.loadCard.displayNumber ?? model.loadCard.printedNumber ?? null);
    setData(hud.loadCard, 'nativeSuit', model.loadCard.nativeSuit ?? model.loadCard.suit ?? null);
    writePlayedCard(document, hud.loadCard, model.loadCard);
    const numberLabel = model.loadCard.displayNumber ?? model.loadCard.printedNumber ?? null;
    const suitLabel = typeof (model.loadCard.nativeSuit ?? model.loadCard.suit) === 'string'
      ? (model.loadCard.nativeSuit ?? model.loadCard.suit).trim()
      : '';
    if (numberLabel != null || suitLabel) {
      const identityMeta = createNode(document, 'span', 'grBattleHudLoadIdentityMeta', `${suitLabel}${numberLabel ?? ''}`);
      identityMeta.style.position = 'absolute';
      identityMeta.style.left = '2px';
      identityMeta.style.bottom = '2px';
      identityMeta.style.zIndex = '3';
      identityMeta.style.padding = '1px 2px';
      identityMeta.style.borderRadius = '4px';
      identityMeta.style.background = 'rgba(3,17,16,.88)';
      identityMeta.style.color = '#fff6c9';
      identityMeta.style.fontSize = '9px';
      identityMeta.style.lineHeight = '1.1';
      identityMeta.style.pointerEvents = 'none';
      hud.loadCard.appendChild(identityMeta);
    }
    hud.loadCard.setAttribute?.('aria-label', `LOAD ${model.loadCard.label} / ${model.loadJanken.text}`);
  } else {
    hud.loadCard.removeAttribute?.('aria-label');
  }

  clearChildren(hud.chain);
  model.playedCards.forEach((card, index) => {
    if (index > 0) hud.chain.appendChild(createNode(document, 'span', 'grBattleHudChainArrow', '▷'));
    const cardNode = createNode(document, 'span', 'grBattleHudPlayedCard');
    cardNode.dataset.cardId = card.cardId;
    cardNode.dataset.order = String(index + 1);
    writePlayedCard(document, cardNode, card);
    hud.chain.appendChild(cardNode);
  });
  setData(hud.root, 'scoreResolved', model.score.resolved);
  setData(hud.root, 'hateResolved', model.hate.resolved);
  setData(hud.root, 'turnResolved', model.turn.resolved);
  setData(hud.root, 'loadCardResolved', Boolean(model.loadCard));
  setData(hud.root, 'loadCardId', model.loadCard?.cardId ?? null);
  setData(hud.root, 'loadJankenResolved', model.loadJanken.resolved);
  setData(hud.root, 'playedCardCount', model.playedCards.length);
  return deepFreeze(model);
}

export function mountBattleScreenExternalSurface(global = globalThis, options = {}) {
  const document = requireDocument(global);
  const providedPhase = options.phaseSurface ?? null;
  const providedResolution = options.resolutionSurface ?? null;
  let root = options.root ?? null;
  if (!root && providedPhase?.parentNode) root = providedPhase.parentNode;
  if (!root && typeof document.querySelector === 'function') {
    root = document.querySelector('[data-gr-battle-screen-root]');
  }
  if (!validRoot(root) && !providedPhase) throw new TypeError('BATTLE_SCREEN_ROOT_REQUIRED');

  addStyle(document);

  const adoptingExistingPhase = Boolean(providedPhase);
  const callerShell = options.shell ?? null;
  let shell = callerShell;
  let shellCreated = false;
  if (adoptingExistingPhase) {
    shell = createNode(document, 'div', 'grBattleScreenAdoptedOverlay');
    shell.setAttribute?.(SHELL_ATTR, '1');
    shell.dataset.owner = 'runtime_overlay';
    providedPhase.appendChild(shell);
    shellCreated = true;
  } else if (!shell) {
    shell = createNode(document, 'section', 'grBattleScreenShell');
    shell.setAttribute?.(SHELL_ATTR, '1');
    if (validRoot(root)) root.appendChild(shell);
    shellCreated = true;
  } else {
    shell.setAttribute?.(SHELL_ATTR, '1');
  }

  const hud = createHud(document, shell);
  let lastCallerHudSource = hudSourceOf(options.hud);
  let lastHudSnapshot = writeHud(document, hud, lastCallerHudSource);
  let focusCommitCandidate = null;
  let pendingLoadCard = null;
  let pendingLoadJanken = null;
  let pendingPlayedBaseline = [];
  let loadLineageStatus = 'idle';
  const resourceHud = mountBattleCriticalResourceHud(global, { host: hud.right, snapshot: options.hud ?? {} });

  let planSlot = null;
  if (shellCreated && !adoptingExistingPhase) {
    planSlot = createNode(document, 'div', 'grBattlePlanSlot');
    planSlot.setAttribute?.(PLAN_SLOT_ATTR, '');
    planSlot.dataset.owner = 'caller';
    shell.appendChild(planSlot);
  }

  const phaseAnchor = ensureAnchor(document, shell, providedPhase, 'battlePhaseSurface', 'section');
  const phaseSurface = phaseAnchor.node;
  phaseSurface.dataset.battleScreenPresentationOnly = 'true';
  phaseSurface.dataset.battleScreenBoardInteraction = 'forbidden';
  if (phaseAnchor.created) phaseSurface.hidden = true;

  const externalBattleMap = document.getElementById?.('battleMap') ?? null;
  const externalBattleMapStyle = externalBattleMap?.style
    ? Object.freeze({
      visibility: externalBattleMap.style.visibility ?? '',
      pointerEvents: externalBattleMap.style.pointerEvents ?? ''
    })
    : null;
  function setExternalBattleMapSuppressed(suppressed) {
    if (!externalBattleMap?.style || !externalBattleMapStyle) return false;
    if (suppressed) {
      externalBattleMap.style.visibility = 'hidden';
      externalBattleMap.style.pointerEvents = 'none';
      externalBattleMap.setAttribute?.('aria-hidden', 'true');
      setData(externalBattleMap, 'battlePhaseSuppressed', 'true');
      return true;
    }
    externalBattleMap.style.visibility = externalBattleMapStyle.visibility;
    externalBattleMap.style.pointerEvents = externalBattleMapStyle.pointerEvents;
    externalBattleMap.removeAttribute?.('aria-hidden');
    setData(externalBattleMap, 'battlePhaseSuppressed', null);
    return false;
  }

  const visualHost = adoptingExistingPhase ? shell : phaseSurface;
  const fieldLandmark = createFieldLandmark(document);
  visualHost.appendChild(fieldLandmark);
  syncFieldLandmark(fieldLandmark, phaseSurface, shell, root);

  const currentActionCue = createCurrentActionCue(document);
  const currentActionHost = adoptingExistingPhase && validRoot(root) ? root : shell;
  currentActionHost.appendChild(currentActionCue);

  const causalTrace = createCausalTrace(document);
  currentActionHost.appendChild(causalTrace);

  const progressGuide = createProgressGuide(document);
  visualHost.appendChild(progressGuide);

  const cinematicOrderRail = createCinematicOrderRail(document);
  visualHost.appendChild(cinematicOrderRail);

  const cinematicDuel = createCinematicDuel(document);
  visualHost.appendChild(cinematicDuel);

  const grid = createNode(document, 'div', 'grBattleCausalGrid');
  grid.setAttribute?.(GRID_ATTR, '');
  grid.setAttribute?.('aria-label', '4人バトル比較');
  visualHost.appendChild(grid);
  const lanes = Array.from({ length: 4 }, (_, index) => createLane(document, index));
  for (const lane of lanes) grid.appendChild(lane.lane);
  const defaultViewerParticipantId = normalizeViewerParticipantId(options.viewerParticipantId);
  const defaultCinematicCharacterByParticipant = options.cinematicCharacterByParticipant ?? null;

  const resolutionAnchor = ensureAnchor(document, phaseSurface, providedResolution, 'battleResolution', 'div');
  const resolutionSurface = resolutionAnchor.node;
  resolutionSurface.dataset.battleScreenResolutionAuthority = 'external_existing_presentation_consumer';

  const currentPlayerUiRoot = options.currentPlayerUiRoot
    ?? document.querySelector?.('section.screen.battle[data-screen="battle"]')
    ?? document.querySelector?.('.screen.battle')
    ?? null;
  let currentPlayerUi = null;
  if (currentPlayerUiRoot) {
    try {
      currentPlayerUi = mountBattleCurrentPlayerUi(global, {
        root: currentPlayerUiRoot,
        initialState: options.currentPlayerUiState ?? null
      });
    } catch {
      currentPlayerUi = null;
    }
  }

  let destroyed = false;
  let focusObserver = null;

  function setLoadLineageStatus(status, cardId = null) {
    loadLineageStatus = status;
    setData(hud.root, 'loadLineageStatus', status);
    setData(hud.root, 'loadLineageCardId', cardId);
    return status;
  }

  function clearPendingLoad() {
    pendingLoadCard = null;
    pendingLoadJanken = null;
    pendingPlayedBaseline = [];
  }

  function composeHudSource(snapshot) {
    const source = hudSourceOf(snapshot);
    if (!pendingLoadCard) return source;

    const callerLoadCardId = typeof source.loadCard?.cardId === 'string' ? source.loadCard.cardId.trim() : '';
    if (callerLoadCardId) {
      clearPendingLoad();
      setLoadLineageStatus('caller-load-authority', callerLoadCardId);
      return source;
    }

    const callerPlayed = normalizePlayedCards(source.playedCards);
    if (samePlayedCardSequence(callerPlayed, pendingPlayedBaseline)) {
      return { ...source, loadCard: pendingLoadCard, loadJanken: pendingLoadJanken };
    }

    const pendingCardId = pendingLoadCard.cardId;
    try {
      verifyBattleLoadCommitTransition({
        before: {
          loadCard: pendingLoadCard,
          loadJanken: pendingLoadJanken,
          playedCards: pendingPlayedBaseline
        },
        after: { loadCard: null, loadJanken: null, playedCards: callerPlayed }
      });
      clearPendingLoad();
      setLoadLineageStatus('moved-to-played-chain', pendingCardId);
    } catch {
      clearPendingLoad();
      setLoadLineageStatus('continuity-unresolved', pendingCardId);
    }
    return source;
  }

  function renderHud(snapshot = {}) {
    if (destroyed) throw new Error('BATTLE_SCREEN_RUNTIME_DESTROYED');
    lastCallerHudSource = hudSourceOf(snapshot);
    const effectiveSnapshot = composeHudSource(lastCallerHudSource);
    lastHudSnapshot = writeHud(document, hud, effectiveSnapshot);
    resourceHud.sync(lastCallerHudSource);
    return lastHudSnapshot;
  }

  function syncLoadCardFocusDom() {
    if (destroyed) return null;
    const host = document.querySelector?.(FOCUS_RUNTIME_SELECTOR) ?? null;
    if (!host) {
      focusCommitCandidate = null;
      if (!pendingLoadCard && loadLineageStatus === 'committing') setLoadLineageStatus('idle');
      return null;
    }

    const surface = String(host.dataset?.surface ?? '');
    if (!host.hidden && surface === 'COMMITTING') {
      const candidate = readFocusCommittingCandidate(host);
      if (!candidate) {
        focusCommitCandidate = null;
        if (!pendingLoadCard) setLoadLineageStatus('identity-unresolved');
        return null;
      }
      if (!focusCommitCandidate || focusCommitCandidate.cardId !== candidate.cardId) {
        focusCommitCandidate = Object.freeze({
          ...candidate,
          playedCards: Object.freeze(copyPlayedCards(lastHudSnapshot.playedCards))
        });
      }
      setLoadLineageStatus('committing', candidate.cardId);
      return focusCommitCandidate;
    }

    if (host.hidden && surface === 'COMMITTING' && focusCommitCandidate) {
      const accepted = focusCommitCandidate;
      focusCommitCandidate = null;
      pendingLoadCard = Object.freeze({
        cardId: accepted.cardId,
        label: accepted.cardId,
        ...(accepted.nativeSuit ? { nativeSuit: accepted.nativeSuit } : {}),
        ...(accepted.printedNumber ? { printedNumber: accepted.printedNumber } : {})
      });
      pendingLoadJanken = accepted.jankenHand;
      pendingPlayedBaseline = copyPlayedCards(accepted.playedCards);
      setLoadLineageStatus('accepted-load', accepted.cardId);
      const effectiveSnapshot = composeHudSource(lastCallerHudSource);
      lastHudSnapshot = writeHud(document, hud, effectiveSnapshot);
      return Object.freeze({ status: loadLineageStatus, cardId: accepted.cardId });
    }

    if (surface !== 'COMMITTING') {
      focusCommitCandidate = null;
      if (!pendingLoadCard && (loadLineageStatus === 'committing' || loadLineageStatus === 'identity-unresolved')) {
        setLoadLineageStatus('idle');
      }
    }
    return null;
  }

  setLoadLineageStatus('idle');
  const FocusObserver = global?.MutationObserver;
  const observationRoot = document.getElementById?.('battleScreen') ?? currentPlayerUiRoot ?? root ?? document.body ?? null;
  if (typeof FocusObserver === 'function' && observationRoot) {
    try {
      focusObserver = new FocusObserver(() => {
        try { syncLoadCardFocusDom(); } catch {}
      });
      focusObserver.observe(observationRoot, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-surface', 'hidden']
      });
    } catch {
      focusObserver = null;
    }
  }
  syncLoadCardFocusDom();

  function render(model, hudSnapshot = null, presentationContext = null) {
    if (destroyed) throw new Error('BATTLE_SCREEN_RUNTIME_DESTROYED');

    // Rejected/stale input must not leave the previous accepted return highlighted.
    writeCurrentActionCue(currentActionCue, null);
    writeCausalTrace(document, causalTrace, null);
    writeCinematicOrderRail(document, cinematicOrderRail, null);
    writeCinematicDuel(global, document, cinematicDuel, null, { preserveConveyorPair: true });
    setData(shell, 'boardReturnDestination', null);
    setData(phaseSurface, 'battleBoardReturnDestination', null);
    setData(resolutionSurface, 'battleBoardReturnDestination', null);
    setData(resolutionSurface, 'battleBoardReturnShieldRef', null);
    for (const view of lanes) {
      setData(view.shieldRail, 'boardReturnParticipant', null);
      for (const link of view.shieldRail.children ?? []) {
        const slot = link.getAttribute?.(SHIELD_SLOT_ATTR) || link.dataset.roadLane;
        setData(link, 'boardReturnTarget', null);
        setData(link, 'boardReturnEventId', null);
        setData(link, 'boardReturnDestination', null);
        link.setAttribute?.('aria-label', `Shield ${slot} → ROAD ${slot}`);
      }
    }
    const audit = auditBattleScreenModel(model);
    if (!audit.ok) throw new TypeError(`BATTLE_SCREEN_MODEL_REJECTED:${audit.defects.join(',')}`);
    if (hudSnapshot !== null) renderHud(hudSnapshot);

    const hasViewerOverride = presentationContext && typeof presentationContext === 'object' && !Array.isArray(presentationContext)
      && Object.prototype.hasOwnProperty.call(presentationContext, 'viewerParticipantId');
    const viewer = resolveViewerParticipantId(model, hasViewerOverride ? presentationContext.viewerParticipantId : defaultViewerParticipantId);
    setData(grid, 'viewerRoleResolution', viewer.status);
    setData(grid, 'viewerParticipantId', viewer.resolved);

    const boardReturn = model.boardReturn ?? null;
    setData(shell, 'mode', model.screenMode);
    setData(shell, 'eventId', model.eventId);
    setData(shell, 'phase', model.phase);
    setData(shell, 'transition', model.transition);
    setData(shell, 'motion', model.motion);
    setData(shell, 'returnIntent', model.returnIntent);
    setData(shell, 'boardReturnDestination', boardReturn?.destinationKey ?? null);
    setData(phaseSurface, 'battleScreenEventId', model.eventId);
    setData(phaseSurface, 'battleScreenPhase', model.phase);
    setData(phaseSurface, 'battleScreenInput', model.battlePhaseInputPolicy.join('|'));
    setData(phaseSurface, 'battleBoardReturnDestination', boardReturn?.destinationKey ?? null);
    setData(resolutionSurface, 'battleScreenEventId', model.eventId);
    setData(resolutionSurface, 'battleBoardReturnDestination', boardReturn?.destinationKey ?? null);
    setData(resolutionSurface, 'battleBoardReturnShieldRef', boardReturn?.shieldRef ?? null);

    const battle = model.screenMode === 'BATTLE_PHASE';
    const resultExit = !battle && model.returnIntent === 'RESULT';
    const cinematicBattle = battle && model.battlePhasePresentationMode === 'FULLSCREEN_ANIMATION';
    if (shellCreated) shell.hidden = resultExit;
    setData(shell, 'presentationMode', cinematicBattle ? 'cinematic' : 'plan');
    setData(phaseSurface, 'battlePhasePresentation', cinematicBattle ? 'FULLSCREEN_ANIMATION' : null);
    phaseSurface.hidden = !battle;
    setExternalBattleMapSuppressed(cinematicBattle);
    hud.root.hidden = cinematicBattle || resultExit;
    writeCurrentActionCue(currentActionCue, resultExit || cinematicBattle ? null : model);
    writeCausalTrace(document, causalTrace, resultExit || cinematicBattle ? null : model);
    progressGuide.hidden = cinematicBattle || resultExit;
    if (planSlot) planSlot.hidden = battle || resultExit;
    syncFieldLandmark(fieldLandmark, phaseSurface, shell, root);
    if (cinematicBattle) fieldLandmark.hidden = true;
    writeCinematicOrderRail(document, cinematicOrderRail, cinematicBattle ? model : null);
    writeCinematicDuel(global, document, cinematicDuel, cinematicBattle ? model : null, {
      viewerParticipantId: viewer.resolved,
      cinematicCharacterByParticipant: presentationContext?.cinematicCharacterByParticipant ?? defaultCinematicCharacterByParticipant,
      cinematicMotionByParticipant: presentationContext?.cinematicMotionByParticipant ?? {}
    });
    const finalStateSlots = model?.causalReturn?.processing?.finalSlots
      ?? (model?.phase === 'compare4' ? model?.actionOrderChain?.finalSlots : null)
      ?? [];
    const finalStateByParticipant = new Map(
      finalStateSlots.map(slot => [slot.playerId, slot.visualState])
    );

    for (let index = 0; index < lanes.length; index += 1) {
      const view = lanes[index];
      const lane = model.lanes[index];
      const viewerRole = viewer.resolved ? (lane.id === viewer.resolved ? 'self' : 'peer') : 'neutral';
      view.lane.dataset.participantId = lane.id;
      view.lane.dataset.role = lane.role;
      view.lane.dataset.viewerRole = viewerRole;
      setData(view.lane, 'finalState', finalStateByParticipant.get(lane.id) ?? null);
      view.lane.setAttribute?.('aria-label', viewerRole === 'self' ? `${lane.label}（自分）` : lane.label);
      view.viewerRole.hidden = viewerRole !== 'self';
      view.viewerRole.textContent = viewerRole === 'self' ? '自分' : '';
      view.viewerRole.setAttribute?.('aria-hidden', viewerRole === 'self' ? 'false' : 'true');
      view.shieldRail.dataset.participantId = lane.id;
      view.shieldRail.dataset.viewerRole = viewerRole;
      setData(view.shieldRail, 'boardReturnParticipant', boardReturn?.opponentId === lane.id ? 'true' : null);
      view.shieldRail.setAttribute?.('aria-label', `${lane.label}: Shield L/C/R と対応ROAD`);
      for (const link of view.shieldRail.children ?? []) {
        link.dataset.participantId = lane.id;
        const slot = link.getAttribute?.(SHIELD_SLOT_ATTR) || link.dataset.roadLane;
        const activeReturn = Boolean(boardReturn && boardReturn.opponentId === lane.id && boardReturn.shieldLane === slot);
        setData(link, 'boardReturnTarget', activeReturn ? 'true' : null);
        setData(link, 'boardReturnEventId', activeReturn ? boardReturn.eventId : null);
        setData(link, 'boardReturnDestination', activeReturn ? boardReturn.destinationKey : null);
        link.setAttribute?.('aria-label', `Shield ${slot} → ROAD ${slot}${activeReturn ? '、解決結果の帰着先' : ''}`);
      }
      view.name.textContent = lane.label;
      view.team.textContent = lane.team ? `TEAM ${lane.team}` : '';
      setData(view.lane, 'publicCardVisible', lane.publicCard ? 'true' : null);
      writePublicLaneCard(document, view.publicCard, lane.publicCard);
      const playerRoleLabel = PLAYER_ROLE_LABELS[lane.role] || '';
      view.role.hidden = !playerRoleLabel;
      view.role.textContent = playerRoleLabel;
      writeAfterstate(document, view.afterstate, lane.afterstate);
    }
    return model;
  }

  function syncCurrentPlayerUi(snapshot = {}) {
    if (destroyed) throw new Error('BATTLE_SCREEN_RUNTIME_DESTROYED');
    return currentPlayerUi?.sync?.(snapshot) ?? null;
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    try { focusObserver?.disconnect?.(); } catch {}
    currentPlayerUi?.destroy?.();
    setExternalBattleMapSuppressed(false);
    if (fieldLandmark?.parentNode && typeof fieldLandmark.parentNode.removeChild === 'function') fieldLandmark.parentNode.removeChild(fieldLandmark);
    if (currentActionCue?.parentNode && typeof currentActionCue.parentNode.removeChild === 'function') currentActionCue.parentNode.removeChild(currentActionCue);
    if (causalTrace?.parentNode && typeof causalTrace.parentNode.removeChild === 'function') causalTrace.parentNode.removeChild(causalTrace);
    if (progressGuide?.parentNode && typeof progressGuide.parentNode.removeChild === 'function') progressGuide.parentNode.removeChild(progressGuide);
    if (cinematicOrderRail?.parentNode && typeof cinematicOrderRail.parentNode.removeChild === 'function') cinematicOrderRail.parentNode.removeChild(cinematicOrderRail);
    disposeCinematicDuelRuntime(global, cinematicDuel);
    cinematicDuelPairState.delete(cinematicDuel);
    if (cinematicDuel?.parentNode && typeof cinematicDuel.parentNode.removeChild === 'function') cinematicDuel.parentNode.removeChild(cinematicDuel);
    if (grid?.parentNode && typeof grid.parentNode.removeChild === 'function') grid.parentNode.removeChild(grid);
    resourceHud.destroy();
    if (hud.root?.parentNode && typeof hud.root.parentNode.removeChild === 'function') hud.root.parentNode.removeChild(hud.root);
    if (shellCreated && shell?.parentNode && typeof shell.parentNode.removeChild === 'function') shell.parentNode.removeChild(shell);
    return true;
  }

  const runtime = {
    schema: RUNTIME_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    adoptedPhaseSurface: phaseAnchor.created === false,
    adoptedResolutionSurface: resolutionAnchor.created === false,
    callerShellDecorated: !adoptingExistingPhase && Boolean(callerShell),
    shell,
    planSlot,
    phaseSurface,
    externalBattleMap,
    resolutionSurface,
    fieldLandmark,
    currentActionCue,
    causalTrace,
    progressGuide,
    cinematicOrderRail,
    cinematicDuel,
    hud,
    resourceHud,
    currentPlayerUi,
    grid,
    laneSurfaces: lanes.map(view => view.lane),
    publicCardSurfaces: lanes.map(view => view.publicCard),
    shieldRails: lanes.map(view => view.shieldRail),
    renderHud,
    syncLoadCardFocusDom,
    render,
    syncCurrentPlayerUi,
    destroy
  };
  return Object.freeze(runtime);
}

export const BATTLE_SCREEN_RUNTIME = deepFreeze({
  schema: RUNTIME_SCHEMA,
  mount: 'explicit_caller_mount_only',
  presentationOnly: true,
  authority: 'NONE',
  currentActionAuthority: 'ACCEPTED_PUBLIC_MODEL_ONLY',
  causalTraceAuthority: 'MODEL_CAUSAL_RETURN_STAGES_ONLY_NO_RECALCULATION',
  causalTraceStageOrder: 'MODEL_ORDER_ONLY',
  planCurrentActionPolicy: 'GENERIC_SELECTION_LABEL_ONLY_NO_LEGAL_ACTION_INFERENCE',
  hudAuthority: 'CALLER_ONLY_FAIL_CLOSED_PLACEHOLDERS',
  resourceHudAuthority: 'CALLER_ONLY_EXISTING_RESOURCE_HUD',
  currentPlayerUiComposition: 'LIVE_MOUNT_PRESENTATION_ONLY_NO_GAMEPLAY_AUTHORITY',
  hudUnresolvedTokens: Object.freeze({ score: 'X', hate: 'XXX', turn: 'XX', loadJanken: '?' }),
  loadCardIdentityAuthority: 'CALLER_CARD_ID_ONLY__JANKEN_SECONDARY__NO_ID_INFERENCE',
  loadCardLiveProjectionSource: 'EXISTING_FOCUS_DOM_EXACT_PHYSICAL_CARD_ID_ACCEPTED_ONLY',
  loadCardFocusDomMutation: false,
  existingAnchorPolicy: 'EXPLICIT_PHASE_GETS_RUNTIME_OVERLAY__ANCESTOR_NEVER_DECORATED',
  externalPhaseShellOwner: 'CALLER',
  planSurfaceOwner: 'CALLER',
  battlePhasePresentationMode: 'FULLSCREEN_ANIMATION',
  battlePhaseNormalHudVisible: false,
  battlePhaseNormalPlanUiVisible: false,
  battlePhaseBoardSurfacePolicy: 'HIDE_EXISTING_BATTLE_MAP_AND_DISABLE_POINTERS',
  battlePhaseAllowedInputs: Object.freeze(['skip', 'public_info', 'accessibility']),
  cinematicOrderAuthority: 'MODEL_CAUSAL_RETURN_PROCESSING_ORDER_ONLY_NO_SORT_OR_INFERENCE',
  cinematicOrderVisibleCardIdText: false,
  cinematicDuelAuthority: 'MODEL_LANE_ROLE_EXACT_ONE_SOURCE_EXACT_ONE_TARGET_ONLY_NO_INFERENCE',
  cinematicDuelArt: 'EXISTING_CHARACTER_RUNTIME_PLUS_PROVISIONAL_SAASUNA_9_KEYFRAME_SHEET_NO_FORMAL_ART',
  cinematicDuelReaction: 'EXISTING_CHARACTER_RUNTIME_PLUS_PROVISIONAL_SAASUNA_STATEFUL_REACTION_NO_GAMEPLAY_STATE',
  cinematicDuelVfx: 'PROVISIONAL_ICE_WIND_IMPACT_LAYERS_PLUS_EXISTING_NEUTRAL_SHOT_NO_FORMAL_ART',
  cinematicDuelHandoff: 'ACCEPTED_CONVEYOR_TRANSITION_PLUS_CONSECUTIVE_ACCEPTED_PAIR_CONTINUITY_NO_ORDER_INFERENCE',
  saasunaBattleMotion: 'PRESENTATION_ONLY_9_KEYFRAME_SHEET_PLUS_CSS_TIMELINE_NO_GAMEPLAY_AUTHORITY',
  saasunaBattleMotionStates: SAASUNA_BATTLE_MOTION_RUNTIME.states,
  saasunaBattleMotionEffects: SAASUNA_BATTLE_MOTION_RUNTIME.effects,
  saasunaBattleMotionFormalArt: false,
  cinematicPhaseMotion: Object.freeze(['reveal', 'attack', 'ability', 'compare4', 'finisher', 'settle']),
  shieldLanePresentation: 'STRUCTURE_PLUS_EXACT_ACCEPTED_BOARD_RETURN_CUE_NO_SHIELD_STATE_INFERENCE',
  boardReturnAuthority: 'MODEL_ONLY_EXACT_OPPONENT_PLUS_SHIELD_LANE',
  shieldSlots: SHIELD_SLOTS,
  laneCount: 4,
  viewerRoleAuthority: 'CALLER_EXPLICIT_PARTICIPANT_ID_ONLY_NO_ORDER_INFERENCE',
  viewerRoleFallback: 'NEUTRAL_PUBLIC_SUMMARIES',
  viewerSelfPresentation: 'SAME_AUTHORITATIVE_PARTICIPANT_NO_DUPLICATE_PEER_ENTITY',
  productionHtmlMutationOwnedHere: false,
  formalArtOwnedHere: false
});