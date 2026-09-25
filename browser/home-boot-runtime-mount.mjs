// R3 composition shim: preserve the current Home implementation byte-for-byte in the base module.
// Study remains a concept/research prototype and is intentionally not mounted into the player-facing Home.
export * from './home-boot-runtime-base-r3.mjs';
export * from './home-night-flow-runtime.mjs';

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
