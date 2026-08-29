# Cartridge Host Wave E — acceptance, golden fixtures, deterministic packaging

Wave E does three bounded things against the merged Wave A boundary:

1. proves the declarative install receipt can drive a complete reverse-order uninstall roundtrip in a deterministic test oracle, including shared-asset preservation and idempotent retry;
2. supplies exactly two small recipe cartridges: one educational (`golden.brain-number-match`) and one ordinary (`golden.card-memory`);
3. derives a deterministic `gameroad.cartridge-catalog.v1` from validated golden manifests, with `--check` support for stale generated output.

Wave E intentionally does **not** implement a production installer/uninstaller, sandbox, mount, Daily adapter, Partner adapter, economy/ranked integration, or `GAMEROAD.html` wiring. Those remain separate waves. The golden recipe payload schema is fixture-owned content, not a host-owned universal game-content schema.

Acceptance commands:

```sh
node tools/build-cartridge-catalog.mjs
node tools/build-cartridge-catalog.mjs --check
node --test tests/cartridge-catalog-core.test.mjs tests/build-cartridge-catalog.test.mjs
```
