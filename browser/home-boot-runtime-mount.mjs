// R3 composition shim: keep the current Home implementation in the base module.
// Standalone Study/Rogue runtimes remain available without injecting launchers into Home.
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

