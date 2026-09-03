// Transitional compatibility tombstone only.
// The player-facing Story feature was explicitly rejected on 2026-09-03.
// Home still imports this symbol on the current branch; keeping one inert export lets us
// remove the product behavior without reverting unrelated Home work that landed after PR #935.
// Do not add Story UI, text, progress, rewards, routing, Partner/Battle hooks, or replacement
// narrative behavior here. The remaining import/artifact references are cleanup debt only.

export const STORY_PUBLIC_DEINTEGRATION = Object.freeze({
  mounted: false,
  active: false,
  productFeature: false,
  reason: 'USER_REJECTED_20260903',
  compatibilityTombstoneOnly: true,
});

export function mountStoryFirstSceneFromCurrentBrowser() {
  if (typeof globalThis === 'object') {
    try { delete globalThis.GAMEROAD_STORY_RUNTIME; } catch {}
  }
  return STORY_PUBLIC_DEINTEGRATION;
}
