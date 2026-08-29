# GAMEROAD Cartridge Host — Wave A

Wave A defines the removable-content boundary only. It does not mount a cartridge into the production UI and does not modify GAMEROAD.html, Daily, Partner, ChatGPT transport, Battle, economy, save, assets, or deploy code.

## Contracts

- Host API: `gameroad.cartridge-host.v1`; v1 compatibility is exact-match only.
- Manifest: `gameroad.cartridge-manifest.v1`; unknown fields and unknown capabilities fail closed.
- A manifest capability is a **request**, never a grant.
- The capability broker defaults to deny and requires an explicit grant bound to cartridge id + version + payload SHA-256 + capability.
- A changed version or payload digest does not inherit the old grant.
- Install receipts are declarative data. They cannot carry callbacks, executable code, or arbitrary operation kinds.
- An uninstall plan is derived by reversing the recorded install undo operations.

## Wave A capability vocabulary

`ui.surface`, `input.pointer`, `input.keyboard`, `audio.playback`, `storage.local`, `gameroad.cards.read`, `gameroad.activity.report`.

No Wave A capability grants direct writes to economy, canonical saves, ranked state, Battle state, Partner canon, or relationship state.

## Entry kinds

- `recipe`: host-understood data recipe; execution is a later wave.
- `module`: local module reference; sandboxed execution is a later wave.
- `external`: HTTPS external target; bridge/runtime policy is a later wave.

For local entries, absolute paths, traversal segments, protocol-looking refs, and backslashes are rejected. External entries require credential-free HTTPS.

## Install receipt undo vocabulary

`cache.delete`, `idb.delete`, `registry.remove`, `asset.release`, `subscription.remove`, `mount.detach`, `storage.deleteNamespace`.

The receipt records **what the host must undo**, not code that performs the undo. Wave B supplies the concrete installers/uninstall executors, storage namespaces, asset reference counting, sandbox runtime, and message bridge.

## Reuse decision

Wave A composes existing GAMEROAD patterns rather than creating a second maker/transport authority: strict normalization/fail-closed handling from the external creative submission boundary, isolated core/adapters from Daily and runtime mounts, and the existing ChatGPT transport remains read-only. The cartridge idea is used only as a removable packaging/runtime boundary; game-content semantics remain owned by each cartridge/consumer.
