# UI Branch 1 — Home + Boot isolated presentation contract

## Scope

This branch owns only the Home/Boot presentation projections introduced by:

- `browser/home-shell-presentation-core.mjs`
- `browser/boot-loading-presentation-core.mjs`
- `tests/home-boot-presentation.test.mjs`

It does not own shared navigation, the global Transition Director, shared Reduced Motion/LowPerf/asset-failure policy, formal Home art, deploy, or main integration.

## Explicit read-only boundaries

Do not modify from this branch:

- `browser/GAMEROAD.html`
- `browser/screen-navigation-core.mjs`
- `browser/home-theme-orientation-core.mjs`
- `browser/home-cards-2p5d-presentation.mjs`
- global/shared Foundation presentation owners
- formal Home background/character asset authorities

This is intentional so Cards/Deck, Setup/Match/Social, Battle and Foundation work can proceed in parallel without mutable-file overlap.

## Current Home integration

`home-theme-orientation-core.mjs` remains the owner of Home theme identity, orientation-specific scene assets, focal anchors, safe composition, bleed and its missing-portrait fallback contract. Branch 1 consumes the output of `resolveHomeProjection(...)`; it does not replace or recompute that authority.

`projectHomeShell(...)` adds only screen-layout projection:

- `wide-landscape` for normal 16:9-class Home
- `short-landscape` for low-height landscape such as 844×390
- `portrait` for portrait layouts such as 390×844
- a minimum 44 px touch-target contract
- separate hero/navigation region ratios
- full / reduced / low-performance presentation profile selection

Route identities and the currently selected route remain caller-owned live data. The module will not invent a route or silently substitute a selected route.

### Runtime visual authority R1

The actual Home DOM contains more than one historical presentation system. The supplied illustration shell and the droplet slidepad are now treated as one canonical primary surface by `home-boot-runtime-mount.mjs`.

The repair is intentionally subtractive rather than another redesign layer:

- when `#homeMainMenuSlidePad` / `.homeSlidePad` exists, the runtime marks `data-home-primary-authority="slidepad"`;
- only under that authority it suppresses the obsolete `codexHomeVisualLayer` and the legacy rectangular Partner/Battle CTAs that duplicate the slidepad;
- when the canonical slidepad is absent, those legacy controls are not suppressed, so navigation does not disappear during partial/fallback states;
- portrait keeps Mission/Pack/Record/Profile/Settings reachable as a narrow secondary rail instead of a five-button bar across the character art;
- short-landscape narrows the center stage so title/status content does not invade the slidepad command area;
- `browser/GAMEROAD.html` remains untouched because current product work can own that monolith independently.

The invariant is **one primary visual/navigation authority at a time**. A future visual revision should replace or restyle this authority, not stack another complete Home control system on top of it.

### Missing portrait art

If the existing Home projection reports `missing_portrait_asset`, Branch 1 propagates the exact `sceneAsset`, `fallbackSceneAsset` and `fallbackPolicy`. It never silently crops a landscape source or fabricates a portrait source. Formal portrait/background completion remains a separate asset gate.

## Boot / loading contract

`boot-loading-presentation-core.mjs` models presentation for these explicit phases:

- `SPLASH`
- `LOADING`
- `READY`
- `RECOVERY`
- `UPDATE_REQUIRED`
- `ERROR`

Progress, status and error values remain live runtime slots. They must not be baked into a still image or generated video.

The presentation never invents actions. `CONTINUE`, `RETRY` and `BACK` appear only when the caller explicitly sets the corresponding capability flag. `READY` is invalid unless `canContinue=true`.

Normal, Reduced Motion and LowPerf projections preserve the same semantic state and actions.

## Final integration handoff

The final integration branch may mount these projections into the actual Home/Boot DOM only after fresh ownership/collision checks. Recommended flow:

1. Existing Home state/theme owner produces `homeProjection`.
2. Actual viewport + Home live route state are passed to `projectHomeShell(...)`.
3. Runtime renders the returned region/profile contract using formal assets and live UI.
4. Existing global Transition Director remains the only shared transition owner.
5. Boot/update/recovery authority creates `createBootLoadingState(...)`; renderer consumes `projectBootLoadingPresentation(...)`.
6. Repeated entry/back/orientation changes must not create a second navigation owner.

No `GAMEROAD.html` mutation is included here, so this branch can merge/rebase independently of branches that currently own that file.

## Acceptance targets

Home presentation must be verified at minimum at:

- 1920×1080
- 1280×720
- 844×390
- 390×844

For every supported semantic state:

- routes/actions are unchanged between Normal, Reduced Motion and LowPerf;
- primary touch targets remain at least 44 px at runtime;
- no horizontal overflow hides a primary action;
- text/data remain runtime-rendered;
- optional art failure uses the existing fallback contract;
- missing required formal art remains an explicit gate rather than a fabricated substitute;
- supplied illustration + slidepad is the only primary Home authority when the slidepad exists;
- old hero/Partner/Battle surfaces do not remain visibly stacked behind or above that authority.

## Tests

Branch-local contract test:

```sh
node --test tests/home-boot-presentation.test.mjs
```

The branch was also authored against syntax-checkable ES modules. Runtime/Playwright acceptance belongs to the later integration branch because this branch deliberately does not modify `browser/GAMEROAD.html`.
