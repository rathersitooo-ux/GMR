import { auditBattleScreenModel } from './battle-screen-presentation-core.mjs';

const RUNTIME_SCHEMA = 'gameroad.battle-screen-runtime-mount.v1';
const STYLE_ID = 'gameroad-battle-screen-runtime-r1-style';
const SHELL_ATTR = 'data-gr-battle-screen';
const GRID_ATTR = 'data-battle-screen-causal-grid';
const PLAN_SLOT_ATTR = 'data-battle-plan-slot';
const LANE_ATTR = 'data-battle-screen-lane';
const CHARACTER_VISUAL_ATTR = 'data-battle-character-visual';

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
[${SHELL_ATTR}="1"]{position:relative;isolation:isolate;width:100%;height:100%;min-height:0;overflow:hidden;background:linear-gradient(180deg,#0b1215 0%,#101a1d 46%,#071011 100%);color:#f7fbfa;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
[${SHELL_ATTR}="1"].grBattleScreenAdoptedOverlay{position:absolute;inset:0;z-index:0;width:auto;height:auto;min-height:0;overflow:hidden;background:transparent;color:inherit;font-family:inherit;pointer-events:none}
[${SHELL_ATTR}="1"] .grBattleScreenTop{position:absolute;z-index:8;top:0;left:0;right:0;height:clamp(38px,8vh,66px);display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 clamp(10px,2.2vw,24px);pointer-events:none;background:linear-gradient(180deg,rgba(4,10,11,.78),rgba(4,10,11,0));text-shadow:0 2px 10px rgba(0,0,0,.75)}
[${SHELL_ATTR}="1"] .grBattleScreenPhase{font-size:clamp(10px,1.4vw,15px);font-weight:800;letter-spacing:.12em;text-transform:uppercase}
[${SHELL_ATTR}="1"] .grBattleScreenReturn{font-size:clamp(8px,1vw,11px);opacity:.72}
[${SHELL_ATTR}="1"] [${PLAN_SLOT_ATTR}]{position:absolute;inset:0;z-index:2;min-width:0;min-height:0}
[${SHELL_ATTR}="1"] #battlePhaseSurface{position:absolute;inset:0;z-index:3;overflow:hidden;background:radial-gradient(ellipse at 50% 13%,rgba(90,177,157,.15),transparent 36%),linear-gradient(180deg,rgba(8,20,21,.2),rgba(4,12,13,.72))}
[${SHELL_ATTR}="1"] #battlePhaseSurface::before{content:"";position:absolute;z-index:-2;left:14%;right:14%;top:10%;bottom:-22%;clip-path:polygon(39% 0,61% 0,100% 100%,0 100%);background:linear-gradient(180deg,rgba(167,232,213,.08),rgba(75,138,118,.14) 46%,rgba(18,44,38,.34));border-left:1px solid rgba(210,255,239,.08);border-right:1px solid rgba(210,255,239,.08);transform:perspective(480px) rotateX(5deg);transform-origin:50% 0}
[${SHELL_ATTR}="1"] [${GRID_ATTR}]{position:absolute;z-index:4;inset:clamp(44px,10vh,78px) clamp(6px,1.5vw,18px) clamp(48px,9vh,78px);display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(4px,1vw,14px);align-items:stretch;pointer-events:none}
[${SHELL_ATTR}="1"] [${LANE_ATTR}]{--gr-player-rgb:164,232,214;position:relative;min-width:0;overflow:hidden;display:grid;grid-template-rows:auto minmax(88px,1fr) auto;gap:6px;padding:clamp(7px,1.1vw,13px);border:1px solid rgba(196,231,221,.22);border-radius:clamp(9px,1.4vw,16px);background:linear-gradient(180deg,rgba(17,34,35,.7),rgba(5,14,15,.45));box-shadow:inset 0 0 0 1px rgba(255,255,255,.026);transition:transform 180ms ease,opacity 180ms ease,border-color 180ms ease,background 180ms ease}
[${SHELL_ATTR}="1"] [${LANE_ATTR}]:nth-child(n+3){--gr-player-rgb:239,183,142}
[${SHELL_ATTR}="1"] [${LANE_ATTR}]::after{content:"P" attr(${LANE_ATTR});position:absolute;z-index:5;right:7px;top:36px;padding:2px 5px;border-radius:999px;border:1px solid rgba(var(--gr-player-rgb),.48);background:rgba(3,9,10,.76);color:rgba(var(--gr-player-rgb),1);font-size:clamp(8px,.78vw,10px);font-weight:900;letter-spacing:.08em}
[${SHELL_ATTR}="1"] .grBattleLaneIdentity,[${SHELL_ATTR}="1"] .grBattleLaneAfterstate{position:relative;z-index:4}
[${SHELL_ATTR}="1"] [${CHARACTER_VISUAL_ATTR}]{position:relative;z-index:2;align-self:stretch;justify-self:stretch;display:flex;align-items:center;justify-content:center;min-width:46px;min-height:88px;width:100%;height:100%;opacity:1;visibility:visible;overflow:hidden}
[${SHELL_ATTR}="1"] .grBattleCharacterImage{display:block;position:absolute;z-index:2;left:50%;bottom:0;transform:translateX(-50%);max-width:96%;max-height:100%;width:auto;height:auto;object-fit:contain;opacity:1;visibility:visible;filter:drop-shadow(0 7px 10px rgba(0,0,0,.34))}
[${SHELL_ATTR}="1"] .grBattleCharacterImage[hidden]{display:none!important}
[${SHELL_ATTR}="1"] .grBattleCharacterFallback{position:relative;z-index:1;width:min(78%,118px);height:min(92%,190px);min-width:46px;min-height:88px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:6px;box-sizing:border-box;opacity:.96;visibility:visible;color:#f7fbfa;font-size:clamp(8px,.85vw,11px);font-weight:900;letter-spacing:.08em;text-shadow:0 2px 8px rgba(0,0,0,.8);background:radial-gradient(circle at 50% 17%,rgba(var(--gr-player-rgb),.95) 0 14%,rgba(var(--gr-player-rgb),.18) 15% 20%,transparent 21%),radial-gradient(ellipse at 50% 72%,rgba(var(--gr-player-rgb),.72) 0 34%,rgba(var(--gr-player-rgb),.16) 35% 46%,transparent 47%);filter:drop-shadow(0 0 13px rgba(var(--gr-player-rgb),.3))}
[${SHELL_ATTR}="1"] .grBattleCharacterFallback[hidden]{display:none!important}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-role="source"]{transform:translateY(-1.4%);border-color:rgba(165,230,213,.74);background:linear-gradient(180deg,rgba(32,72,65,.8),rgba(5,14,15,.32))}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-role="target"]{border-color:rgba(239,183,142,.76);background:linear-gradient(180deg,rgba(83,52,36,.72),rgba(5,14,15,.32))}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-role="winner"]{transform:translateY(-2.2%);border-color:rgba(255,225,139,.9);background:linear-gradient(180deg,rgba(101,81,34,.76),rgba(5,14,15,.28));box-shadow:0 0 34px rgba(237,202,102,.26),inset 0 0 0 1px rgba(255,245,196,.12)}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-role="loser"]{opacity:.64;transform:translateY(1.8%)}
[${SHELL_ATTR}="1"] .grBattleLaneIdentity{min-width:0}.grBattleLaneIdentity b{display:block;min-width:0;white-space:normal;overflow-wrap:anywhere;line-height:1.15;font-size:clamp(9px,1.25vw,15px);letter-spacing:.04em}.grBattleLaneIdentity small{display:block;margin-top:2px;opacity:.7;font-size:clamp(7px,.8vw,10px)}
[${SHELL_ATTR}="1"] .grBattleLaneAfterstate{align-self:end;display:grid;gap:4px;min-height:20px;font-size:clamp(7px,.82vw,10px);line-height:1.25;color:#dce9e5}
[${SHELL_ATTR}="1"] .grBattleLaneAfterstate span{min-width:0;white-space:normal;overflow-wrap:anywhere;padding:3px 5px;border-radius:6px;background:rgba(2,8,9,.72);border:1px solid rgba(214,241,231,.12)}
[${SHELL_ATTR}="1"] #battleResolution{position:absolute;z-index:7;left:50%;bottom:clamp(8px,2vh,18px);transform:translateX(-50%);max-width:min(72vw,760px);min-width:0;min-height:24px;overflow-wrap:anywhere;pointer-events:none;text-align:center}
[${SHELL_ATTR}="1"][data-motion="static_only"] [${LANE_ATTR}]{transition:none!important;transform:none!important}
@media(max-width:540px){[${SHELL_ATTR}="1"] [${GRID_ATTR}]{left:4px;right:4px;gap:3px}[${SHELL_ATTR}="1"] [${LANE_ATTR}]{padding:6px 4px;border-radius:8px;grid-template-rows:auto minmax(72px,1fr) auto}[${SHELL_ATTR}="1"] [${CHARACTER_VISUAL_ATTR}]{min-width:38px;min-height:72px}[${SHELL_ATTR}="1"] .grBattleCharacterFallback{width:88%;height:92%;min-width:38px;min-height:72px}}
@media(max-height:420px){[${SHELL_ATTR}="1"] [${GRID_ATTR}]{top:36px;bottom:34px}[${SHELL_ATTR}="1"] .grBattleScreenTop{height:36px}[${SHELL_ATTR}="1"] [${LANE_ATTR}]{grid-template-rows:auto minmax(64px,1fr) auto}[${SHELL_ATTR}="1"] [${CHARACTER_VISUAL_ATTR}]{min-height:64px}[${SHELL_ATTR}="1"] .grBattleCharacterFallback{min-height:64px}[${SHELL_ATTR}="1"] .grBattleLaneAfterstate{gap:2px}}
@media(prefers-reduced-motion:reduce){[${SHELL_ATTR}="1"] [${LANE_ATTR}]{transition:none!important;transform:none!important}[${SHELL_ATTR}="1"] .grBattleCharacterImage{transform:translateX(-50%)!important}}
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

function createCharacterVisual(document) {
  const host = createNode(document, 'div', 'grBattleCharacterVisual');
  host.setAttribute?.(CHARACTER_VISUAL_ATTR, 'naki');
  host.dataset.characterId = 'naki';
  host.dataset.visualState = 'idle';
  host.dataset.visualMode = 'fallback';
  host.dataset.visible = 'true';
  host.dataset.usableSource = 'true';
  host.dataset.transparentOnlyPlaceholder = 'false';
  const fallback = createNode(document, 'div', 'grBattleCharacterFallback', 'ナキ');
  fallback.dataset.fallback = 'character_silhouette_label';
  const image = createNode(document, 'img', 'grBattleCharacterImage');
  image.hidden = true;
  image.setAttribute?.('alt', '緋累ナキ');
  host.appendChild(fallback);
  host.appendChild(image);
  return { host, fallback, image, sourceIndex: -1, sources: [] };
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
  const character = createCharacterVisual(document);
  const afterstate = createNode(document, 'div', 'grBattleLaneAfterstate');
  lane.appendChild(identity);
  lane.appendChild(character.host);
  lane.appendChild(afterstate);
  return { lane, name, team, character, afterstate };
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

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeCharacterSources(value) {
  const candidates = [];
  if (nonEmptyString(value)) candidates.push(value.trim());
  else if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (nonEmptyString(value.src)) candidates.push(value.src.trim());
    if (Array.isArray(value.sources)) {
      for (const source of value.sources) if (nonEmptyString(source)) candidates.push(source.trim());
    }
    if (nonEmptyString(value.fallbackSrc)) candidates.push(value.fallbackSrc.trim());
  }
  return [...new Set(candidates)];
}

function toggleOn(document, id) {
  const text = document?.getElementById?.(id)?.textContent;
  return typeof text === 'string' && /\bON\b/i.test(text);
}

function embeddedNakiPerformance(global, document) {
  let systemReducedMotion = false;
  const matchMediaRef = global?.matchMedia ?? (typeof globalThis === 'object' ? globalThis.matchMedia : null);
  try {
    systemReducedMotion = typeof matchMediaRef === 'function' && matchMediaRef('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    systemReducedMotion = false;
  }
  const bodyLowPerf = document?.body?.classList?.contains?.('low-perf') === true;
  return bodyLowPerf || toggleOn(document, 'lowPerf') || toggleOn(document, 'reduceMotion') || systemReducedMotion
    ? 'low'
    : 'normal';
}

function firstImageSource(root) {
  if (!root || typeof root !== 'object') return null;
  if (String(root.tagName || '').toUpperCase() === 'IMG') {
    const attribute = root.getAttribute?.('src');
    if (nonEmptyString(attribute)) return attribute.trim();
    if (nonEmptyString(root.src)) return root.src.trim();
  }
  for (const child of Array.from(root.children ?? [])) {
    const source = firstImageSource(child);
    if (source) return source;
  }
  return null;
}

function createEmbeddedNakiCharacterVisualResolver(global, document) {
  const runtime = global?.GameRoadThreeCharRuntime ??
    (typeof globalThis === 'object' ? globalThis.GameRoadThreeCharRuntime : null);
  if (!runtime || typeof runtime.mount !== 'function') return null;
  const sourceCache = new Map();
  return (participant, visualState = 'idle') => {
    const characterId = nonEmptyString(participant?.character) ? participant.character.trim() : 'partner.naki';
    const state = nonEmptyString(visualState) ? visualState.trim() : 'idle';
    const performance = embeddedNakiPerformance(global, document);
    const key = `${characterId}|${state}|${performance}`;
    if (sourceCache.has(key)) return sourceCache.get(key);
    const probe = createNode(document, 'div');
    let pending = null;
    try {
      pending = runtime.mount(probe, {
        characterId,
        state,
        assetMode: 'embedded',
        performance,
        allowNetwork: false
      });
      const src = firstImageSource(probe);
      if (!nonEmptyString(src) || !/^data:image\//i.test(src)) return null;
      const resolved = Object.freeze({ src });
      sourceCache.set(key, resolved);
      return resolved;
    } catch {
      return null;
    } finally {
      if (pending != null) {
        Promise.resolve(pending).then(handle => {
          try { runtime.unmount?.(handle); } catch {}
        }).catch(() => undefined);
      }
    }
  };
}

function showCharacterFallback(view, reason = 'fallback') {
  const { host, fallback, image } = view.character;
  fallback.hidden = false;
  image.hidden = true;
  host.dataset.visualMode = 'fallback';
  host.dataset.visualReason = reason;
  host.dataset.visible = 'true';
  host.dataset.usableSource = 'true';
  host.dataset.transparentOnlyPlaceholder = 'false';
}

function tryCharacterSource(view, index) {
  const { host, fallback, image, sources } = view.character;
  if (index < 0 || index >= sources.length) {
    showCharacterFallback(view, 'asset_unavailable');
    return false;
  }
  view.character.sourceIndex = index;
  fallback.hidden = false;
  image.hidden = true;
  image.setAttribute?.('src', sources[index]);
  host.dataset.visualMode = 'asset_pending';
  host.dataset.visualReason = 'loading';
  host.dataset.visible = 'true';
  host.dataset.usableSource = 'true';
  host.dataset.transparentOnlyPlaceholder = 'false';
  return true;
}

function renderCharacterVisual(view, participant, visualState, resolver) {
  const { host, fallback, image } = view.character;
  host.dataset.participantId = participant.id;
  host.dataset.visualState = visualState;
  host.dataset.characterId = 'naki';
  let resolved = null;
  if (typeof resolver === 'function') {
    try {
      resolved = resolver(participant, visualState);
    } catch {
      resolved = null;
    }
  }
  view.character.sources = normalizeCharacterSources(resolved);
  view.character.sourceIndex = -1;
  image.onload = () => {
    image.hidden = false;
    fallback.hidden = true;
    host.dataset.visualMode = 'asset';
    host.dataset.visualReason = 'loaded';
    host.dataset.visible = 'true';
    host.dataset.usableSource = 'true';
    host.dataset.transparentOnlyPlaceholder = 'false';
  };
  image.onerror = () => {
    const nextIndex = view.character.sourceIndex + 1;
    if (!tryCharacterSource(view, nextIndex)) showCharacterFallback(view, 'asset_error');
  };
  if (!tryCharacterSource(view, 0)) showCharacterFallback(view, resolved == null ? 'resolver_unavailable' : 'source_invalid');
  return host;
}

function visualStateForLaneRole(role) {
  if (role === 'source') return 'attack';
  if (role === 'target') return 'hit';
  if (role === 'winner') return 'joy';
  if (role === 'loser') return 'defeated';
  return 'idle';
}

export function mountBattleScreenExternalSurface(global = globalThis, options = {}) {
  const document = requireDocument(global);
  const providedPhase = options.phaseSurface ?? null;
  const providedResolution = options.resolutionSurface ?? null;
  const characterVisualResolver = options.characterVisualResolver ?? createEmbeddedNakiCharacterVisualResolver(global, document);
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

  const top = createNode(document, 'header', 'grBattleScreenTop');
  const phaseLabel = createNode(document, 'div', 'grBattleScreenPhase', 'MATCH / PLAN');
  const returnLabel = createNode(document, 'div', 'grBattleScreenReturn', '');
  top.appendChild(phaseLabel);
  top.appendChild(returnLabel);
  if (!adoptingExistingPhase) shell.appendChild(top);

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

  const grid = createNode(document, 'div', 'grBattleCausalGrid');
  grid.setAttribute?.(GRID_ATTR, '');
  grid.setAttribute?.('aria-label', '4人バトル比較');
  const gridHost = adoptingExistingPhase ? shell : phaseSurface;
  gridHost.appendChild(grid);
  const lanes = Array.from({ length: 4 }, (_, index) => createLane(document, index));
  for (const lane of lanes) grid.appendChild(lane.lane);

  const resolutionAnchor = ensureAnchor(document, phaseSurface, providedResolution, 'battleResolution', 'div');
  const resolutionSurface = resolutionAnchor.node;
  resolutionSurface.dataset.battleScreenResolutionAuthority = 'external_existing_presentation_consumer';

  let destroyed = false;
  function render(model) {
    if (destroyed) throw new Error('BATTLE_SCREEN_RUNTIME_DESTROYED');
    const audit = auditBattleScreenModel(model);
    if (!audit.ok) throw new TypeError(`BATTLE_SCREEN_MODEL_REJECTED:${audit.defects.join(',')}`);

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

    phaseLabel.textContent = model.screenMode === 'BATTLE_PHASE'
      ? `BATTLE / ${model.phase}`
      : 'MATCH / PLAN';
    returnLabel.textContent = model.returnIntent ? `NEXT: ${model.returnIntent}` : '';

    const battle = model.screenMode === 'BATTLE_PHASE';
    phaseSurface.hidden = !battle;
    if (planSlot) planSlot.hidden = battle;

    const teamKeys = [];
    for (const lane of model.lanes) {
      if (lane.team && !teamKeys.includes(lane.team)) teamKeys.push(lane.team);
    }

    for (let index = 0; index < lanes.length; index += 1) {
      const view = lanes[index];
      const lane = model.lanes[index];
      view.lane.dataset.participantId = lane.id;
      view.lane.dataset.role = lane.role;
      view.name.textContent = lane.label;
      const teamIndex = lane.team ? teamKeys.indexOf(lane.team) : -1;
      view.team.textContent = teamIndex === 0 ? '●' : teamIndex === 1 ? '◆' : '';
      view.team.setAttribute?.('aria-label', teamIndex >= 0 ? `チーム${teamIndex + 1}` : '');
      renderCharacterVisual(view, lane, visualStateForLaneRole(lane.role), characterVisualResolver);
      writeAfterstate(document, view.afterstate, lane.afterstate);
    }
    return model;
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    if (grid?.parentNode && typeof grid.parentNode.removeChild === 'function') grid.parentNode.removeChild(grid);
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
    resolutionSurface,
    grid,
    laneSurfaces: lanes.map(view => view.lane),
    characterSurfaces: lanes.map(view => view.character.host),
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
  existingAnchorPolicy: 'EXPLICIT_PHASE_GETS_RUNTIME_OVERLAY__ANCESTOR_NEVER_DECORATED',
  externalPhaseShellOwner: 'CALLER',
  planSurfaceOwner: 'CALLER',
  laneCount: 4,
  characterVisualBinding: 'SHARED_PARAMETERIZED_ONE_BINDING_FOUR_PROJECTIONS',
  defaultCharacter: 'NAKI',
  defaultVisualState: 'idle',
  roleVisualStatePolicy: 'source=attack|target=hit|winner=joy|loser=defeated|other=idle',
  liveNakiVisualSource: 'GameRoadThreeCharRuntime:participant.character||partner.naki:embedded',
  participantVisualFallback: 'NAKI_RESOLVER_THEN_VISIBLE_LABELED_SILHOUETTE',
  productionHtmlMutationOwnedHere: false,
  formalArtOwnedHere: false
});