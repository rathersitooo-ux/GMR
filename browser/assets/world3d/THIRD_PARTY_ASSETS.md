# GAMEROAD 3D world third-party inputs

This file records the bounded inputs used by the first real 3D board vertical slice. It is provenance, not a declaration that any preview asset is already formal game art.

## Quaternius Stylized Nature MegaKit

- Upstream creator/source: Quaternius, Stylized Nature MegaKit.
- Upstream terms: CC0 / free for personal and commercial use.
- Upstream pack provides FBX, OBJ and glTF; the pack contains trees, plants/flowers and rocks.
- Runtime proof mirror pinned by commit:
  - repository: `novolei/hidigame`
  - commit: `7d8c5d50e4ff41f6745d51392c769f5e9ff6503f`
  - path: `assets/nature_megakit/gltf/`
- The vertical slice currently requests only `CommonTree_1.gltf` and `Rock_Medium_1.gltf`, with their relative dependencies, from that immutable mirror path.
- Disposition: **proof-only remote CC0 preview**. It is not a formal GAMEROAD art asset and must not be treated as final art without direct visual comparison to the user-provided 3D-world reference and Human acceptance.
- Low-performance mode does not request the remote preview and uses the deterministic local geometry fallback.

## Quaternius Medieval Village MegaKit

- Upstream creator/source: Quaternius, Medieval Village MegaKit.
- Upstream terms: CC0 / free for personal and commercial use.
- Verified external candidates include modular floor, roof, wall, door, stair and tower components in glTF form.
- A public mirror with source-license file and glTF parts was inspected at:
  - repository: `dustinc555/mygame`
  - commit: `6f12ffb2f924af86d910ade13e6e2ba3df8cd3df`
  - path: `assets/vendor/quaternius/medieval_village_megakit/`
- Disposition: **candidate only** in this slice. No Medieval Village bytes are loaded by the current runtime because assembling modular buildings before the world renderer is proven would add unnecessary scope.

## Babylon.js

- Runtime graphics engine used by this vertical slice: Babylon.js `9.27.1`.
- Runtime URLs are version-pinned jsDelivr npm URLs for `babylonjs` and `babylonjs-loaders`.
- Babylon.js is an external rendering dependency, not GAMEROAD gameplay authority.
- Final production acceptance must include same-build browser/mobile loading evidence and a decision on keeping the pinned CDN dependency versus vendoring the required engine build.

## GAMEROAD authority boundary

- Existing `battle-board-world-field-renderer.mjs` remains the world-field model seam.
- Existing board graph, movement, legality, target, result, save and economy authorities are read-only.
- The graphical renderer and terrain dressing are presentation-only.
- The user-provided 2026-09-23 screenshot is the positive quality reference. The accidental generated image from the prior turn is explicitly excluded from formal reference and asset roles.
