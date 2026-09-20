const SCHEMA = 'gameroad.battle-fe-cinematic-live.v1';
const STYLE_ID = 'gameroad-battle-fe-cinematic-live-style';
const SURFACE_ID = 'battlePhaseSurface';
const MAP_ID = 'battleMap';
const RESOLUTION_ID = 'battleResolution';
const LIVE_STAGES = new Set(['focus', 'reveal', 'read', 'compare', 'winner']);
const STAGE_LABELS = Object.freeze({
  focus: 'BATTLE START',
  reveal: 'READY',
  read: 'CHARGE',
  compare: 'IMPACT',
  winner: 'RESULT'
});
const STAGE_COPY = Object.freeze({
  focus: '対峙',
  reveal: '構え',
  read: '力を溜める',
  compare: '攻撃',
  winner: '命中・判定'
});
const SAASUNA_ASSETS = Object.freeze({
  idle: './assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_05_IDLE_GENTLE_TRANSPARENT_20260915.png',
  hit: './assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_06_SURPRISED_TRANSPARENT_20260915.png',
  result: './assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_08_HAPPY_SMILE_TRANSPARENT_20260915.png'
});

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function safeCharacterId(value) {
  const id = text(value);
  return id && id.startsWith('partner.') ? id : null;
}

function publicPlayerRows(snapshot) {
  if (!Array.isArray(snapshot?.players)) return [];
  return snapshot.players
    .filter((player) => player && typeof player === 'object')
    .map((player) => freeze({
      id: text(player.id),
      name: text(player.name, text(player.id, 'PLAYER')),
      team: text(player.team) || null,
      characterId: safeCharacterId(player.character),
    }))
    .filter((player) => player.id);
}

function presentationPlayerRows(presentation) {
  if (!Array.isArray(presentation?.players)) return [];
  return presentation.players
    .filter((player) => player && typeof player === 'object')
    .map((player) => {
      const cards = Array.isArray(player.cards)
        ? player.cards.map((card) => freeze({
          label: text(card?.label, text(card?.cardId, '—')),
          value: Number.isFinite(Number(card?.value)) ? Number(card.value) : null,
          origin: text(card?.origin) || null
        }))
        : [];
      return freeze({
        id: text(player.id),
        name: text(player.name, text(player.id, 'PLAYER')),
        team: text(player.team) || null,
        score: Number.isFinite(Number(player.score)) ? Number(player.score) : null,
        winner: player.winner === true,
        cards
      });
    })
    .filter((player) => player.id);
}

function mergePublicPlayer(player, presentationPlayer) {
  const source = presentationPlayer || player;
  return freeze({
    id: source?.id || player?.id || '',
    name: text(source?.name, text(player?.name, 'PLAYER')),
    team: text(source?.team, text(player?.team)) || null,
    characterId: player?.characterId || null,
    score: Number.isFinite(Number(source?.score)) ? Number(source.score) : null,
    winner: source?.winner === true,
    cards: Array.isArray(source?.cards) ? source.cards : []
  });
}

/**
 * Convert the already accepted battle presentation into a display-only duel.
 * This function deliberately never chooses a target, winner, order, or value.
 */
export function projectBattleFeDuelState(snapshot = {}) {
  const presentation = snapshot?.presentation;
  const players = publicPlayerRows(snapshot);
  const presentationPlayers = presentationPlayerRows(presentation);
  const presentationById = new Map(presentationPlayers.map((player) => [player.id, player]));
  const playersById = new Map(players.map((player) => [player.id, player]));
  const sourceId = text(presentation?.attackerId);
  const targetId = text(presentation?.defenderId);
  const inactive = (reason) => freeze({
    schema: SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    targetCalculation: false,
    winnerCalculation: false,
    active: false,
    reason
  });

  if (snapshot?.screen !== 'battle' || snapshot?.phase !== 'resolve') return inactive('NOT_BATTLE_RESOLUTION');
  if (!presentation || !LIVE_STAGES.has(presentation.stage)) return inactive('NO_LIVE_PRESENTATION_STAGE');
  if (!sourceId || !targetId || sourceId === targetId) return inactive('SOURCE_TARGET_UNRESOLVED');
  const source = playersById.get(sourceId);
  const target = playersById.get(targetId);
  if (!source || !target) return inactive('SOURCE_TARGET_NOT_IN_PUBLIC_PLAYER_SET');

  return freeze({
    schema: SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    targetCalculation: false,
    winnerCalculation: false,
    orderCalculation: false,
    active: true,
    stage: presentation.stage,
    stageLabel: STAGE_LABELS[presentation.stage],
    stageCopy: STAGE_COPY[presentation.stage],
    round: Number.isFinite(Number(presentation.round)) ? Number(presentation.round) : null,
    mode: text(presentation.mode, text(snapshot.mode, 'battle')),
    sourceId,
    targetId,
    lane: text(presentation.lane) || null,
    shield: text(presentation.shield) || null,
    winnerIds: Array.isArray(presentation.winnerIds)
      ? presentation.winnerIds.map((id) => text(id)).filter(Boolean)
      : [],
    left: mergePublicPlayer(source, presentationById.get(sourceId)),
    right: mergePublicPlayer(target, presentationById.get(targetId)),
    publicPlayerCount: players.length,
    transition: text(snapshot.transition) || null
  });
}

function createNode(document, tag, className = '', value = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value) node.textContent = value;
  return node;
}

function appendText(document, parent, tag, className, value) {
  const node = createNode(document, tag, className, value);
  parent.appendChild(node);
  return node;
}

function addStyle(document) {
  if (!document?.head || document.getElementById?.(STYLE_ID)) return;
  const style = createNode(document, 'style');
  style.id = STYLE_ID;
  style.textContent = `
#${SURFACE_ID}.battleFeCinematicLive{position:absolute!important;inset:0!important;z-index:46!important;display:block!important;overflow:hidden!important;pointer-events:auto!important;background:#102f22!important;color:#f9f4dc!important;font-family:Georgia,'Times New Roman',serif!important}
#${SURFACE_ID}.battleFeCinematicLive[hidden]{display:none!important}
#${SURFACE_ID}.battleFeCinematicLive:before,#${SURFACE_ID}.battleFeCinematicLive:after{display:none!important;content:none!important}
#${SURFACE_ID}.battleFeCinematicLive>.battlePhaseBackdrop,#${SURFACE_ID}.battleFeCinematicLive>.battlePhaseHeader,#${SURFACE_ID}.battleFeCinematicLive>.battlePhaseCutin,#${SURFACE_ID}.battleFeCinematicLive>.battlePhaseTarget,#${SURFACE_ID}.battleFeCinematicLive>.battlePhaseResolutionSlot{visibility:hidden!important;opacity:0!important;pointer-events:none!important}
#${SURFACE_ID} .battleFeStage{position:absolute;inset:0;overflow:hidden;isolation:isolate;background:radial-gradient(circle at 50% 48%,rgba(185,207,110,.98) 0 18%,rgba(111,161,74,.98) 52%,rgba(45,98,52,.99) 100%)}
#${SURFACE_ID} .battleFeStage:before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(30,83,51,.28),transparent 38%,rgba(4,37,24,.40)),repeating-linear-gradient(0deg,rgba(255,255,210,.045) 0 2px,transparent 2px 7px),repeating-linear-gradient(90deg,rgba(13,72,37,.06) 0 3px,transparent 3px 11px);opacity:.85}
#${SURFACE_ID} .battleFeStage:after{content:"";position:absolute;left:7%;right:7%;bottom:21%;height:18%;z-index:-1;border-radius:50%;background:radial-gradient(ellipse,rgba(242,226,141,.42),rgba(200,213,126,.16) 40%,transparent 72%);filter:blur(2px)}
#${SURFACE_ID} .battleFeHeader{position:absolute;z-index:5;top:3.5%;left:2.1%;right:2.1%;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:start;gap:clamp(8px,2vw,28px);pointer-events:none}
#${SURFACE_ID} .battleFeName{position:relative;min-width:0;padding:clamp(8px,1.3vh,14px) clamp(16px,2.4vw,34px);border:3px solid rgba(255,248,196,.95);box-shadow:0 0 0 2px rgba(27,37,25,.95),0 8px 14px rgba(10,31,18,.38);color:#fffaf0;text-shadow:0 2px 0 rgba(24,27,24,.8);font:900 clamp(17px,2.2vw,32px)/1.05 Georgia,'Times New Roman',serif;letter-spacing:.05em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#${SURFACE_ID} .battleFeName:after{content:"";position:absolute;inset:0;z-index:-1;opacity:.23;background:repeating-linear-gradient(135deg,transparent 0 6px,rgba(255,255,255,.24) 6px 8px)}
#${SURFACE_ID} .battleFeName.left{justify-self:start;min-width:min(42vw,380px);background:linear-gradient(90deg,#a5222c,#da4a42 70%,#7f1d29)}
#${SURFACE_ID} .battleFeName.right{justify-self:end;min-width:min(42vw,380px);text-align:right;background:linear-gradient(270deg,#1e58ac,#3478d8 70%,#173c84)}
#${SURFACE_ID} .battleFeName small{display:block;margin-bottom:3px;font:700 clamp(7px,.7vw,11px)/1 system-ui,sans-serif;letter-spacing:.18em;opacity:.72}
#${SURFACE_ID} .battleFeRound{align-self:center;margin-top:clamp(3px,1vh,12px);padding:8px 12px;border:2px solid rgba(255,249,194,.88);background:rgba(24,48,27,.72);box-shadow:0 5px 12px rgba(9,29,17,.35);font:900 clamp(10px,1vw,15px)/1 system-ui,sans-serif;letter-spacing:.12em;text-align:center;white-space:nowrap}
#${SURFACE_ID} .battleFeRound b{display:block;margin-top:4px;font:900 clamp(12px,1.35vw,19px)/1 Georgia,'Times New Roman',serif;letter-spacing:.04em}
#${SURFACE_ID} .battleFeDuel{position:absolute;z-index:2;left:4%;right:4%;top:20%;bottom:25%;display:grid;grid-template-columns:minmax(0,1fr) minmax(68px,13vw,180px) minmax(0,1fr);align-items:end;gap:2%;pointer-events:none}
#${SURFACE_ID} .battleFeActor{position:relative;align-self:end;display:grid;justify-items:center;min-width:0;height:100%;transform-origin:50% 100%;filter:drop-shadow(0 16px 12px rgba(15,50,25,.42));transition:filter .18s ease}
#${SURFACE_ID} .battleFeActor.left{grid-column:1}.battleFeActor.right{grid-column:3}
#${SURFACE_ID} .battleFeFigure{position:relative;width:min(28vw,270px);height:min(50vh,360px);min-height:148px;display:grid;place-items:end center;transform-origin:50% 100%}
#${SURFACE_ID} .battleFeFigure:before{content:"";position:absolute;left:50%;bottom:1%;width:84%;height:11%;transform:translateX(-50%);border-radius:50%;background:rgba(32,72,37,.48);filter:blur(3px)}
#${SURFACE_ID} .battleFeCharacterHost{position:absolute;inset:0;display:grid;place-items:end center;overflow:visible}
#${SURFACE_ID} .battleFeCharacterHost>*{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:contain!important;object-position:50% 100%!important}
#${SURFACE_ID} .battleFeCharacterHost .grtc-image{display:block;width:100%!important;height:100%!important;object-fit:contain!important;object-position:50% 100%!important}
#${SURFACE_ID} .battleFeSaasunaArt{display:block;width:100%;height:100%;object-fit:contain;object-position:50% 100%;filter:drop-shadow(0 8px 8px rgba(10,38,20,.42))}
#${SURFACE_ID} .battleFeFallback{display:grid;place-items:center;width:clamp(84px,11vw,142px);height:clamp(150px,30vh,260px);border:2px solid rgba(255,249,196,.65);border-radius:46% 46% 18% 18%;background:linear-gradient(160deg,rgba(227,231,157,.96),rgba(53,105,59,.98));color:#fffbe9;font:900 clamp(28px,4vw,54px)/1 Georgia,serif;text-shadow:0 3px 7px #173c26}
#${SURFACE_ID} .battleFeActorMeta{position:absolute;bottom:-4px;z-index:3;max-width:94%;padding:5px 12px;border:2px solid rgba(255,248,196,.75);background:rgba(30,47,28,.78);box-shadow:0 4px 10px rgba(13,41,22,.28);text-align:center;text-shadow:0 2px 4px rgba(0,0,0,.8)}
#${SURFACE_ID} .battleFeActorMeta small{display:block;font:800 8px/1 system-ui,sans-serif;letter-spacing:.16em;opacity:.82}
#${SURFACE_ID} .battleFeActorMeta b{display:block;max-width:25vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:900 clamp(12px,1.25vw,18px)/1.1 Georgia,serif}
#${SURFACE_ID} .battleFeImpact{grid-column:2;align-self:center;position:relative;height:35%;min-height:58px;display:grid;place-items:center}
#${SURFACE_ID} .battleFeImpact:before{content:"";position:absolute;width:clamp(26px,4.8vw,72px);height:clamp(16px,2.6vw,42px);border:3px solid rgba(255,252,198,.92);border-radius:50%;background:radial-gradient(ellipse,rgba(255,250,189,.95),rgba(242,198,83,.50) 44%,transparent 72%);box-shadow:0 0 25px rgba(255,228,103,.76);opacity:0;transform:scale(.42);}
#${SURFACE_ID} .battleFeImpact:after{content:"";position:absolute;width:100%;height:3px;background:linear-gradient(90deg,transparent,rgba(255,248,180,.95),transparent);box-shadow:0 -12px 0 -1px rgba(255,250,187,.65),0 12px 0 -1px rgba(255,230,133,.62);opacity:0;transform:scaleX(.2)}
#${SURFACE_ID} .battleFeStage[data-stage="compare"] .battleFeImpact:before,#${SURFACE_ID} .battleFeStage[data-stage="winner"] .battleFeImpact:before{animation:battleFeFlash 620ms ease-out both}
#${SURFACE_ID} .battleFeStage[data-stage="compare"] .battleFeImpact:after,#${SURFACE_ID} .battleFeStage[data-stage="winner"] .battleFeImpact:after{animation:battleFeSlash 620ms ease-out both}
#${SURFACE_ID} .battleFeStatus{position:absolute;z-index:6;left:2.1%;right:2.1%;bottom:3.5%;display:grid;grid-template-columns:minmax(0,1fr) minmax(110px,17vw,220px) minmax(0,1fr);gap:clamp(8px,1.2vw,18px);align-items:end;pointer-events:none}
#${SURFACE_ID} .battleFePanel{min-width:0;min-height:clamp(76px,14vh,130px);padding:clamp(8px,1.2vh,14px);border:3px solid rgba(255,248,196,.92);box-shadow:0 0 0 2px rgba(27,37,25,.9),0 8px 14px rgba(10,31,18,.36);color:#fffbed;text-shadow:0 2px 3px rgba(0,0,0,.74)}
#${SURFACE_ID} .battleFePanel.left{background:linear-gradient(145deg,rgba(167,30,41,.98),rgba(103,21,37,.96));}.battleFePanel.right{background:linear-gradient(215deg,rgba(37,102,197,.98),rgba(20,54,132,.96));text-align:right}
#${SURFACE_ID} .battleFePanelHead{display:flex;justify-content:space-between;gap:8px;align-items:baseline;border-bottom:1px solid rgba(255,248,196,.36);padding-bottom:4px;font:900 clamp(12px,1.25vw,18px)/1.1 Georgia,serif}.battleFePanel.right .battleFePanelHead{flex-direction:row-reverse}
#${SURFACE_ID} .battleFePanelHead small{font:800 8px/1 system-ui,sans-serif;letter-spacing:.1em;opacity:.84}
#${SURFACE_ID} .battleFeStats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin-top:7px}.battleFeStat{min-width:0}.battleFeStat span{display:block;font:800 7px/1 system-ui,sans-serif;letter-spacing:.08em;opacity:.78}.battleFeStat b{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:900 clamp(12px,1.4vw,21px)/1 Georgia,serif}.battleFePanel.right .battleFeStat{text-align:right}
#${SURFACE_ID} .battleFeBar{height:7px;margin-top:8px;border:1px solid rgba(255,248,196,.58);background:rgba(17,38,26,.62);overflow:hidden}.battleFeBar i{display:block;width:0;height:100%;background:linear-gradient(90deg,#ffe897,#d7f08d);box-shadow:0 0 8px rgba(255,236,140,.72);transition:width .24s ease}.battleFePanel.right .battleFeBar i{margin-left:auto}
#${SURFACE_ID} .battleFeMid{align-self:stretch;display:grid;place-items:center;min-width:0;padding:5px;color:#fff8d8;text-align:center;text-shadow:0 2px 6px rgba(22,48,27,.9)}
#${SURFACE_ID} .battleFeMid strong{display:block;font:900 clamp(11px,1.05vw,15px)/1.1 Georgia,serif;letter-spacing:.08em}.battleFeMid small{display:block;margin-top:5px;font:800 clamp(7px,.7vw,10px)/1.2 system-ui,sans-serif;letter-spacing:.08em;opacity:.84}
#${SURFACE_ID} .battleFeStage[data-stage="focus"] .battleFeActor{animation:battleFeEntry 420ms cubic-bezier(.2,.8,.25,1) both}
#${SURFACE_ID} .battleFeStage[data-stage="reveal"] .battleFeActor{animation:battleFeReady 520ms ease-out both}
#${SURFACE_ID} .battleFeStage[data-stage="read"] .battleFeActor.left{animation:battleFeCharge 620ms cubic-bezier(.2,.72,.22,1) both}
#${SURFACE_ID} .battleFeStage[data-stage="compare"] .battleFeActor.left{animation:battleFeStrike 620ms cubic-bezier(.15,.78,.2,1) both}
#${SURFACE_ID} .battleFeStage[data-stage="compare"] .battleFeActor.right{animation:battleFeTargetBrace 620ms cubic-bezier(.2,.72,.2,1) both}
#${SURFACE_ID} .battleFeStage[data-stage="winner"] .battleFeActor.right{animation:battleFeHit 700ms cubic-bezier(.18,.78,.2,1) both}
#${SURFACE_ID} .battleFeStage[data-stage="winner"] .battleFeActor.left{animation:battleFeRecover 700ms ease-out both}
#${SURFACE_ID} .battleFeStage[data-stage="winner"] .battleFeActor[data-winner="true"] .battleFeActorMeta{border-color:#fff0a0;box-shadow:0 0 0 2px rgba(255,225,113,.3),0 0 18px rgba(255,225,113,.58)}
#${SURFACE_ID} .battleFeStage[data-motion="static"] .battleFeActor,#${SURFACE_ID} .battleFeStage[data-motion="static"] .battleFeImpact:before,#${SURFACE_ID} .battleFeStage[data-motion="static"] .battleFeImpact:after{animation:none!important;transform:none!important;opacity:1!important}
@keyframes battleFeEntry{0%{transform:translateY(16px);opacity:.25}100%{transform:none;opacity:1}}
@keyframes battleFeReady{0%{transform:scale(.94);opacity:.42}65%{transform:scale(1.025)}100%{transform:none;opacity:1}}
@keyframes battleFeCharge{0%{transform:translateX(-2vw) scale(.94)}55%{transform:translateX(0) scale(1.04)}100%{transform:none}}
@keyframes battleFeStrike{0%{transform:translateX(-3vw) scale(.94)}44%{transform:translateX(0) scale(1)}64%{transform:translateX(9vw) scale(1.08)}100%{transform:none}}
@keyframes battleFeTargetBrace{0%,52%{transform:translateX(2vw) scale(.96)}68%{transform:translateX(-1vw) scale(1.01)}100%{transform:none}}
@keyframes battleFeHit{0%,48%{transform:translateX(2vw) scale(.96)}62%{transform:translateX(-2vw) rotate(-4deg) scale(.98)}100%{transform:none}}
@keyframes battleFeRecover{0%{transform:translateX(7vw) scale(1.05)}70%{transform:translateX(0) scale(1)}100%{transform:none}}
@keyframes battleFeFlash{0%,38%{opacity:0;transform:scale(.42)}55%{opacity:1;transform:scale(1.1)}82%,100%{opacity:0;transform:scale(1.45)}}
@keyframes battleFeSlash{0%,42%{opacity:0;transform:scaleX(.2)}60%{opacity:1;transform:scaleX(1)}86%,100%{opacity:0;transform:scaleX(.6)}}
@media(max-width:700px){#${SURFACE_ID} .battleFeHeader{gap:5px}#${SURFACE_ID} .battleFeName{min-width:0!important;padding:7px 9px;font-size:clamp(12px,3.6vw,20px);border-width:2px}#${SURFACE_ID} .battleFeRound{padding:5px 6px;font-size:8px}#${SURFACE_ID} .battleFeDuel{top:23%;bottom:29%;left:2%;right:2%;grid-template-columns:minmax(0,1fr) 48px minmax(0,1fr)}#${SURFACE_ID} .battleFeFigure{width:min(35vw,190px);height:min(39vh,250px);min-height:116px}#${SURFACE_ID} .battleFeActorMeta{padding:4px 7px}#${SURFACE_ID} .battleFeActorMeta b{max-width:33vw;font-size:11px}#${SURFACE_ID} .battleFeStatus{left:2%;right:2%;bottom:2%;grid-template-columns:minmax(0,1fr) 48px minmax(0,1fr);gap:5px}#${SURFACE_ID} .battleFePanel{min-height:63px;padding:6px;border-width:2px}#${SURFACE_ID} .battleFePanelHead{font-size:10px}#${SURFACE_ID} .battleFeStats{gap:2px;margin-top:5px}#${SURFACE_ID} .battleFeStat span{font-size:6px}#${SURFACE_ID} .battleFeStat b{font-size:11px}#${SURFACE_ID} .battleFeBar{height:5px;margin-top:5px}#${SURFACE_ID} .battleFeMid strong{font-size:9px}#${SURFACE_ID} .battleFeMid small{font-size:6px}}
@media(max-height:460px) and (orientation:landscape){#${SURFACE_ID} .battleFeHeader{top:2%}#${SURFACE_ID} .battleFeDuel{top:17%;bottom:28%}#${SURFACE_ID} .battleFeFigure{height:min(49vh,205px);min-height:88px}#${SURFACE_ID} .battleFeStatus{bottom:2%}#${SURFACE_ID} .battleFePanel{min-height:50px;padding:4px}#${SURFACE_ID} .battleFeStats{margin-top:3px}#${SURFACE_ID} .battleFeBar{display:none}}
@media(prefers-reduced-motion:reduce){#${SURFACE_ID} .battleFeActor,#${SURFACE_ID} .battleFeImpact:before,#${SURFACE_ID} .battleFeImpact:after{animation:none!important;transition:none!important}}
`;
  document.head.appendChild(style);
}

function stageMotion(snapshot) {
  return snapshot?.settings?.reduceMotion === true || snapshot?.settings?.lowPerf === true ? 'static' : 'allowed';
}

function displayValue(value) {
  return value == null || value === '' ? '—' : String(value);
}

function cardValue(player) {
  const card = Array.isArray(player?.cards) ? player.cards[0] : null;
  return card ? text(card.label, '—') : '—';
}

function barValue(player) {
  const score = Number(player?.score);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function createActor(document, view, role) {
  const actor = createNode(document, 'div', `battleFeActor ${role}`);
  actor.dataset.role = role;
  actor.dataset.participantId = role === 'left' ? view.sourceId : view.targetId;
  const player = role === 'left' ? view.left : view.right;
  actor.dataset.winner = view.winnerIds.includes(player.id) ? 'true' : 'false';
  const figure = createNode(document, 'div', 'battleFeFigure');
  const host = createNode(document, 'div', 'battleFeCharacterHost');
  host.dataset.characterId = player.characterId || '';
  host.dataset.participantId = player.id;
  figure.appendChild(host);
  const meta = createNode(document, 'div', 'battleFeActorMeta');
  appendText(document, meta, 'small', '', role === 'left' ? 'ATTACKER' : 'DEFENDER');
  appendText(document, meta, 'b', '', player.name);
  actor.append(figure, meta);
  return { actor, figure, host, player, role };
}

function createStatPanel(document, player, role, view) {
  const panel = createNode(document, 'section', `battleFePanel ${role}`);
  panel.dataset.participantId = player.id;
  const head = createNode(document, 'div', 'battleFePanelHead');
  appendText(document, head, 'b', '', player.name);
  appendText(document, head, 'small', '', player.team ? `TEAM ${player.team}` : role === 'left' ? 'PLAYER 1' : 'PLAYER 2');
  const stats = createNode(document, 'div', 'battleFeStats');
  const values = [
    ['POWER', displayValue(player.score)],
    ['CARD', cardValue(player)],
    ['TARGET', role === 'left' ? `${displayValue(view.lane)} / ${displayValue(view.shield)}` : displayValue(view.round)]
  ];
  for (const [label, value] of values) {
    const stat = createNode(document, 'div', 'battleFeStat');
    appendText(document, stat, 'span', '', label);
    appendText(document, stat, 'b', '', value);
    stats.appendChild(stat);
  }
  const bar = createNode(document, 'div', 'battleFeBar');
  const fill = createNode(document, 'i');
  fill.style.width = `${barValue(player)}%`;
  fill.setAttribute('aria-hidden', 'true');
  bar.appendChild(fill);
  panel.append(head, stats, bar);
  return panel;
}

function createStage(document, view) {
  const stage = createNode(document, 'div', 'battleFeStage');
  stage.dataset.stage = view.stage;
  stage.dataset.motion = view.motion;
  stage.dataset.sourceId = view.sourceId;
  stage.dataset.targetId = view.targetId;
  stage.setAttribute('role', 'dialog');
  stage.setAttribute('aria-label', `${view.left.name} 対 ${view.right.name}`);

  const header = createNode(document, 'header', 'battleFeHeader');
  const leftName = createNode(document, 'div', 'battleFeName left');
  const rightName = createNode(document, 'div', 'battleFeName right');
  appendText(document, leftName, 'small', '', 'ATTACKER');
  appendText(document, leftName, 'span', '', view.left.name);
  appendText(document, rightName, 'small', '', 'DEFENDER');
  appendText(document, rightName, 'span', '', view.right.name);
  const round = createNode(document, 'div', 'battleFeRound');
  appendText(document, round, 'span', '', STAGE_LABELS[view.stage]);
  appendText(document, round, 'b', '', view.round == null ? 'BATTLE' : `ROUND ${view.round}`);
  header.append(leftName, round, rightName);

  const duel = createNode(document, 'div', 'battleFeDuel');
  const left = createActor(document, view, 'left');
  const right = createActor(document, view, 'right');
  const impact = createNode(document, 'div', 'battleFeImpact');
  impact.dataset.presentationOnly = 'true';
  duel.append(left.actor, impact, right.actor);

  const status = createNode(document, 'div', 'battleFeStatus');
  const mid = createNode(document, 'div', 'battleFeMid');
  appendText(document, mid, 'strong', '', view.stageCopy);
  appendText(document, mid, 'small', '', view.winnerIds.length ? `WIN: ${view.winnerIds.join(' / ')}` : 'PUBLIC PRESENTATION');
  status.append(createStatPanel(document, view.left, 'left', view), mid, createStatPanel(document, view.right, 'right', view));
  stage.append(header, duel, status);
  return { stage, actors: [left, right] };
}

function saasunaAssetFor(stage, role) {
  if (role === 'right' && stage === 'winner') return SAASUNA_ASSETS.hit;
  if (role === 'left' && stage === 'winner') return SAASUNA_ASSETS.result;
  return SAASUNA_ASSETS.idle;
}

function appendFallback(document, host, player) {
  const fallback = createNode(document, 'div', 'battleFeFallback', text(player?.name).slice(0, 1) || '?');
  fallback.dataset.visualState = 'presentation-fallback';
  host.appendChild(fallback);
}

function disposeMounts(global, mounts) {
  const runtime = global?.GameRoadThreeCharRuntime;
  for (const mount of mounts) {
    if (mount?.kind === 'runtime' && mount.handle && typeof runtime?.unmount === 'function') {
      try { runtime.unmount(mount.handle); } catch {}
    }
  }
  mounts.splice(0, mounts.length);
}

function mountActorVisual(global, document, actor, stage, mounts, token) {
  const characterId = actor.player.characterId;
  if (!characterId) {
    appendFallback(document, actor.host, actor.player);
    return;
  }
  if (characterId === 'partner.saasuna') {
    const image = createNode(document, 'img', 'battleFeSaasunaArt');
    image.src = saasunaAssetFor(stage, actor.role);
    image.alt = actor.player.name;
    image.decoding = 'async';
    image.draggable = false;
    image.dataset.characterId = characterId;
    image.dataset.presentationOnly = 'true';
    actor.host.appendChild(image);
    mounts.push({ kind: 'asset', node: image });
    return;
  }
  const runtime = global?.GameRoadThreeCharRuntime;
  if (typeof runtime?.mount !== 'function') {
    appendFallback(document, actor.host, actor.player);
    return;
  }
  let pending;
  try {
    pending = runtime.mount(actor.host, {
      characterId,
      state: 'idle',
      assetMode: 'embedded',
      performance: 'normal',
      allowNetwork: false
    });
  } catch {
    appendFallback(document, actor.host, actor.player);
    return;
  }
  Promise.resolve(pending).then((handle) => {
    if (!handle || actor.host.dataset.mountToken !== token) {
      if (handle && typeof runtime.unmount === 'function') {
        try { runtime.unmount(handle); } catch {}
      }
      return;
    }
    if (handle.status === 'unknown-character') {
      if (typeof runtime.unmount === 'function') {
        try { runtime.unmount(handle); } catch {}
      }
      appendFallback(document, actor.host, actor.player);
      return;
    }
    mounts.push({ kind: 'runtime', handle });
    const state = actor.role === 'right' && stage === 'winner'
      ? 'hit'
      : (actor.role === 'left' && (stage === 'compare' || stage === 'winner') ? 'attack' : 'idle');
    try {
      runtime.setState?.(handle, state, {
        facing: actor.role === 'left' ? 'right' : 'left',
        performance: 'normal'
      });
    } catch {}
  }).catch(() => appendFallback(document, actor.host, actor.player));
}

export function mountBattleFeCinematicLiveAdapter(global = globalThis, options = {}) {
  const document = global?.document;
  if (!document || typeof document.createElement !== 'function') return null;
  const surface = options.surface || document.getElementById?.(SURFACE_ID);
  const map = options.map || document.getElementById?.(MAP_ID);
  const resolution = options.resolution || document.getElementById?.(RESOLUTION_ID);
  if (!surface) return null;
  addStyle(document);

  let stage = surface.querySelector?.('.battleFeStage');
  if (!stage) {
    stage = createNode(document, 'div', 'battleFeStage');
    surface.appendChild(stage);
  }
  let destroyed = false;
  let currentView = null;
  let mounts = [];
  let token = 0;
  const originalMap = map?.style ? Object.freeze({ visibility: map.style.visibility || '', pointerEvents: map.style.pointerEvents || '' }) : null;

  function restoreBoard() {
    token += 1;
    surface.hidden = true;
    surface.classList.remove('battleFeCinematicLive');
    if (map?.style && originalMap) {
      map.style.visibility = originalMap.visibility;
      map.style.pointerEvents = originalMap.pointerEvents;
      map.removeAttribute?.('aria-hidden');
    }
    if (resolution) resolution.hidden = false;
    disposeMounts(global, mounts);
    stage.replaceChildren();
    currentView = null;
  }

  function render(snapshot = {}) {
    if (destroyed) throw new Error('BATTLE_FE_CINEMATIC_ADAPTER_DESTROYED');
    const view = projectBattleFeDuelState(snapshot);
    if (!view.active) {
      if (snapshot?.presentation?.stage === 'settle' && currentView) {
        surface.classList.add('battleFeCinematicLive');
        surface.hidden = false;
        surface.dataset.stage = 'winner';
        surface.dataset.returningToBoard = 'true';
        if (map?.style) {
          map.style.visibility = 'hidden';
          map.style.pointerEvents = 'none';
          map.setAttribute?.('aria-hidden', 'true');
        }
        return currentView;
      }
      restoreBoard();
      return view;
    }
    currentView = view;
    token += 1;
    disposeMounts(global, mounts);
    const rendered = createStage(document, { ...view, motion: stageMotion(snapshot) });
    stage.replaceWith(rendered.stage);
    stage = rendered.stage;
    stage.dataset.eventId = `${view.round ?? 'x'}:${view.sourceId}:${view.targetId}:${view.stage}`;
    surface.classList.add('battleFeCinematicLive');
    surface.hidden = false;
    surface.dataset.stage = view.stage;
    surface.dataset.sourceId = view.sourceId;
    surface.dataset.targetId = view.targetId;
    surface.dataset.presentationOnly = 'true';
    surface.dataset.gameplayAuthority = 'false';
    delete surface.dataset.returningToBoard;
    if (map?.style) {
      map.style.visibility = 'hidden';
      map.style.pointerEvents = 'none';
      map.setAttribute?.('aria-hidden', 'true');
    }
    for (const actor of rendered.actors) {
      actor.host.dataset.mountToken = String(token);
      mountActorVisual(global, document, actor, view.stage, mounts, String(token));
    }
    return view;
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    restoreBoard();
    delete global.__GAMEROAD_BATTLE_FE_CINEMATIC__;
    return true;
  }

  const api = Object.freeze({
    schema: SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    targetCalculation: false,
    winnerCalculation: false,
    render,
    snapshot: () => currentView,
    destroy
  });
  global.__GAMEROAD_BATTLE_FE_CINEMATIC__ = api;
  return api;
}

if (typeof document !== 'undefined') {
  queueMicrotask(() => {
    try { mountBattleFeCinematicLiveAdapter(globalThis); } catch (error) {
      globalThis.__GAMEROAD_BATTLE_FE_CINEMATIC_ERROR__ = String(error?.message || error);
    }
  });
}
