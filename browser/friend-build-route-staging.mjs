const FRIEND_BUILD_DISPOSITION = Object.freeze({
  KEEP: 'KEEP',
  DEFER: 'DEFER',
});

export const FRIEND_BUILD_ROAD_AHEAD_LABEL = 'まだ道の先';

// Friend Build only stages routes with direct current evidence that the public-facing
// destination is not yet a finished consumer surface. Unknown or actively repaired routes
// stay KEEP until their owner produces a terminal acceptance result.
export const FRIEND_BUILD_ROUTE_POLICY = Object.freeze({
  gacha: Object.freeze({
    disposition: FRIEND_BUILD_DISPOSITION.DEFER,
    label: FRIEND_BUILD_ROAD_AHEAD_LABEL,
    evidence: 'preview-only-not-persisted',
  }),
});

export function normalizeFriendBuildRouteId(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function resolveFriendBuildRouteDisposition(routeId) {
  const id = normalizeFriendBuildRouteId(routeId);
  const policy = FRIEND_BUILD_ROUTE_POLICY[id];
  if (!policy) {
    return Object.freeze({
      routeId: id || null,
      disposition: FRIEND_BUILD_DISPOSITION.KEEP,
      label: null,
      evidence: null,
    });
  }
  return Object.freeze({ routeId: id, ...policy });
}

export function projectFriendBuildRoutes(routeIds = []) {
  const visibleRouteIds = [];
  const deferredRouteIds = [];
  for (const rawId of Array.isArray(routeIds) ? routeIds : []) {
    const id = normalizeFriendBuildRouteId(rawId);
    if (!id) continue;
    const target = resolveFriendBuildRouteDisposition(id).disposition;
    if (target === FRIEND_BUILD_DISPOSITION.DEFER) deferredRouteIds.push(id);
    else visibleRouteIds.push(id);
  }
  return Object.freeze({
    visibleRouteIds: Object.freeze(visibleRouteIds),
    deferredRouteIds: Object.freeze(deferredRouteIds),
  });
}

function routeIdFromEntry(node) {
  return normalizeFriendBuildRouteId(node?.dataset?.homeTarget || node?.dataset?.go || '');
}

function ensureRoadAheadMarker(home, documentSource) {
  let marker = home.querySelector?.('[data-friend-build-road-ahead="true"]') || null;
  if (!marker && documentSource?.createElement) {
    marker = documentSource.createElement('div');
    marker.dataset.friendBuildRoadAhead = 'true';
    marker.className = 'friendBuildRoadAhead';
    marker.textContent = FRIEND_BUILD_ROAD_AHEAD_LABEL;
    marker.setAttribute?.('role', 'note');
    marker.setAttribute?.('aria-label', '未公開の道があります');
    const host = home.querySelector?.('.codexHomeUtilities') || home;
    host.append?.(marker);
  }
  return marker;
}

export function stageFriendBuildHome(home, { documentSource = home?.ownerDocument ?? globalThis.document } = {}) {
  if (!home || typeof home.querySelectorAll !== 'function') {
    return Object.freeze({ deferredRouteIds: Object.freeze([]), changed: false });
  }

  const deferredRouteIds = [];
  const entries = [
    ...home.querySelectorAll('.homePadChoice[data-home-target], .homeUtilityBtn[data-go]'),
  ];
  for (const entry of entries) {
    const routeId = routeIdFromEntry(entry);
    const policy = resolveFriendBuildRouteDisposition(routeId);
    if (policy.disposition !== FRIEND_BUILD_DISPOSITION.DEFER) continue;
    deferredRouteIds.push(routeId);
    entry.remove?.();
  }

  if (deferredRouteIds.length) ensureRoadAheadMarker(home, documentSource);
  return Object.freeze({
    deferredRouteIds: Object.freeze(deferredRouteIds),
    changed: deferredRouteIds.length > 0,
  });
}

export function mountFriendBuildHomeStaging({ documentSource = globalThis.document } = {}) {
  if (!documentSource?.querySelector) return Object.freeze({ mounted: false, observer: null });

  const apply = () => {
    const home = documentSource.querySelector('section[data-screen="home"]');
    if (home) stageFriendBuildHome(home, { documentSource });
  };
  apply();

  const Observer = documentSource.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  if (typeof Observer !== 'function' || !documentSource.body) {
    return Object.freeze({ mounted: true, observer: null });
  }
  const observer = new Observer(() => apply());
  observer.observe(documentSource.body, { subtree: true, childList: true });
  return Object.freeze({ mounted: true, observer });
}
