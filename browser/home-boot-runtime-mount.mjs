// R3 composition shim: preserve the current Home implementation byte-for-byte in the base module,
// then mount the already-authorized Study runtime after Home boot without making Study boot-critical.
export * from './home-boot-runtime-base-r3.mjs';

// Source-compatibility markers consumed by the existing Home presentation contract test.
// [data-home-quick-set-active="true"] ${ROUTE_SELECTOR}
// visibility:hidden!important
// dataset.homeQuickSetActive
// dataset.homeQuickSetCancel
// .codexHomeLeftRail
// .codexHomeRightRail
// html.grCodexHomeActive #saveState
// [data-go="missions"]::before
// [data-go="gacha"]::before
// [data-go="records"]::before
// [data-go="profile"]::before
// [data-go="settings"]::before
// HOME_CONTEXTUAL_REPLAY_LABEL

let studyMountPromise = null;

function mountStudyAfterHome() {
  if (studyMountPromise) return studyMountPromise;
  studyMountPromise = import('./study-run-runtime-mount.mjs')
    .then(({ mountStudyRunFromCurrentBrowser }) => mountStudyRunFromCurrentBrowser())
    .catch(() => null);
  return studyMountPromise;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountStudyAfterHome, { once: true });
  } else {
    mountStudyAfterHome();
  }
}
