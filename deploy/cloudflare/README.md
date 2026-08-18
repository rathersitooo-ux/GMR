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

## Formal Browser release identity contract

`gameroad-version.json` is the Browser-visible release identity companion for the exact public package. It must be deployed in the same public directory as `index.html`. The current contract is:

```json
{
  "schema": "GAMEROAD_BROWSER_VERSION_V1",
  "channel": "current",
  "build_id": "<EXACT_SOURCE_COMMIT_SHA>",
  "published_at": "<EXPLICIT_RFC3339_PUBLISH_TIMESTAMP>",
  "reload_policy": "never-force-during-match"
}
```

Generation is fail-closed:

- `build_id` is the exact lowercase 40-hex Git commit used as the public package `source_commit`. It must match `manifest.json.source_commit` byte-for-byte. Branch names, task IDs, tags, historical example IDs and guessed "current" values are not release identities.
- `published_at` is an explicit RFC3339 input captured by the authorized publish executor for the exact deployment submission. Offline package construction must not derive it from Git commit time, GitHub Actions time, file mtime or an implicit `Date.now()` fallback. Missing or malformed input is an error.
- `reload_policy` is exactly `never-force-during-match`; a version change may be surfaced while a match is active, but must not force an in-match reload.
- `gameroad-version.json` must be served with `Cache-Control: no-store`. A cached or stale identity is not acceptable release evidence.
- Package/deploy tooling must reject identity generation when the package `source_commit` and `build_id` differ.

This contract defines how a real release identity is generated without inventing one before publication. It does **not** claim that a current `gameroad-version.json` has already been generated, deployed, returned HTTP 200, or accepted on physical devices. Those remain downstream implementation/deployment gates.

## Cloudflare boundary

Current Cloudflare Pages requires a Durable Object to be created by a separate Worker, then bound to the Pages project. Therefore deployment is two-stage:

1. Deploy `relay/wrangler.toml` to create/export the SQLite-backed `GAMEROADFriendRoomRelay` Worker.
2. Bind that class to the Pages project using `wrangler.pages.toml`, build `dist/` from the fresh Browser HEAD, then create Preview/Production deployments.

Do not commit Cloudflare API tokens, account IDs, zone IDs, generated `.dev.vars`, or `dist/` bytes. This R5 package contains no credential values and performs no deployment.

## Acceptance still outside R5

A green GitHub check or local unit test is not proof of public play. Fixed HTTPS/WSS, Cloudflare account binding, external Internet, physical 2/4-device play, reconnect/fault/privacy behavior and a real friend completing a match remain later gates after the production HTML owner releases and the deploy operator has authorization.
