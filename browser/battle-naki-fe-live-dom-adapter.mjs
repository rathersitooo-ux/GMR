const GLOBAL_KEY = 'GAMEROAD_BATTLE_CINEMATIC_LIVE_ADAPTER';
const PARTICIPANT_MARKER_SELECTOR = '[data-board-controlled-character]';
const ELEMENT_KEYS = new Set(['fire', 'water', 'wind', 'earth', 'light', 'dark', 'arcane']);
const LIVE_PRESENTATION_STAGES = new Set(['focus', 'reveal', 'read', 'compare', 'winner', 'settle', 'attack', 'ability']);
const RETURN_GRACE_MS = 240;
const ACTION_FAILSAFE_MS = 9000;

const ELEMENT_COLORS = Object.freeze({
  fire: '#ff735c', water: '#64c5ff', wind: '#92edc2', earth: '#e9c675',
  light: '#ffe899', dark: '#c28aff', arcane: '#ff9ce7'
});
const ELEMENT_ROWS = Object.freeze({ fire: 0, water: 1, wind: 2, earth: 3, light: 4, dark: 5, arcane: 6 });

function exactString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function displayString(value) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function getAttr(node, name) {
  try { return node?.getAttribute?.(name) ?? null; } catch { return null; }
}

function exactDatasetOrAttribute(node, datasetKeys, attributeNames) {
  for (const key of datasetKeys) {
    const value = exactString(node?.dataset?.[key]);
    if (value) return value;
  }
  for (const name of attributeNames) {
    const value = exactString(getAttr(node, name));
    if (value) return value;
  }
  return null;
}

function stageOf(resolution) {
  const nested = resolution?.querySelector?.('[data-stage],[data-battle-stage],[data-phase]') ?? null;
  const raw = exactDatasetOrAttribute(resolution, ['stage', 'battleStage', 'phase'], ['data-stage', 'data-battle-stage', 'data-phase'])
    ?? exactDatasetOrAttribute(nested, ['stage', 'battleStage', 'phase'], ['data-stage', 'data-battle-stage', 'data-phase']);
  const classStage = resolution?.classList?.contains?.('attack') ? 'attack'
    : resolution?.classList?.contains?.('ability') ? 'ability' : null;
  const stageValue = raw ?? classStage;
  if (!stageValue) return null;
  const stage = stageValue.toLowerCase();
  return LIVE_PRESENTATION_STAGES.has(stage) ? stage : null;
}

function actionPhaseOf(stage) {
  return stage === 'ability' ? 'ability' : 'attack';
}

function causalPhaseOf(stage) {
  if (stage === 'focus' || stage === 'reveal') return 'stance';
  if (stage === 'read') return 'anticipation';
  if (stage === 'compare' || stage === 'attack' || stage === 'ability') return 'release';
  if (stage === 'winner') return 'reaction';
  if (stage === 'settle') return 'return';
  return null;
}

function rowLabel(row, index) {
  const fromData = displayString(row?.dataset?.playerName ?? row?.dataset?.name);
  if (fromData) return fromData;
  const named = row?.querySelector?.('[data-player-name],.player-name,.playerName,.name,strong,b');
  const fromNode = displayString(named?.textContent);
  return fromNode || 'P' + String(index + 1);
}

function rowIdentity(row) {
  return exactDatasetOrAttribute(row, ['participantId', 'playerId'], ['data-participant-id', 'data-player-id']);
}

function markerIdentity(marker) {
  return exactDatasetOrAttribute(marker, ['participantId', 'player'], ['data-participant-id', 'data-player']);
}

function findFourParticipants(doc, rows) {
  const directIds = rows.map(rowIdentity);
  if (directIds.every(Boolean) && new Set(directIds).size === 4) return directIds;
  const markers = Array.from(doc.querySelectorAll?.(PARTICIPANT_MARKER_SELECTOR) ?? []);
  if (markers.length !== 4) return null;
  const markerIds = markers.map(markerIdentity);
  if (markerIds.some(id => !id) || new Set(markerIds).size !== 4) return null;
  return markerIds;
}

function selectedTargetId(select, participants) {
  const options = Array.from(select?.options ?? []);
  const option = options.find(row => row?.selected === true) ?? options.find(row => row?.value === select?.value) ?? null;
  const explicit = exactDatasetOrAttribute(option, ['participantId', 'playerId'], ['data-participant-id', 'data-player-id']);
  if (explicit && participants.some(row => row.id === explicit)) return explicit;
  const value = exactString(select?.value);
  if (value && participants.some(row => row.id === value)) return value;
  const optionLabel = displayString(option?.textContent);
  for (const exactName of [value, optionLabel]) {
    if (!exactName) continue;
    const matching = participants.filter(row => row.label === exactName);
    if (matching.length === 1) return matching[0].id;
  }
  return null;
}

function readLiveScreen(doc) {
  return doc.querySelector?.('section.screen.battle[data-screen="battle"]')
    ?? doc.querySelector?.('.screen.battle')
    ?? doc.getElementById?.('battleScreen')
    ?? null;
}

export function readBattleNakiFeLiveDomProjection(globalRef = globalThis, { documentRef = globalRef?.document } = {}) {
  const doc = documentRef;
  if (!doc?.querySelector || !doc?.querySelectorAll || !doc?.getElementById) {
    return Object.freeze({ ok: false, reason: 'document_unavailable' });
  }
  const screen = readLiveScreen(doc);
  const resolution = doc.getElementById('battleResolution');
  if (!screen || !resolution) return Object.freeze({ ok: false, reason: 'battle_surface_missing' });

  const stage = stageOf(resolution);
  const explicitLive = exactDatasetOrAttribute(resolution, ['battlePhaseLive', 'phaseLive', 'live'], ['data-battle-phase-live', 'data-phase-live', 'data-live']) === 'true';
  const screenLive = screen.classList?.contains?.('active') === true;
  const resolutionLive = resolution.classList?.contains?.('battlePhaseLive') === true;
  if (!stage || (!screenLive && !explicitLive) || (!resolutionLive && !explicitLive)) {
    return Object.freeze({ ok: false, reason: 'battle_phase_not_live' });
  }

  let osReducedMotion = false;
  try { osReducedMotion = globalRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; } catch {}
  const lowPerf = doc.body?.classList?.contains?.('low-perf') === true;
  const reducedMotion = osReducedMotion || resolution.classList?.contains?.('noMotion') === true;
  const rows = Array.from(doc.querySelectorAll('#players .player') ?? []);
  if (rows.length !== 4) return Object.freeze({ ok: false, reason: 'four_player_rows_required' });
  const ids = findFourParticipants(doc, rows);
  if (!ids) return Object.freeze({ ok: false, reason: 'participant_identity_unresolved' });

  const activeIndexes = [];
  rows.forEach((row, index) => { if (row.classList?.contains?.('active') === true) activeIndexes.push(index); });
  if (activeIndexes.length !== 1) return Object.freeze({ ok: false, reason: 'active_actor_unresolved' });
  const participants = rows.map((row, index) => Object.freeze({ id: ids[index], label: rowLabel(row, index), team: null }));
  const targetId = selectedTargetId(doc.getElementById('targetPlayer'), participants);
  const sourceId = participants[activeIndexes[0]]?.id ?? null;
  if (!sourceId || !targetId || sourceId === targetId) return Object.freeze({ ok: false, reason: 'source_or_target_unresolved' });

  const markers = Array.from(doc.querySelectorAll(PARTICIPANT_MARKER_SELECTOR) ?? []);
  const markerIds = markers.map(markerIdentity);
  const markerSetIsExact = markers.length === 4 && markerIds.every((id, index) => id && ids.includes(id) && markerIds.indexOf(id) === index);
  const markerByParticipant = {};
  const cinematicCharacterByParticipant = {};
  const cinematicElementByParticipant = {};
  if (markerSetIsExact) {
    for (const marker of markers) {
      const participantId = markerIdentity(marker);
      const characterId = exactDatasetOrAttribute(marker, ['characterId'], ['data-character-id']);
      const element = exactDatasetOrAttribute(marker, ['element'], ['data-element']);
      markerByParticipant[participantId] = marker;
      if (characterId) cinematicCharacterByParticipant[participantId] = characterId;
      if (element && ELEMENT_KEYS.has(element)) cinematicElementByParticipant[participantId] = element;
    }
  }
  const eventId = exactDatasetOrAttribute(resolution, ['eventId', 'battleEventId', 'serial'], ['data-event-id', 'data-battle-event-id', 'data-serial']);
  const transition = exactDatasetOrAttribute(resolution, ['transition'], ['data-transition']) ?? 'CONTINUE';
  return Object.freeze({
    ok: true, phase: actionPhaseOf(stage), stage, causalPhase: causalPhaseOf(stage), reducedMotion, lowPerf,
    staticOnly: reducedMotion || lowPerf, eventId, transition, sourceId, targetId,
    sourceLabel: participants.find(row => row.id === sourceId)?.label ?? sourceId,
    targetLabel: participants.find(row => row.id === targetId)?.label ?? targetId,
    participants: Object.freeze(participants),
    cinematicCharacterByParticipant: Object.freeze(cinematicCharacterByParticipant),
    cinematicElementByParticipant: Object.freeze(cinematicElementByParticipant),
    sourceMarker: markerByParticipant[sourceId] ?? null,
    targetMarker: markerByParticipant[targetId] ?? null,
    sourceCharacter: cinematicCharacterByParticipant[sourceId] ?? null,
    targetCharacter: cinematicCharacterByParticipant[targetId] ?? null,
    sourceElement: cinematicElementByParticipant[sourceId] ?? null,
    targetElement: cinematicElementByParticipant[targetId] ?? null,
    sourceAuthority: 'active-player-row-plus-exact-four-board-marker-identity',
    targetAuthority: 'existing-targetPlayer-selection-exact-id-or-unique-exact-visible-label',
    presentationOnly: true, gameStateWrite: false, networkWrite: false
  });
}

function ensureSceneStyle(doc) {
  if (doc.getElementById?.('gmr-battle-live-style')) return;
  const style = doc.createElement('style');
  style.id = 'gmr-battle-live-style';
  style.textContent = `
.gmrBattleLive{position:fixed;inset:0;z-index:2147482500;overflow:hidden;display:grid;grid-template-rows:auto 1fr auto;color:#f8f0ff;background:#100c19;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;isolation:isolate;image-rendering:pixelated;animation:gmrBattleEnter .18s steps(3,end) both}
.gmrBattleLive *{box-sizing:border-box}.gmrBattleLive__sky{position:absolute;inset:0;z-index:-2;background:linear-gradient(180deg,#101526 0%,#20243a 42%,#332743 67%,#1b1524 100%);image-rendering:pixelated}
.gmrBattleLive__sky:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 79% 19%,rgba(232,208,255,.18) 0 2px,transparent 3px),radial-gradient(circle at 18% 23%,rgba(255,255,255,.42) 0 1px,transparent 2px),radial-gradient(circle at 53% 13%,rgba(255,255,255,.32) 0 1px,transparent 2px),linear-gradient(180deg,transparent 62%,rgba(22,17,34,.45) 63%);background-size:87px 73px,101px 89px,127px 99px,100% 100%}
.gmrBattleLive__moon{position:absolute;right:14%;top:9%;width:clamp(42px,8vw,96px);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff8ff,#cab0ed 53%,rgba(133,95,184,.1) 73%,transparent 75%);opacity:.26;filter:blur(.4px)}
.gmrBattleLive__top{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:start;padding:clamp(10px,2vw,24px);gap:14px}
.gmrBattleLive__name{min-width:min(39vw,310px);padding:10px 14px;border:3px solid #dbc8ee;background:linear-gradient(135deg,#25172f,#171422);box-shadow:4px 4px 0 #09080f;font-size:clamp(13px,2.2vw,22px);text-shadow:2px 2px #100b17}
.gmrBattleLive__name--source{border-color:#e7b0fa}.gmrBattleLive__name--target{border-color:#a9bdff;text-align:right}
.gmrBattleLive__label{display:block;margin-top:4px;color:#c5abcF;font-size:clamp(8px,1.15vw,11px);letter-spacing:.14em}
.gmrBattleLive__arena{position:relative;z-index:1;display:flex;align-items:end;justify-content:space-evenly;min-height:0;padding:0 8vw 4vh;overflow:hidden}
.gmrBattleLive__horizon{position:absolute;inset:20% 0 17%;background:linear-gradient(180deg,rgba(65,53,82,.08),rgba(173,143,180,.14) 58%,rgba(223,197,147,.22));clip-path:polygon(0 25%,13% 11%,28% 22%,40% 6%,56% 22%,72% 10%,88% 23%,100% 9%,100% 100%,0 100%)}
.gmrBattleLive__floor{position:absolute;left:0;right:0;bottom:9%;height:20%;border-top:3px solid rgba(235,219,255,.54);background:repeating-linear-gradient(0deg,rgba(93,67,105,.27) 0 3px,transparent 3px 9px),linear-gradient(180deg,rgba(123,105,139,.26),rgba(30,24,39,.82));transform:perspective(280px) rotateX(8deg);transform-origin:top}
.gmrBattleLive__fighter{position:relative;z-index:2;width:clamp(132px,24vw,300px);height:min(62vh,440px);display:flex;align-items:end;justify-content:center;transition:filter .1s ease;filter:drop-shadow(0 11px 4px rgba(6,4,12,.52))}
.gmrBattleLive__fighter--target{transform:scaleX(-1)}
.gmrBattleLive__sprite{width:100%;height:100%;background-repeat:no-repeat;background-size:300% 300%;background-position:0 0;image-rendering:pixelated;transform-origin:50% 95%;}
.gmrBattleLive__borrowed{width:100%!important;height:100%!important;position:relative!important;display:grid!important;place-items:end center!important;overflow:visible!important;background:transparent!important;transform:scale(1.8)!important;transform-origin:bottom center!important;pointer-events:none!important}
.gmrBattleLive__borrowed img,.gmrBattleLive__borrowed canvas{max-width:100%!important;max-height:100%!important;object-fit:contain!important;image-rendering:pixelated}
.gmrBattleLive__silhouette{position:relative;width:58%;height:67%;margin-bottom:3%;background:linear-gradient(90deg,rgba(24,20,33,.92),rgba(100,79,122,.9),rgba(24,20,33,.96));clip-path:polygon(34% 0,65% 0,77% 9%,72% 19%,91% 28%,82% 48%,74% 46%,78% 84%,93% 100%,8% 100%,24% 84%,25% 48%,14% 49%,5% 28%,26% 19%,22% 9%);filter:drop-shadow(0 0 10px var(--element-color))}
.gmrBattleLive__caption{position:absolute;z-index:4;bottom:1%;left:50%;transform:translateX(-50%);padding:6px 12px;border:2px solid rgba(244,224,255,.54);background:rgba(19,14,29,.83);color:#f1dfff;font-size:clamp(9px,1.2vw,12px);white-space:nowrap;letter-spacing:.1em}
.gmrBattleLive__ground-run{position:absolute;z-index:3;left:20%;right:20%;bottom:12%;height:64px;opacity:0;background-image:var(--ground-run);background-repeat:no-repeat;background-size:300% 700%;background-position:0% var(--ground-row-position,0%);image-rendering:pixelated;filter:drop-shadow(0 0 8px var(--element-color));transition:opacity .12s linear}
.gmrBattleLive[data-causal-phase="release"] .gmrBattleLive__ground-run,.gmrBattleLive[data-causal-phase="impact"] .gmrBattleLive__ground-run{opacity:.95}
.gmrBattleLive[data-causal-phase="release"] .gmrBattleLive__ground-run{animation:gmrBattleGroundRun .16s steps(3,end) both}
.gmrBattleLive[data-causal-phase="impact"] .gmrBattleLive__ground-run{animation:none;background-position:100% var(--ground-row-position,0%)}
.gmrBattleLive__impact{position:absolute;z-index:5;left:50%;top:47%;width:20px;height:20px;opacity:0;transform:translate(-50%,-50%) scale(.2);pointer-events:none}
.gmrBattleLive__impact:before{content:var(--impact-pattern,"♥  ✦  ♥");position:absolute;inset:0;color:#ff8ff0;text-shadow:0 0 14px #d947ff,0 0 4px white;font-size:clamp(18px,3.6vw,36px);white-space:nowrap;letter-spacing:.12em}
.gmrBattleLive__crescent{position:absolute;left:50%;top:50%;opacity:0;color:#e6d8ff;font-size:clamp(28px,5vw,48px);text-shadow:0 0 12px #bca0ff;transform:translate(-50%,-50%) rotate(-25deg)}
.gmrBattleLive[data-vfx-variant="0"] .gmrBattleLive__impact{margin-left:-5px}.gmrBattleLive[data-vfx-variant="1"] .gmrBattleLive__impact{margin-left:5px}
.gmrBattleLive[data-vfx-variant="0"] .gmrBattleLive__crescent,.gmrBattleLive[data-vfx-variant="1"] .gmrBattleLive__crescent{display:none}
.gmrBattleLive[data-causal-phase="impact"] .gmrBattleLive__impact{opacity:1;animation:gmrBattleHeartImpact .34s steps(3,end) both}
.gmrBattleLive[data-causal-phase="impact"] .gmrBattleLive__crescent{animation:gmrBattleCrescent .23s steps(2,end) .04s both}
.gmrBattleLive__bottom{position:relative;z-index:6;display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 clamp(7px,1.4vw,18px) clamp(8px,1.7vw,20px)}
.gmrBattleLive__panel{min-height:76px;padding:10px 12px;border:3px solid #d8c2e7;background:linear-gradient(135deg,rgba(34,22,44,.97),rgba(19,17,30,.98));box-shadow:4px 4px 0 #08070d}
.gmrBattleLive__panel--target{text-align:right;border-color:#a9bdff}
.gmrBattleLive__action{color:#f0c6ff;font-size:clamp(10px,1.45vw,14px);letter-spacing:.1em}.gmrBattleLive__element{display:inline-block;margin-top:7px;color:#e4d5ff;font-size:clamp(8px,1vw,10px);letter-spacing:.18em}
.gmrBattleLive__beat{display:flex;gap:3px;margin-top:8px;height:9px}.gmrBattleLive__beat i{display:block;width:10px;height:100%;background:#cf8eea;box-shadow:0 0 6px rgba(220,131,255,.6)}
.gmrBattleLive[data-causal-phase="anticipation"] .gmrBattleLive__fighter--source{animation:gmrBattleAnticipate .24s steps(2,end) infinite alternate}
.gmrBattleLive[data-causal-phase="release"] .gmrBattleLive__fighter--source{animation:gmrBattleRelease .19s steps(2,end) infinite alternate}
.gmrBattleLive[data-causal-phase="impact"] .gmrBattleLive__fighter--target{animation:gmrBattleRecoil .17s steps(2,end) 2}
.gmrBattleLive[data-causal-phase="reaction"] .gmrBattleLive__fighter--target{animation:gmrBattleRecoil .17s steps(2,end) both}
.gmrBattleLive[data-causal-phase="impact"] .gmrBattleLive__arena{animation:gmrBattleCameraHit .14s steps(2,end)}
.gmrBattleLive[data-causal-phase="return"]{animation:gmrBattleReturn .24s steps(3,end) both}
.gmrBattleLive[data-hitstop="true"] .gmrBattleLive__fighter,.gmrBattleLive[data-hitstop="true"] .gmrBattleLive__arena,.gmrBattleLive[data-hitstop="true"] .gmrBattleLive__ground-run,.gmrBattleLive[data-hitstop="true"] .gmrBattleLive__impact,.gmrBattleLive[data-hitstop="true"] .gmrBattleLive__crescent{animation-play-state:paused!important}
@keyframes gmrBattleEnter{0%{opacity:0;transform:scale(1.035);filter:brightness(1.8)}100%{opacity:1;transform:scale(1);filter:none}}
@keyframes gmrBattleAnticipate{to{transform:translateY(5px) scaleX(.98)}}@keyframes gmrBattleRelease{to{transform:translate(20px,-6px) scale(1.04)}}@keyframes gmrBattleRecoil{25%{transform:translateX(7px) rotate(2deg)}60%{transform:translateX(-4px) rotate(-1deg)}}@keyframes gmrBattleCameraHit{25%{transform:translateX(4px)}60%{transform:translateX(-3px)}}
@keyframes gmrBattleGroundRun{to{background-position:100% var(--ground-row-position,0%)}}
@keyframes gmrBattleHeartImpact{0%{opacity:0;transform:translate(-50%,-50%) scale(.2)}30%{opacity:1;transform:translate(-50%,-50%) scale(1.4)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.9)}}
@keyframes gmrBattleCrescent{0%{opacity:0;transform:translate(-50%,-50%) rotate(-25deg) scale(.5)}35%{opacity:.24;transform:translate(-50%,-50%) rotate(12deg) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) rotate(34deg) scale(1.12)}}
@keyframes gmrBattleReturn{to{opacity:0;transform:scale(.985)}}
@media(prefers-reduced-motion:reduce){.gmrBattleLive *{animation:none!important;transition:none!important}}
@media(max-width:560px){.gmrBattleLive__arena{padding:0 2vw 7vh}.gmrBattleLive__fighter{width:40vw;height:min(48vh,340px)}.gmrBattleLive__top{padding:8px}.gmrBattleLive__name{min-width:42vw;padding:7px}.gmrBattleLive__panel{min-height:62px;padding:7px}.gmrBattleLive__floor{bottom:11%;height:16%}}
`;
  (doc.head ?? doc.body)?.appendChild?.(style);
}

function setAtlasFrame(node, url, index, columns = 3, rows = 3) {
  if (!node || !url) return;
  const frame = Math.max(0, Math.min(columns * rows - 1, index));
  const column = frame % columns;
  const row = Math.floor(frame / columns);
  node.style.backgroundImage = `url("${url}")`;
  node.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
  node.style.backgroundPosition = `${columns === 1 ? 0 : column * 100 / (columns - 1)}% ${rows === 1 ? 0 : row * 100 / (rows - 1)}%`;
}

function effectVariantForEvent(projection) {
  const seed = String(projection.eventId ?? `${projection.sourceId}:${projection.targetId}`);
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return (hash >>> 0) % 3;
}

function makeBorrowedVisual(doc, marker, spriteNode) {
  if (!marker?.cloneNode || !spriteNode) return false;
  let clone;
  try { clone = marker.cloneNode(true); } catch { return false; }
  try {
    clone.removeAttribute?.('id');
    clone.removeAttribute?.('data-board-controlled-character');
    clone.classList?.add?.('gmrBattleLive__borrowed');
    clone.setAttribute?.('aria-hidden', 'true');
    clone.setAttribute?.('inert', '');
    for (const node of Array.from(clone.querySelectorAll?.('[id],button,input,select,textarea,[data-board-controlled-character]') ?? [])) {
      if (node.matches?.('button,input,select,textarea')) node.remove?.();
      else { node.removeAttribute?.('id'); node.removeAttribute?.('data-board-controlled-character'); }
    }
    spriteNode.appendChild(clone);
    return true;
  } catch { return false; }
}

function createBattleScene(doc, win, projection, assets) {
  ensureSceneStyle(doc);
  const root = doc.createElement('section');
  root.className = 'gmrBattleLive';
  root.setAttribute('aria-label', 'Battle animation');
  root.setAttribute('aria-live', 'off');
  root.setAttribute('data-battle-event-id', projection.eventId ?? '');
  const effectVariant = effectVariantForEvent(projection);
  root.dataset.vfxVariant = String(effectVariant);
  root.style.setProperty('--impact-pattern', ['"♥  ✦  ♥"', '"♡  ✧  ♥"', '"♥  ✦  ♡"'][effectVariant]);
  root.innerHTML = `<div class="gmrBattleLive__sky" aria-hidden="true"><i class="gmrBattleLive__moon"></i></div>
<header class="gmrBattleLive__top"><div class="gmrBattleLive__name gmrBattleLive__name--source"><span data-slot="source-name"></span><small class="gmrBattleLive__label" data-slot="source-element"></small></div><div class="gmrBattleLive__name gmrBattleLive__name--target"><span data-slot="target-name"></span><small class="gmrBattleLive__label" data-slot="target-element"></small></div></header>
<main class="gmrBattleLive__arena"><div class="gmrBattleLive__horizon" aria-hidden="true"></div><div class="gmrBattleLive__floor" aria-hidden="true"></div><div class="gmrBattleLive__ground-run" aria-hidden="true"></div>
<div class="gmrBattleLive__fighter gmrBattleLive__fighter--source" data-slot="source-figure"><div class="gmrBattleLive__sprite" data-slot="source-sprite"></div></div>
<div class="gmrBattleLive__fighter gmrBattleLive__fighter--target" data-slot="target-figure"><div class="gmrBattleLive__sprite" data-slot="target-sprite"></div></div>
<div class="gmrBattleLive__impact" aria-hidden="true"></div><span class="gmrBattleLive__crescent" aria-hidden="true">☾</span>
<div class="gmrBattleLive__caption" data-slot="caption"></div></main>
<footer class="gmrBattleLive__bottom"><section class="gmrBattleLive__panel"><div class="gmrBattleLive__action" data-slot="source-action"></div><small class="gmrBattleLive__element" data-slot="source-panel-element"></small><div class="gmrBattleLive__beat" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></section><section class="gmrBattleLive__panel gmrBattleLive__panel--target"><div class="gmrBattleLive__action" data-slot="target-action">TARGET</div><small class="gmrBattleLive__element" data-slot="target-panel-element"></small></section></footer>`;

  const slot = name => root.querySelector(`[data-slot="${name}"]`);
  const sourceElement = projection.sourceElement ?? 'dark';
  const targetElement = projection.targetElement ?? 'arcane';
  root.style.setProperty('--element-color', ELEMENT_COLORS[sourceElement] ?? ELEMENT_COLORS.dark);
  root.style.setProperty('--ground-run', `url("${assets?.groundRun ?? ''}")`);
  root.style.setProperty('--ground-row-position', (ELEMENT_ROWS[sourceElement] ?? ELEMENT_ROWS.dark) * 100 / 6 + '%');
  slot('source-name').textContent = projection.sourceLabel;
  slot('target-name').textContent = projection.targetLabel;
  slot('source-element').textContent = `${String(sourceElement).toUpperCase()} ATTRIBUTE`;
  slot('target-element').textContent = `${String(targetElement).toUpperCase()} ATTRIBUTE`;
  slot('source-panel-element').textContent = sourceElement === 'dark' ? 'DARK · HEART SONG' : `${String(sourceElement).toUpperCase()} · SPELL`;
  slot('target-panel-element').textContent = `${String(targetElement).toUpperCase()} · DEFENDER`;
  slot('source-action').textContent = projection.sourceCharacter === 'partner.naki' ? '♪ HEART SONG' : 'BATTLE ART';
  slot('caption').textContent = projection.sourceCharacter === 'partner.naki' ? '歌声が詠唱になる — HEART MAGIC' : 'BATTLE';

  const sourceFigure = slot('source-figure');
  const targetFigure = slot('target-figure');
  const sourceSprite = slot('source-sprite');
  const targetSprite = slot('target-sprite');
  const sourceIsNaki = projection.sourceCharacter === 'partner.naki';
  const targetIsNaki = projection.targetCharacter === 'partner.naki';
  sourceFigure.style.setProperty('--element-color', ELEMENT_COLORS[sourceElement] ?? ELEMENT_COLORS.dark);
  targetFigure.style.setProperty('--element-color', ELEMENT_COLORS[targetElement] ?? ELEMENT_COLORS.arcane);
  if (!sourceIsNaki && !makeBorrowedVisual(doc, projection.sourceMarker, sourceSprite)) sourceSprite.classList.add('gmrBattleLive__silhouette');
  if (!targetIsNaki && !makeBorrowedVisual(doc, projection.targetMarker, targetSprite)) targetSprite.classList.add('gmrBattleLive__silhouette');
  if (sourceIsNaki) setAtlasFrame(sourceSprite, assets?.nakiIdle, 0);
  if (targetIsNaki) setAtlasFrame(targetSprite, assets?.nakiIdle, 0);
  (doc.body ?? doc.documentElement)?.appendChild?.(root);

  let hitstop = false;
  let frameTimer = null;
  let frameToken = 0;
  let currentPhase = 'stance';
  const timer = win?.setTimeout?.bind(win) ?? globalThis.setTimeout?.bind(globalThis);
  const clear = win?.clearTimeout?.bind(win) ?? globalThis.clearTimeout?.bind(globalThis);
  const setNakiFrame = (role, frame) => {
    const node = role === 'source' ? sourceSprite : targetSprite;
    if (role === 'source' ? sourceIsNaki : targetIsNaki) {
      const usesAttackAtlas = role === 'source' && !['stance', 'static', 'return'].includes(currentPhase);
      const url = usesAttackAtlas ? assets?.nakiAttack : assets?.nakiIdle;
      setAtlasFrame(node, url, frame);
    }
  };
  function stopFrames() {
    frameToken += 1;
    if (frameTimer !== null && clear) clear(frameTimer);
    frameTimer = null;
  }
  function loopFrames(role, sequence, interval) {
    stopFrames();
    const token = frameToken;
    let index = 0;
    const tick = () => {
      if (token !== frameToken || !root.isConnected) return;
      if (!hitstop) setNakiFrame(role, sequence[index % sequence.length]);
      index += 1;
      frameTimer = timer?.(tick, interval) ?? null;
    };
    setNakiFrame(role, sequence[0]);
    if (timer && sequence.length > 1) frameTimer = timer(tick, interval);
  }
  function setPhase(phase) {
    currentPhase = phase;
    root.dataset.causalPhase = phase;
    if (phase === 'stance' || phase === 'static') {
      root.dataset.stage = 'stance';
      loopFrames('source', phase === 'static' ? [0] : [0, 1, 2], 460);
      return true;
    }
    if (phase === 'anticipation') {
      root.dataset.stage = 'anticipation';
      slot('caption').textContent = sourceIsNaki ? 'MIC SPELLCAST · HEARTS GATHER' : 'ANTICIPATION';
      loopFrames('source', [0, 1, 2, 3, 4], 88);
      return true;
    }
    if (phase === 'release') {
      root.dataset.stage = 'release';
      slot('caption').textContent = sourceIsNaki ? 'HEART SONG · RELEASE' : 'STRIKE';
      loopFrames('source', [5, 6], 72);
      return true;
    }
    if (phase === 'impact') {
      root.dataset.stage = 'impact';
      slot('caption').textContent = 'IMPACT';
      loopFrames('source', [7, 8], 80);
      if (targetIsNaki) setAtlasFrame(targetSprite, assets?.nakiAttack, 8);
      return true;
    }
    if (phase === 'reaction') {
      root.dataset.stage = 'reaction';
      slot('caption').textContent = targetIsNaki ? 'HEART GUARD · RECOIL' : 'REACTION';
      if (targetIsNaki) setAtlasFrame(targetSprite, assets?.nakiAttack, 8);
      else targetFigure.dataset.reaction = 'hit';
      if (sourceIsNaki) loopFrames('source', [6, 7], 110);
      return true;
    }
    if (phase === 'return') {
      root.dataset.stage = 'return';
      slot('caption').textContent = 'RETURN';
      if (sourceIsNaki) setAtlasFrame(sourceSprite, assets?.nakiIdle, 0);
      if (targetIsNaki) setAtlasFrame(targetSprite, assets?.nakiIdle, 0);
      stopFrames();
      return true;
    }
    return false;
  }
  function setHitstop(enabled) {
    hitstop = enabled === true;
    root.dataset.hitstop = String(hitstop);
    return true;
  }
  function destroy() {
    stopFrames();
    root.remove?.();
    return true;
  }
  return Object.freeze({ root, setPhase, setHitstop, destroy });
}

export function installBattleNakiFeLiveDomAdapter(globalRef = globalThis, options = {}) {
  const doc = options.documentRef ?? globalRef?.document;
  if (!doc?.querySelector || !doc?.querySelectorAll || !doc?.getElementById) return Object.freeze({ ok: false, reason: 'document_unavailable' });
  const existing = globalRef?.[GLOBAL_KEY];
  if (existing?.ok === true && typeof existing.refresh === 'function') return existing;
  const mountScene = options.mountScene ?? ((projection, assets) => createBattleScene(doc, globalRef, projection, assets));
  const assets = options.assets ?? Object.freeze({});
  const setTimeoutFn = options.setTimeoutFn ?? globalRef?.setTimeout?.bind(globalRef) ?? null;
  const clearTimeoutFn = options.clearTimeoutFn ?? globalRef?.clearTimeout?.bind(globalRef) ?? null;
  const timeoutForPhase = options.timeoutForPhase ?? (() => ACTION_FAILSAFE_MS);
  let scene = null;
  let destroyed = false;
  let active = null;
  let expiredSignature = null;
  let generation = 0;
  let eventSerial = 0;
  let watchdog = null;
  let impactTimer = null;
  let hitstopStartTimer = null;
  let hitstopEndTimer = null;
  let returnTimer = null;
  let observer = null;

  function signatureOf(projection, eventId) {
    return [eventId, projection.stage, projection.sourceId, projection.targetId, projection.participants.map(row => row.id).join(',')].join('|');
  }
  function actionIdentity(projection) { return [projection.eventId ?? '', projection.sourceId, projection.targetId].join('|'); }
  function clearTimer(name) {
    const handles = { watchdog, impact: impactTimer, hitstopStart: hitstopStartTimer, hitstopEnd: hitstopEndTimer, return: returnTimer };
    const handle = handles[name];
    if (handle !== null && clearTimeoutFn) { try { clearTimeoutFn(handle); } catch {} }
    if (name === 'watchdog') watchdog = null;
    else if (name === 'impact') impactTimer = null;
    else if (name === 'hitstopStart') hitstopStartTimer = null;
    else if (name === 'hitstopEnd') hitstopEndTimer = null;
    else if (name === 'return') returnTimer = null;
  }
  function clearSequenceTimers() {
    clearTimer('impact'); clearTimer('hitstopStart'); clearTimer('hitstopEnd'); clearTimer('return');
    scene?.setHitstop?.(false);
  }
  function clearWatchdog() { clearTimer('watchdog'); }
  function closeActive() {
    clearWatchdog(); clearSequenceTimers(); active = null;
    if (!scene) return false;
    try { scene.destroy?.(); } catch {}
    scene = null;
    return true;
  }
  function beginReaction(currentGeneration, eventId) {
    if (destroyed || active?.generation !== currentGeneration || active?.eventId !== eventId) return;
    scene?.setPhase?.('reaction');
    active.reactionPlayed = true;
    if (active.pendingReturn) beginReturn(currentGeneration, eventId);
  }
  function beginReturn(currentGeneration, eventId) {
    if (destroyed || active?.generation !== currentGeneration || active?.eventId !== eventId) return;
    if (!active.returnPlayed) {
      scene?.setPhase?.('return');
      active.returnPlayed = true;
    }
    if (!setTimeoutFn) { expiredSignature = null; closeActive(); return; }
    clearTimer('return');
    returnTimer = setTimeoutFn(() => {
      returnTimer = null;
      if (destroyed || active?.generation !== currentGeneration || active?.eventId !== eventId) return;
      expiredSignature = null;
      closeActive();
    }, RETURN_GRACE_MS);
  }
  function startImpactSequence(currentGeneration, eventId) {
    if (!setTimeoutFn) {
      scene?.setPhase?.('impact');
      if (active?.pendingReaction) beginReaction(currentGeneration, eventId);
      if (active?.pendingReturn) beginReturn(currentGeneration, eventId);
      return;
    }
    clearTimer('impact'); clearTimer('hitstopStart'); clearTimer('hitstopEnd');
    active.impactPending = true;
    impactTimer = setTimeoutFn(() => {
      impactTimer = null;
      if (destroyed || active?.generation !== currentGeneration || active?.eventId !== eventId) return;
      scene?.setPhase?.('impact');
      hitstopStartTimer = setTimeoutFn(() => {
        hitstopStartTimer = null;
        if (destroyed || active?.generation !== currentGeneration || active?.eventId !== eventId) return;
        scene?.setHitstop?.(true);
        hitstopEndTimer = setTimeoutFn(() => {
          hitstopEndTimer = null;
          if (destroyed || active?.generation !== currentGeneration || active?.eventId !== eventId) return;
          scene?.setHitstop?.(false);
          active.impactPending = false;
          active.impactComplete = true;
          if (active.pendingReaction) beginReaction(currentGeneration, eventId);
          else if (active.pendingReturn) beginReturn(currentGeneration, eventId);
        }, 62);
      }, 26);
    }, 148);
  }
  function applyStage(projection, eventId, currentGeneration) {
    if (!scene || active?.generation !== currentGeneration) return false;
    if (projection.staticOnly) {
      clearSequenceTimers();
      scene.setPhase?.(projection.causalPhase === 'return' ? 'return' : 'static');
      if (projection.stage === 'settle') closeActive();
      return true;
    }
    if (projection.stage === 'compare' || projection.stage === 'attack' || projection.stage === 'ability') {
      active.pendingReaction = false; active.pendingReturn = false;
      scene.setPhase?.('release');
      if (!active.impactPending && !active.impactComplete) startImpactSequence(currentGeneration, eventId);
      return true;
    }
    if (projection.stage === 'winner') {
      active.pendingReaction = true;
      if (!active.impactPending) beginReaction(currentGeneration, eventId);
      return true;
    }
    if (projection.stage === 'settle') {
      active.pendingReturn = true;
      if (!active.impactPending && (!active.pendingReaction || active.reactionPlayed)) beginReturn(currentGeneration, eventId);
      return true;
    }
    scene.setPhase?.(projection.causalPhase ?? 'stance');
    return true;
  }
  function refresh() {
    if (destroyed) return Object.freeze({ ok: false, reason: 'destroyed' });
    const projection = readBattleNakiFeLiveDomProjection(globalRef, { documentRef: doc });
    if (!projection.ok) { expiredSignature = null; closeActive(); return projection; }
    if (projection.stage === 'settle' && !active) { expiredSignature = null; return projection; }
    const actionKey = actionIdentity(projection);
    if (expiredSignature === actionKey) return projection;
    const sameAction = active && active.projection.sourceId === projection.sourceId && active.projection.targetId === projection.targetId && active.lastStage !== 'settle';
    const eventId = projection.eventId ?? (sameAction ? active.eventId : 'battle-dom-' + String(++eventSerial));
    const signature = signatureOf(projection, eventId);
    if (active?.signature === signature || expiredSignature === signature) return projection;
    if (active && active.eventId === eventId && active.projection.sourceId === projection.sourceId && active.projection.targetId === projection.targetId) {
      active.signature = signature; active.projection = projection; active.lastStage = projection.stage;
      applyStage(projection, eventId, active.generation);
      return Object.freeze({ ok: true, eventId, stage: projection.stage, signature, presentationOnly: true });
    }
    clearWatchdog(); clearSequenceTimers();
    const currentGeneration = ++generation;
    try { scene = mountScene(projection, assets); } catch { scene = null; }
    if (!scene) return Object.freeze({ ok: false, reason: 'battle_scene_mount_failed' });
    active = { signature, generation: currentGeneration, projection, eventId, lastStage: projection.stage, pendingReaction: false, pendingReturn: false, impactPending: false, impactComplete: false, reactionPlayed: false, returnPlayed: false };
    applyStage(projection, eventId, currentGeneration);
    if (setTimeoutFn) {
      watchdog = setTimeoutFn(() => {
        if (destroyed || active?.generation !== currentGeneration) return;
        expiredSignature = actionIdentity(active.projection);
        closeActive();
      }, timeoutForPhase(projection.phase));
    }
    return Object.freeze({ ok: true, eventId, stage: projection.stage, signature, presentationOnly: true });
  }

  const onInput = () => { refresh(); };
  const scheduleRefresh = () => {
    if (typeof globalRef?.queueMicrotask === 'function') globalRef.queueMicrotask(refresh);
    else refresh();
  };
  const MutationObserverCtor = options.MutationObserver ?? globalRef?.MutationObserver;
  if (typeof MutationObserverCtor === 'function') {
    try {
      observer = new MutationObserverCtor(scheduleRefresh);
      const observationRoot = readLiveScreen(doc) ?? doc.body;
      observer?.observe?.(observationRoot, { subtree: true, childList: true, attributes: true, attributeFilter: [
        'class','data-stage','data-battle-stage','data-phase','data-event-id','data-battle-event-id','data-serial','data-transition',
        'data-battle-phase-live','data-phase-live','data-live','data-participant-id','data-player-id','data-character-id','data-element'
      ] });
    } catch { observer = null; }
  }
  doc.addEventListener?.('change', onInput); doc.addEventListener?.('input', onInput); globalRef?.addEventListener?.('pageshow', onInput);
  const controller = Object.freeze({
    ok: true, version: 'BATTLE_NAKI_FE_LIVE_DOM_ADAPTER_R2', presentationOnly: true, gameStateWrite: false,
    refresh,
    snapshot: () => Object.freeze({ mounted: Boolean(scene), active: Boolean(active), eventId: active?.eventId ?? null, stage: active?.projection?.stage ?? null, sourceId: active?.projection?.sourceId ?? null, targetId: active?.projection?.targetId ?? null }),
    destroy() {
      if (destroyed) return false;
      destroyed = true; observer?.disconnect?.(); clearWatchdog(); closeActive();
      doc.removeEventListener?.('change', onInput); doc.removeEventListener?.('input', onInput); globalRef?.removeEventListener?.('pageshow', onInput);
      if (globalRef?.[GLOBAL_KEY] === controller) delete globalRef[GLOBAL_KEY];
      return true;
    }
  });
  globalRef[GLOBAL_KEY] = controller;
  refresh();
  return controller;
}

export const BATTLE_NAKI_FE_LIVE_DOM_ADAPTER_CONTRACT = Object.freeze({
  schema: 'gameroad.battle-naki-fe-live-dom-adapter.v2',
  trigger: 'ACTIVE_BATTLE_SCREEN_PLUS_BATTLE_PHASE_LIVE_FOCUS_REVEAL_READ_COMPARE_WINNER_SETTLE',
  stageAuthority: '#battleResolution[data-stage] + .battlePhaseLive',
  stageMapping: Object.freeze({ focus: 'stance', reveal: 'stance', read: 'anticipation', compare: 'release-impact', winner: 'reaction', settle: 'return' }),
  actorAuthority: 'EXACTLY_ONE_ACTIVE_PLAYER_ROW_AND_FIXED_FOUR_MARKER_ORDER',
  targetAuthority: 'TARGETPLAYER_EXACT_ID_OR_UNIQUE_EXACT_VISIBLE_NAME',
  participantCount: 4,
  identityInference: false,
  ambiguousActorOrTarget: 'FAIL_CLOSED',
  timelineAuthority: 'LIVE_BATTLE_DOM_STAGE_WITH_148MS_RELEASE_TO_IMPACT_AND_62MS_HITSTOP',
  returnGraceMs: RETURN_GRACE_MS,
  actionFailsafeMs: ACTION_FAILSAFE_MS,
  animationAssets: Object.freeze({ nakiIdleFrames: 9, nakiSongAttackFrames: 9, elementalGroundRun: '7-elements-x-3-frames' }),
  impactEffectVariation: 'THREE_STABLE_EVENT_HASH_VARIANTS_HEARTS_PRIMARY_CRESCENT_ONLY_ON_VARIANT_2',
  crescentUsage: 'LOW_EMPHASIS_SLASH_OR_POST_IMPACT_ONLY',
  presentationOnly: true,
  gameStateWrite: false,
  networkWrite: false,
  staticImports: Object.freeze([])
});
