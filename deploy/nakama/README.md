# GAMEROAD live-service account foundation (Nakama)

This package adopts Nakama instead of implementing a second GAMEROAD-specific account, session, storage, and wallet stack.

## Why Nakama

The upstream Nakama server already provides:

- stable server-owned user UUIDs;
- device, email, Apple, Google, Game Center, Steam, Facebook, custom, and provider-based authentication/linking;
- access and refresh sessions;
- PostgreSQL-backed user storage;
- a server-authoritative virtual wallet and wallet ledger;
- optimistic-concurrency storage writes;
- atomic `multiUpdate` across storage and wallet mutations.

GAMEROAD keeps game-specific state and rules on top of those primitives rather than reimplementing them.

## Local topology

```
Browser
  -> Cloudflare Pages /account facade
      -> Nakama 3.41.0
          -> PostgreSQL 16.8
```

Existing Cloudflare friend-room/match relay code remains separate. Account state is not stored in room Durable Objects.

## Start locally

From `deploy/nakama`:

```sh
docker compose up
```

Nakama HTTP is available on `http://127.0.0.1:7350` and the local console on `http://127.0.0.1:7351`.

The compose file is a development stack, not the production topology.

## Production scale boundary

GAMEROAD targets a live-service population in the thousands to tens of thousands and must not treat one local/open-source Nakama node as production-complete.

For production:

- use TLS and unique non-default Nakama server/session/runtime keys;
- use managed or otherwise highly available PostgreSQL with backups and restore drills;
- use metrics, alerts, rate limits, abuse controls, and secret management;
- use Nakama Enterprise or Heroic Cloud when high-availability multi-node clustering/failover is required;
- load-test the exact GAMEROAD account, wallet, storage, and concurrent-login workload before launch.

Nakama's cluster configuration and automatic inter-node state synchronization are Enterprise/managed-cloud capabilities. The game-facing account contract in this package intentionally uses standard Nakama APIs/runtime primitives so moving from the local open-source development stack to that production topology does not require inventing a second account model.

## GAMEROAD onboarding MANII

`modules/index.js` registers `gameroad_bootstrap` and post-auth hooks.

The first authenticated bootstrap performs one Nakama `multiUpdate` transaction containing both:

1. a server-only (`permissionRead: 0`, `permissionWrite: 0`) storage marker `gameroad_economy/onboarding_manii_v1` written with `version: "*"` (create-only);
2. a +100 `MANII` wallet update with wallet-ledger recording enabled.

The marker and wallet change therefore succeed or roll back together. Concurrent logins cannot double-grant because only one create-only marker can win. A losing concurrent attempt re-reads the marker and converges to the already-granted state.

## Cloudflare account facade

`deploy/cloudflare/functions/account.js` exposes same-origin operations:

- `POST /account?op=authenticate-device`
- `POST /account?op=refresh`
- `GET /account?op=account`
- `POST /account?op=logout`

Required Pages environment:

- `NAKAMA_BASE_URL` — HTTPS Nakama endpoint. Localhost HTTP is accepted for development.
- `NAKAMA_SERVER_KEY` — configure as a secret; never commit its value.
- `GAMEROAD_ACCOUNT_COOKIE_SECURE=0` — optional local-only override when testing Pages on plain HTTP.

The refresh token is stored in an HttpOnly, SameSite=Strict cookie. Browser code receives only the short-lived Nakama access token.

## Boundary of this slice

This foundation does not yet:

- restrict deck building to owned cards;
- grant cards from gacha;
- implement Shop purchase/receipt/ownership;
- equip the Saasuna sleeve;
- expose Google/Apple/Steam linking in the GAMEROAD UI;
- claim production scaling acceptance.

Those features should consume the same Nakama user UUID, storage, wallet, and transaction primitives rather than create parallel identity or economy stores.
