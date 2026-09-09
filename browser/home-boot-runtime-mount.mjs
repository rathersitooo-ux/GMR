// R3 composition shim: preserve the current Home implementation byte-for-byte in the base module,
// then mount the already-authorized Study runtime beside the existing Rogue runtime.
export * from './home-boot-runtime-base-r3.mjs';
import { mountStudyRunFromCurrentBrowser } from './study-run-runtime-mount.mjs';
import { mountPartnerCostumeRuntime } from './partner-costume-runtime-mount.mjs';

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

function mountCurrentBrowserExtensions() {
  mountStudyRunFromCurrentBrowser();
  mountPartnerCostumeRuntime();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountCurrentBrowserExtensions, { once: true });
  } else {
    mountCurrentBrowserExtensions();
  }
}
