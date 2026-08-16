# GAMEROAD Cloudflare public-host R5 deploy prep

This directory is an isolated deploy-preparation package for `BROWSER-CLOUDFLARE-PUBLIC-HOST-TRANSPORT-001 R5`.
It does **not** change `browser/GAMEROAD.html`, game rules, saves, economy, Roblox, Unity, or formal assets.

## Topology

- Cloudflare Pages serves a byte-identical copy of the current `browser/GAMEROAD.html` from `dist/index.html`.
- Pages Function `/ws` forwards WebSocket upgrades to an externally deployed Durable Object binding named `GAMEROAD_ROOMS`.
- `relay/` exports `GAMEROADFriendRoomRelay`. One Durable Object instance is selected by the existing channel name `gameroad.friend.r2.<7-char-code>`.
- Relay wire is exactly `gameroad.wsrelay.v1`. The relay routes host -> one explicit `to` recipient and guest -> host; it does not implement game rules.

## Local finite checks

```sh
node --test deploy/cloudflare/tests/relay-core.test.mjs deploy/cloudflare/tests/build.test.mjs
node --check deploy/cloudflare/relay/src/relay-worker.mjs
node --check deploy/cloudflare/functions/ws.js
```

## Build package against an exact Browser revision

From repository root, after re-reading current `main` and the Browser blob SHA:

```sh
node deploy/cloudflare/scripts/build.mjs \
  --expected-blob <CURRENT_BROWSER_GIT_BLOB_SHA1> \
  --source-commit <CURRENT_MAIN_COMMIT_SHA>
```

The build aborts if the Browser Git blob differs from the expected value. `dist/index.html` is written byte-for-byte from `browser/GAMEROAD.html`; `manifest.json` records commit, Git blob SHA-1, SHA-256 and byte count. `dist/` is intentionally untracked.

## Cloudflare boundary

Current Cloudflare Pages requires a Durable Object to be created by a separate Worker, then bound to the Pages project. Therefore deployment is two-stage:

1. Deploy `relay/wrangler.toml` to create/export the SQLite-backed `GAMEROADFriendRoomRelay` Worker.
2. Bind that class to the Pages project using `wrangler.pages.toml`, build `dist/` from the fresh Browser HEAD, then create Preview/Production deployments.

Do not commit Cloudflare API tokens, account IDs, zone IDs, generated `.dev.vars`, or `dist/` bytes. This R5 package contains no credential values and performs no deployment.

## Acceptance still outside R5

A green GitHub check or local unit test is not proof of public play. Fixed HTTPS/WSS, Cloudflare account binding, external Internet, physical 2/4-device play, reconnect/fault/privacy behavior and a real friend completing a match remain later gates after the production HTML owner releases and the deploy operator has authorization.
