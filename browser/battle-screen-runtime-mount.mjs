import { auditBattleScreenModel } from './battle-screen-presentation-core.mjs';

const RUNTIME_SCHEMA = 'gameroad.battle-screen-runtime-mount.v1';
const STYLE_ID = 'gameroad-battle-screen-runtime-r1-style';
const SHELL_ATTR = 'data-gr-battle-screen';
const GRID_ATTR = 'data-battle-screen-causal-grid';
const PLAN_SLOT_ATTR = 'data-battle-plan-slot';
const LANE_ATTR = 'data-battle-screen-lane';
const HUD_ATTR = 'data-battle-r75-hud';
const PROGRESS_GUIDE_ATTR = 'data-battle-progress-guide';
const FIELD_LANDMARK_ATTR = 'data-battle-field-landmark';
const BATTLE_FIELD_IDS = Object.freeze(['FIELD-01', 'FIELD-02', 'FIELD-03', 'FIELD-04', 'FIELD-05', 'FIELD-08', 'FIELD-09']);
const PLAYER_ROLE_LABELS = Object.freeze({
  source: '攻撃',
  target: '対象'
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
[${SHELL_ATTR}="1"] .grBattleHudPlayedCard:nth-of-type(4n+1){transform:translateY(4px) rotate(-4deg)}
[${SHELL_ATTR}="1"] .grBattleHudPlayedCard:nth-of-type(4n+3){transform:translateY(4px) rotate(4deg)}
[${SHELL_ATTR}="1"] .grBattleHudChainArrow{flex:0 0 auto;font-weight:900;opacity:.78}
[${SHELL_ATTR}="1"] .grBattleHudLoad{flex:0 0 auto;display:grid;place-items:center;align-content:center;width:clamp(50px,6.8vw,70px);height:clamp(40px,6vw,62px);border-radius:8px;border:1px solid rgba(255,233,158,.66);background:linear-gradient(180deg,rgba(108,88,38,.86),rgba(35,42,26,.80));box-shadow:0 5px 16px rgba(0,0,0,.22)}
[${SHELL_ATTR}="1"] .grBattleHudLoad small{font-size:clamp(8px,.72vw,10px);font-weight:900;letter-spacing:.12em;opacity:.72}
[${SHELL_ATTR}="1"] .grBattleHudLoad b{font-size:clamp(14px,1.6vw,20px);line-height:1.1}
[${SHELL_ATTR}="1"] [${PLAN_SLOT_ATTR}]{position:absolute;inset:0;z-index:2;min-width:0;min-height:0}
[${SHELL_ATTR}="1"] #battlePhaseSurface{position:absolute;inset:0;z-index:3;overflow:hidden;background:radial-gradient(ellipse at 75% 33%,rgba(220,246,217,.24),transparent 29%),radial-gradient(ellipse at 18% 78%,rgba(96,145,87,.38),transparent 31%),linear-gradient(180deg,rgba(111,178,166,.30) 0%,rgba(62,126,104,.22) 43%,rgba(22,69,54,.58) 100%)}
[${SHELL_ATTR}="1"] #battlePhaseSurface::before{content:"";position:absolute;z-index:-2;left:-7%;right:-6%;top:41%;bottom:-31%;clip-path:polygon(0 31%,12% 19%,23% 26%,36% 10%,48% 24%,61% 8%,74% 25%,88% 14%,100% 29%,100% 100%,0 100%);background:linear-gradient(180deg,rgba(69,124,83,.78),rgba(42,96,64,.92) 42%,rgba(22,62,47,.98));border-top:1px solid rgba(214,250,211,.16);transform:perspective(560px) rotateX(5deg);transform-origin:50% 0}
[${SHELL_ATTR}="1"] #battlePhaseSurface::after{content:"";position:absolute;z-index:-1;left:4%;width:42%;bottom:5%;height:29%;border-radius:50%;background:radial-gradient(ellipse at 50% 45%,rgba(159,197,119,.30),rgba(49,101,67,.20) 55%,transparent 70%);border-top:1px solid rgba(225,255,214,.10);transform:perspective(380px) rotateX(62deg);transform-origin:50% 100%}
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
@media(max-width:540px) and (orientation:portrait){[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}]{left:2px;top:82px;bottom:auto;width:72px;height:90px;opacity:.13}}
@media(max-height:420px) and (orientation:landscape){[${SHELL_ATTR}="1"] [${FIELD_LANDMARK_ATTR}]{left:4px;bottom:4px;width:120px;height:76px;opacity:.16}}
[${SHELL_ATTR}="1"] [${GRID_ATTR}]{position:absolute;z-index:4;top:clamp(68px,12vh,92px);right:5%;bottom:clamp(54px,10vh,82px);left:52%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:clamp(8px,1.5vw,18px);align-items:stretch;overflow:visible;pointer-events:none}
[${SHELL_ATTR}="1"] [${GRID_ATTR}]::before{content:"";position:absolute;z-index:-1;left:50%;top:50%;width:clamp(56px,8vw,104px);aspect-ratio:1;transform:translate(-50%,-50%) rotate(45deg);clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);background:radial-gradient(circle at 34% 30%,rgba(249,255,229,.82),rgba(171,211,127,.72) 19%,rgba(67,126,85,.76) 53%,rgba(16,60,50,.94) 76%);border:1px solid rgba(237,255,217,.52);box-shadow:0 0 0 8px rgba(20,68,52,.18),0 15px 36px rgba(0,0,0,.28)}
[${SHELL_ATTR}="1"] [${LANE_ATTR}]{position:relative;min-width:0;overflow:hidden;display:grid;grid-template-rows:auto 1fr auto;gap:8px;padding:clamp(7px,1.1vw,13px);border:1px solid rgba(219,241,207,.24);border-radius:clamp(9px,1.4vw,16px);background:linear-gradient(180deg,rgba(19,56,49,.76),rgba(6,25,24,.58));box-shadow:0 10px 22px rgba(2,20,17,.20),inset 0 0 0 1px rgba(255,255,255,.025);transition:transform 180ms ease,opacity 180ms ease,border-color 180ms ease,background 180ms ease}
[${SHELL_ATTR}="1"] [${LANE_ATTR}]:nth-child(1){left:-10%;top:9%}
[${SHELL_ATTR}="1"] [${LANE_ATTR}]:nth-child(2){left:5%;top:-5%}
[${SHELL_ATTR}="1"] [${LANE_ATTR}]:nth-child(3){left:5%;top:5%}
[${SHELL_ATTR}="1"] [${LANE_ATTR}]:nth-child(4){left:-10%;top:-9%}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-role="source"]{transform:translateY(-1.4%);border-color:rgba(165,230,213,.58);background:linear-gradient(180deg,rgba(35,90,72,.82),rgba(6,31,26,.62))}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-role="target"]{border-color:rgba(246,198,145,.58);background:linear-gradient(180deg,rgba(105,67,38,.74),rgba(31,32,20,.62))}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-role="winner"]{transform:translateY(-2.2%);border-color:rgba(255,232,145,.72);background:linear-gradient(180deg,rgba(111,91,35,.78),rgba(27,38,23,.58));box-shadow:0 0 28px rgba(237,202,102,.18),0 10px 22px rgba(2,20,17,.20),inset 0 0 0 1px rgba(255,245,196,.10)}
[${SHELL_ATTR}="1"] .grBattleLaneIdentity{min-width:0}.grBattleLaneIdentity b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(13px,1.25vw,16px);letter-spacing:.04em}.grBattleLaneIdentity small{display:block;margin-top:2px;opacity:.72;font-size:clamp(11px,.9vw,13px)}
[${SHELL_ATTR}="1"] .grBattleLaneRole{align-self:center;justify-self:center;padding:5px 7px;border-radius:999px;border:1px solid rgba(230,248,218,.24);background:rgba(3,20,17,.54);font-size:clamp(11px,.9vw,13px);font-weight:800;letter-spacing:.08em;text-transform:uppercase}
[${SHELL_ATTR}="1"] .grBattleLaneAfterstate{align-self:end;display:grid;gap:4px;min-height:20px;font-size:clamp(11px,.92vw,13px);line-height:1.35;color:#e8f1df}
[${SHELL_ATTR}="1"] .grBattleLaneAfterstate span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 5px;border-radius:6px;background:rgba(2,19,16,.60);border:1px solid rgba(225,244,215,.12)}
[${SHELL_ATTR}="1"] #battleResolution{position:absolute;z-index:7;left:50%;bottom:clamp(8px,2vh,18px);transform:translateX(-50%);max-width:min(72vw,760px);min-height:24px;pointer-events:none;text-align:center}
[${SHELL_ATTR}="1"][data-motion="static_only"] [${LANE_ATTR}]{transition:none!important;transform:none!important}
@media(max-width:720px){[${SHELL_ATTR}="1"] [${GRID_ATTR}]{left:38%;right:3%}}
@media(max-width:540px){[${SHELL_ATTR}="1"] [${GRID_ATTR}]{left:4px;right:4px;gap:3px;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}[${SHELL_ATTR}="1"] [${LANE_ATTR}]{left:0!important;top:0!important;padding:7px 6px;border-radius:8px}.grBattleLaneRole{max-width:100%;overflow:hidden;text-overflow:ellipsis}[${SHELL_ATTR}="1"] .grBattleHudMetric{min-width:42px;padding:3px 5px}[${SHELL_ATTR}="1"] .grBattleHudPlayedCard{width:26px;height:34px}[${SHELL_ATTR}="1"] .grBattleHudLoad{width:44px;height:38px}}
@media(max-width:540px) and (orientation:portrait){[${SHELL_ATTR}="1"] [${GRID_ATTR}]{top:76px;right:8px;bottom:96px;left:8px;gap:6px;grid-template-columns:minmax(0,1fr);grid-template-rows:repeat(4,minmax(0,1fr))}[${SHELL_ATTR}="1"] [${GRID_ATTR}]::before{display:none}[${SHELL_ATTR}="1"] [${LANE_ATTR}]{grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto minmax(20px,auto);column-gap:8px;row-gap:3px;padding:8px 10px;transform:none!important}[${SHELL_ATTR}="1"] .grBattleLaneIdentity{grid-column:1;grid-row:1}[${SHELL_ATTR}="1"] .grBattleLaneRole{grid-column:2;grid-row:1 / span 2;align-self:center;justify-self:end}[${SHELL_ATTR}="1"] .grBattleLaneAfterstate{grid-column:1;grid-row:2;align-self:end;min-height:0}[${SHELL_ATTR}="1"] #battleResolution{left:8px;right:8px;bottom:12px;transform:none;max-width:none}[${SHELL_ATTR}="1"] [${PROGRESS_GUIDE_ATTR}]{left:8px;top:22%;bottom:27%;width:auto;height:auto;flex-direction:column;justify-content:space-between;gap:5px;font-size:10px;letter-spacing:.09em}[${SHELL_ATTR}="1"] [${PROGRESS_GUIDE_ATTR}] .grBattleProgressArrow{width:2px;min-width:2px;min-height:42px;flex:1 1 auto;background:linear-gradient(180deg,rgba(255,226,129,.88),rgba(219,241,207,.30))}[${SHELL_ATTR}="1"] [${PROGRESS_GUIDE_ATTR}] .grBattleProgressArrow::before{content:"▲";left:50%;top:-2px;transform:translate(-50%,-45%)}}
@media(max-height:420px){[${SHELL_ATTR}="1"] [${GRID_ATTR}]{top:48px;bottom:34px}[${SHELL_ATTR}="1"] .grBattleScreenTop{height:46px;padding-top:3px}.grBattleLaneAfterstate{gap:2px}[${SHELL_ATTR}="1"] .grBattleHudPlayedCard{height:32px}[${SHELL_ATTR}="1"] .grBattleHudLoad{height:34px}[${SHELL_ATTR}="1"] [${PROGRESS_GUIDE_ATTR}]{top:50px;left:10px;width:min(30vw,200px);font-size:9px}}
@media(max-height:470px) and (orientation:landscape){.battle .royalUsageStrip{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;width:151px!important;gap:2px!important}}
@media(prefers-reduced-motion:reduce){[${SHELL_ATTR}="1"] [${LANE_ATTR}]{transition:none!important;transform:none!important}[${SHELL_ATTR}="1"] .grBattleHudPlayedCard{transform:none!important}}
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

function createLane(document, participantIndex) {
  const lane = createNode(document, 'article', 'grBattleLane');
  lane.setAttribute?.(LANE_ATTR, String(participantIndex + 1));
  lane.dataset.role = 'idle';
  const identity = createNode(document, 'div', 'grBattleLaneIdentity');
  const name = createNode(document, 'b');
  const team = createNode(document, 'small');
  identity.appendChild(name);
  identity.appendChild(team);
  const role = createNode(document, 'div', 'grBattleLaneRole');
  role.hidden = true;
  const afterstate = createNode(document, 'div', 'grBattleLaneAfterstate');
  lane.appendChild(identity);
  lane.appendChild(role);
  lane.appendChild(afterstate);
  return { lane, name, team, role, afterstate };
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

function normalizeHudSnapshot(snapshot = {}) {
  const source = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};
  const score = authoritativeText(source.score, 'X');
  const hate = authoritativeText(source.hate, 'XXX');
  const turn = authoritativeText(source.turn, 'XX');
  const hand = LOAD_JANKEN_LABELS[source.loadJanken] ?? '?';
  const playedCards = Array.isArray(source.playedCards)
    ? source.playedCards.filter(card => card && typeof card === 'object').map((card, index) => ({
        cardId: typeof card.cardId === 'string' && card.cardId ? card.cardId : `played-${index + 1}`,
        label: typeof card.label === 'string' && card.label ? card.label : (typeof card.cardId === 'string' ? card.cardId : '?')
      }))
    : [];
  return {
    score,
    hate,
    turn,
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
  load.appendChild(createNode(document, 'small', '', 'LOAD'));
  const loadValue = createNode(document, 'b');
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
  return { root, settingsButton, scoreValue, chain, loadValue, hateValue, turnValue };
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
  clearChildren(hud.chain);
  model.playedCards.forEach((card, index) => {
    if (index > 0) hud.chain.appendChild(createNode(document, 'span', 'grBattleHudChainArrow', '▷'));
    const cardNode = createNode(document, 'span', 'grBattleHudPlayedCard', card.label);
    cardNode.dataset.cardId = card.cardId;
    cardNode.dataset.order = String(index + 1);
    hud.chain.appendChild(cardNode);
  });
  setData(hud.root, 'scoreResolved', model.score.resolved);
  setData(hud.root, 'hateResolved', model.hate.resolved);
  setData(hud.root, 'turnResolved', model.turn.resolved);
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

  let shell = options.shell ?? null;
  let shellCreated = false;
  if (!shell) {
    shell = createNode(document, 'section', 'grBattleScreenShell');
    shell.setAttribute?.(SHELL_ATTR, '1');
    if (validRoot(root)) root.appendChild(shell);
    shellCreated = true;
  } else {
    shell.setAttribute?.(SHELL_ATTR, '1');
  }

  const hud = createHud(document, shell);
  let lastHudSnapshot = writeHud(document, hud, options.hud);

  let planSlot = null;
  if (shellCreated) {
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

  const fieldLandmark = createFieldLandmark(document);
  phaseSurface.appendChild(fieldLandmark);
  syncFieldLandmark(fieldLandmark, phaseSurface, shell, root);

  const progressGuide = createProgressGuide(document);
  phaseSurface.appendChild(progressGuide);

  const grid = createNode(document, 'div', 'grBattleCausalGrid');
  grid.setAttribute?.(GRID_ATTR, '');
  grid.setAttribute?.('aria-label', '4人バトル比較');
  phaseSurface.appendChild(grid);
  const lanes = Array.from({ length: 4 }, (_, index) => createLane(document, index));
  for (const lane of lanes) grid.appendChild(lane.lane);

  const resolutionAnchor = ensureAnchor(document, phaseSurface, providedResolution, 'battleResolution', 'div');
  const resolutionSurface = resolutionAnchor.node;
  resolutionSurface.dataset.battleScreenResolutionAuthority = 'external_existing_presentation_consumer';

  let destroyed = false;
  function renderHud(snapshot = {}) {
    if (destroyed) throw new Error('BATTLE_SCREEN_RUNTIME_DESTROYED');
    lastHudSnapshot = writeHud(document, hud, snapshot);
    return lastHudSnapshot;
  }

  function render(model, hudSnapshot = null) {
    if (destroyed) throw new Error('BATTLE_SCREEN_RUNTIME_DESTROYED');
    const audit = auditBattleScreenModel(model);
    if (!audit.ok) throw new TypeError(`BATTLE_SCREEN_MODEL_REJECTED:${audit.defects.join(',')}`);
    if (hudSnapshot !== null) renderHud(hudSnapshot);

    setData(shell, 'mode', model.screenMode);
    setData(shell, 'eventId', model.eventId);
    setData(shell, 'phase', model.phase);
    setData(shell, 'transition', model.transition);
    setData(shell, 'motion', model.motion);
    setData(shell, 'returnIntent', model.returnIntent);
    setData(phaseSurface, 'battleScreenEventId', model.eventId);
    setData(phaseSurface, 'battleScreenPhase', model.phase);
    setData(phaseSurface, 'battleScreenInput', model.battlePhaseInputPolicy.join('|'));
    setData(resolutionSurface, 'battleScreenEventId', model.eventId);

    const battle = model.screenMode === 'BATTLE_PHASE';
    const resultExit = !battle && model.returnIntent === 'RESULT';
    if (shellCreated) shell.hidden = resultExit;
    phaseSurface.hidden = !battle;
    hud.root.hidden = !battle;
    if (planSlot) planSlot.hidden = battle || resultExit;
    syncFieldLandmark(fieldLandmark, phaseSurface, shell, root);

    for (let index = 0; index < lanes.length; index += 1) {
      const view = lanes[index];
      const lane = model.lanes[index];
      view.lane.dataset.participantId = lane.id;
      view.lane.dataset.role = lane.role;
      view.name.textContent = lane.label;
      view.team.textContent = lane.team ? `TEAM ${lane.team}` : '';
      const playerRoleLabel = PLAYER_ROLE_LABELS[lane.role] || '';
      view.role.hidden = !playerRoleLabel;
      view.role.textContent = playerRoleLabel;
      writeAfterstate(document, view.afterstate, lane.afterstate);
    }
    return model;
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    if (fieldLandmark?.parentNode && typeof fieldLandmark.parentNode.removeChild === 'function') fieldLandmark.parentNode.removeChild(fieldLandmark);
    if (progressGuide?.parentNode && typeof progressGuide.parentNode.removeChild === 'function') progressGuide.parentNode.removeChild(progressGuide);
    if (grid?.parentNode && typeof grid.parentNode.removeChild === 'function') grid.parentNode.removeChild(grid);
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
    shell,
    planSlot,
    phaseSurface,
    resolutionSurface,
    fieldLandmark,
    progressGuide,
    hud,
    grid,
    laneSurfaces: lanes.map(view => view.lane),
    renderHud,
    render,
    destroy
  };
  return Object.freeze(runtime);
}

export const BATTLE_SCREEN_RUNTIME = deepFreeze({
  schema: RUNTIME_SCHEMA,
  mount: 'explicit_caller_mount_only',
  presentationOnly: true,
  authority: 'NONE',
  hudAuthority: 'CALLER_ONLY_FAIL_CLOSED_PLACEHOLDERS',
  hudUnresolvedTokens: Object.freeze({ score: 'X', hate: 'XXX', turn: 'XX', loadJanken: '?' }),
  existingAnchorPolicy: 'ADOPT_IF_EXPLICIT_OR_PRESENT__NEVER_DUPLICATE_ID',
  planSurfaceOwner: 'CALLER',
  laneCount: 4,
  productionHtmlMutationOwnedHere: false,
  formalArtOwnedHere: false
});