import {
  mountBattleCardZoneInformationRuntimeSurface,
} from './battle-card-zone-information-runtime-surface.mjs';

export const BATTLE_CARD_ZONE_LIVE_CONSUMER_SCHEMA =
  'gameroad.battle-card-zone-live-consumer.v1';

function requireSnapshotProvider(provider) {
  if (typeof provider !== 'function') {
    throw new TypeError('getAuthorizedSnapshot must be a function');
  }
  return provider;
}

function hiddenReceipt(reason, model = null) {
  return Object.freeze({
    ok: false,
    status: 'hidden',
    schema: BATTLE_CARD_ZONE_LIVE_CONSUMER_SCHEMA,
    reason,
    zoneId: model?.zoneId ?? null,
    generation: model?.generation ?? null,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
  });
}

function renderedReceipt(model) {
  return Object.freeze({
    ok: true,
    status: 'rendered',
    schema: BATTLE_CARD_ZONE_LIVE_CONSUMER_SCHEMA,
    zoneId: model.zoneId,
    generation: model.generation,
    countVisible: model.countVisible === true,
    recentVisible: model.recentVisible === true,
    listVisible: model.listVisible === true,
    detailEnabled: model.detailEnabled === true,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
  });
}

/**
 * Live presentation bridge for an already-authorized Battle card-zone snapshot.
 *
 * This consumer intentionally has no knowledge of the live match/player shape.
 * The caller-owned getAuthorizedSnapshot provider is the only source boundary.
 * It must return the viewer-safe snapshot expected by the existing card-zone
 * projection/runtime surface. Raw player state is never inspected or converted
 * into a graveyard/discard zone here.
 */
export function mountBattleCardZoneLiveConsumer({
  document: documentInput = globalThis.document,
  host,
  label = '墓地',
  getAuthorizedSnapshot,
  onCardDetailRequest = null,
} = {}) {
  const snapshotProvider = requireSnapshotProvider(getAuthorizedSnapshot);
  const surface = mountBattleCardZoneInformationRuntimeSurface({
    document: documentInput,
    host,
    label,
    onCardDetailRequest,
  });

  let destroyed = false;

  function sync(context) {
    if (destroyed) return hiddenReceipt('CONSUMER_DESTROYED');

    let snapshot = null;
    try {
      snapshot = snapshotProvider(context);
    } catch {
      surface.render(null);
      return hiddenReceipt('AUTHORIZED_SNAPSHOT_PROVIDER_ERROR');
    }

    const model = surface.render(snapshot);
    if (!model || model.visible !== true || model.entryVisible !== true) {
      return hiddenReceipt('AUTHORIZED_VIEWER_SAFE_SNAPSHOT_UNAVAILABLE', model);
    }
    return renderedReceipt(model);
  }

  return Object.freeze({
    schema: BATTLE_CARD_ZONE_LIVE_CONSUMER_SCHEMA,
    surface,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    rawStateDerivation: false,
    sourceAuthority: 'caller-authorized viewer-safe card-zone snapshot provider',
    sync,
    close() {
      return surface.close();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      surface.destroy();
    },
  });
}

export const BATTLE_CARD_ZONE_LIVE_CONSUMER = Object.freeze({
  schema: BATTLE_CARD_ZONE_LIVE_CONSUMER_SCHEMA,
  sourceAuthority: 'caller-authorized viewer-safe card-zone snapshot provider',
  projectionAuthority: 'battle-card-zone-information-core',
  presentationSurface: 'battle-card-zone-information-runtime-surface',
  rawStateDerivation: false,
  zoneStateWrite: false,
  gameplayAuthority: false,
  gameStateWrite: false,
  failClosedOnProviderError: true,
  detailHandoff: 'exact projected authorized cardId only',
});
