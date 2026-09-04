import { resolveOpponentCardSkin } from './card-skin-opponent-precedence-core.mjs';
import { readFanartLocalOpponentSkinPreference } from './cards-deck-presentation.mjs';

const STYLE_ID = 'gameroad-fanart-opponent-battle-style';
const STRIP_ROLE = 'fanart-opponent-local-skin-strip';
const OVERLAY_ROLE = 'fanart-opponent-local-skin-overlay';

export const FANART_OPPONENT_BATTLE_CONTRACT = Object.freeze({
  schema: 'gameroad.fanart-opponent-battle.v1',
  acceptedPublicResolutionOnly: true,
  canonicalIdentityPreserved: true,
  preferenceSource: 'cards-deck-presentation:readFanartLocalOpponentSkinPreference',
  localOnly: true,
  networkSync: false,
  rankedStateMutation: false,
  gameplayStateMutation: false,
  opponentOwnershipMutation: false,
  opponentEquipMutation: false,
});

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeCardId(value) {
  if (!nonEmptyString(value)) return null;
  const id = value.trim();
  return id.length <= 160 ? id : null;
}

function viewerIdFromDocument(documentRef) {
  const lanes = Array.from(documentRef?.querySelectorAll?.('[data-battle-screen-lane][data-participant-id]') ?? []);
  for (const lane of lanes) {
    if (lane.querySelector?.('.grBattleLaneIdentity b')?.textContent?.trim() === 'あなた') {
      return nonEmptyString(lane.dataset?.participantId) ? lane.dataset.participantId : null;
    }
  }
  return null;
}

export function resolveFanartBattleViewerId(resolution, documentRef = null) {
  if (!resolution || !Array.isArray(resolution.players)) return null;
  const named = resolution.players.find(player => player?.name === 'あなた' && nonEmptyString(player?.id));
  return named?.id ?? viewerIdFromDocument(documentRef);
}

function opposingPlayers(resolution, viewerId) {
  const players = Array.isArray(resolution?.players) ? resolution.players : [];
  const viewer = players.find(player => player?.id === viewerId);
  if (!viewer) return [];
  return players.filter(player => {
    if (!player || player.id === viewerId) return false;
    if (nonEmptyString(viewer.team) && nonEmptyString(player.team)) return player.team !== viewer.team;
    return true;
  });
}

export async function buildFanartOpponentBattleProjection({
  resolution,
  viewerId = null,
  document: documentRef = null,
  indexedDB: idb = globalThis.indexedDB,
  readOpponentPreference = readFanartLocalOpponentSkinPreference,
} = {}) {
  if (!resolution || !Number.isSafeInteger(resolution.serial) || resolution.serial < 1 || !Array.isArray(resolution.players)) {
    throw new TypeError('FANART_PUBLIC_RESOLUTION_INVALID');
  }
  const resolvedViewerId = viewerId || resolveFanartBattleViewerId(resolution, documentRef);
  if (!nonEmptyString(resolvedViewerId)) {
    return Object.freeze({
      schema: FANART_OPPONENT_BATTLE_CONTRACT.schema,
      presentationOnly: true,
      acceptedPublicResolutionOnly: true,
      viewerId: null,
      resolutionSerial: resolution.serial,
      entries: Object.freeze([]),
    });
  }

  const entries = [];
  for (const player of opposingPlayers(resolution, resolvedViewerId)) {
    if (!Array.isArray(player.cards)) continue;
    for (const card of player.cards) {
      const cardId = normalizeCardId(card?.cardId);
      if (!cardId) continue;
      let preference = null;
      try {
        preference = await readOpponentPreference({ indexedDB: idb, cardId });
      } catch {
        preference = null;
      }
      if (!preference?.blob || !nonEmptyString(preference?.assetHash)) continue;
      const chosen = resolveOpponentCardSkin({
        viewerPreference: { skinId: preference.assetHash, baseCardId: cardId },
        opponentEquippedSkin: null,
        defaultSkin: null,
      });
      if (chosen.source !== 'viewer_preference') continue;
      entries.push(Object.freeze({
        participantId: player.id,
        cardId,
        label: nonEmptyString(card.label) ? card.label : cardId,
        assetHash: preference.assetHash,
        blob: preference.blob,
        source: chosen.source,
      }));
    }
  }

  return Object.freeze({
    schema: FANART_OPPONENT_BATTLE_CONTRACT.schema,
    presentationOnly: true,
    acceptedPublicResolutionOnly: true,
    viewerId: resolvedViewerId,
    resolutionSerial: resolution.serial,
    entries: Object.freeze(entries),
  });
}

function ensureStyle(documentRef) {
  if (!documentRef?.head || typeof documentRef.createElement !== 'function') return false;
  if (documentRef.getElementById?.(STYLE_ID)) return true;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
[data-fanart-opponent-local-skin-host="1"]{position:relative!important}
[data-role="${OVERLAY_ROLE}"]{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;pointer-events:none;z-index:4}
[data-role="${STRIP_ROLE}"]{display:flex;gap:4px;min-height:38px;align-items:center;overflow:hidden}
[data-role="${STRIP_ROLE}"]>span{position:relative;width:28px;height:38px;flex:0 0 auto;border-radius:4px;overflow:hidden;background:rgba(0,0,0,.28)}
[data-role="${STRIP_ROLE}"] [data-role="${OVERLAY_ROLE}"]{position:static;display:block}
`;
  documentRef.head.appendChild(style);
  return true;
}

function clearProjection(documentRef, urls, URLRef) {
  for (const node of documentRef?.querySelectorAll?.(`[data-role="${OVERLAY_ROLE}"], [data-role="${STRIP_ROLE}"]`) ?? []) {
    node.remove?.();
  }
  for (const url of urls.values()) {
    try { URLRef?.revokeObjectURL?.(url); } catch {}
  }
  urls.clear();
}

function participantLane(documentRef, participantId) {
  return Array.from(documentRef?.querySelectorAll?.('[data-battle-screen-lane][data-participant-id]') ?? [])
    .find(node => node?.dataset?.participantId === participantId) ?? null;
}

function canonicalCardHost(lane, cardId) {
  return Array.from(lane?.querySelectorAll?.('[data-card-id]') ?? [])
    .find(node => node?.dataset?.cardId === cardId) ?? null;
}

export function renderFanartOpponentBattleProjection(plan, environment = {}, urls = new Map()) {
  if (!plan || plan.schema !== FANART_OPPONENT_BATTLE_CONTRACT.schema || plan.presentationOnly !== true) return false;
  const documentRef = environment.document ?? globalThis.document;
  const URLRef = environment.URL ?? globalThis.URL;
  if (!documentRef?.querySelectorAll || typeof documentRef.createElement !== 'function' || typeof URLRef?.createObjectURL !== 'function') {
    return false;
  }
  ensureStyle(documentRef);
  clearProjection(documentRef, urls, URLRef);
  const strips = new Map();

  for (const entry of plan.entries) {
    const lane = participantLane(documentRef, entry.participantId);
    if (!lane) continue;
    let url = null;
    try { url = URLRef.createObjectURL(entry.blob); } catch { url = null; }
    if (!url) continue;
    urls.set(`${entry.participantId}:${entry.cardId}`, url);

    const image = documentRef.createElement('img');
    image.dataset.role = OVERLAY_ROLE;
    image.dataset.cardId = entry.cardId;
    image.alt = '';
    image.setAttribute?.('aria-hidden', 'true');
    image.src = url;

    const host = canonicalCardHost(lane, entry.cardId);
    if (host) {
      host.dataset.fanartOpponentLocalSkinHost = '1';
      host.appendChild?.(image);
      continue;
    }

    let strip = strips.get(entry.participantId);
    if (!strip) {
      strip = documentRef.createElement('div');
      strip.dataset.role = STRIP_ROLE;
      strip.setAttribute?.('aria-label', '相手カードの端末内表示');
      lane.appendChild?.(strip);
      strips.set(entry.participantId, strip);
    }
    const item = documentRef.createElement('span');
    item.dataset.cardId = entry.cardId;
    item.title = entry.label;
    item.appendChild?.(image);
    strip.appendChild?.(item);
  }
  return true;
}

export function createFanartOpponentBattleProjectionBridge(environment = {}) {
  const urls = new Map();
  let generation = 0;
  let lastPlan = null;
  const documentRef = environment.document ?? globalThis.document;
  const idb = environment.indexedDB ?? globalThis.indexedDB;
  const URLRef = environment.URL ?? globalThis.URL;
  const build = environment.buildPlan ?? buildFanartOpponentBattleProjection;
  const render = environment.renderPlan ?? (plan => renderFanartOpponentBattleProjection(
    plan,
    { document: documentRef, URL: URLRef },
    urls,
  ));

  function begin() {
    generation += 1;
    lastPlan = null;
    if (documentRef) clearProjection(documentRef, urls, URLRef);
    return true;
  }

  function acceptAcceptedResolution({ resolution }) {
    const ticket = ++generation;
    Promise.resolve(build({ resolution, document: documentRef, indexedDB: idb }))
      .then(plan => {
        if (ticket !== generation) return;
        lastPlan = plan;
        try { render(plan); } catch {}
      })
      .catch(() => {});
    return Object.freeze({ accepted: true, presentationOnly: true, pending: true });
  }

  return Object.freeze({
    begin,
    acceptAcceptedResolution,
    snapshot: () => lastPlan,
  });
}
