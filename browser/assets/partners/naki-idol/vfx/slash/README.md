# Pixel sword slash CC0 trial

## Source and license evidence

- Source page: <https://opengameart.org/content/pixel-art-sword-slash-effect>
- Creator: tbbk
- Source page license: CC0 1.0. The creator says credit is appreciated but not required.
- Original attachment: `pixel_art_sword_slash_sprites.png`, 192 × 141 RGBA, arranged as a 3 × 3 atlas of 64 × 47 frames.
- Source preview: 9 frames at 25 fps (40 ms per frame), looping.
- Product copy: `pixel-art-sword-slash-cc0-9x1-576x47.png`, a row-major 9 × 1 atlas. The nine RGBA frames are pixel-identical to the original cells; the packing changes only their arrangement.
- Original PNG SHA-256: `7642aa4698828f6cc908b3fd2873c3b3d8555138bae188991c6b775ae0c96915`
- Packed PNG SHA-256: `6bc33b1c97a946de0b07b87c251993483ae998329122bc0dbddb54cd1af28e87`

## Runtime trial

The existing Battle DOM/CSS adapter consumes the sheet as a pixelated overlay during an ordinary attack's release phase. It plays once over 360 ms, stays out of pointer input, pauses during hitstop, and clears on return. Ability/Naki-song attacks, low-performance mode, and reduced-motion presentation do not activate it. The existing CSS impact/crescent effects are hidden while this sheet is active to prevent overlap.

The same bytes are embedded in `browser/profile-presentation-runtime-mount.mjs` because the packaged profile route carries an inline copy of the adapter and its image assets.

## Limits and next check

The source provides no pivot or attack-origin metadata. The trial uses a fixed center-arena placement slightly toward the target; verify its scale, timing, overlap, and apparent origin in the actual battle viewport before formal art acceptance. This source is a slash/hit overlay, not character motion, and this trial does not complete the broader Battle cinematic task or its human visual acceptance.

## Reusable asset-first steps

1. Read the current renderer, consumer, use-site, and change boundaries.
2. Search existing packs before generating new art; verify the exact source page and license.
3. Check atlas dimensions, alpha, frame order, frame count, and timing. Repack only when the consumer benefits, and compare each output frame to the source.
4. Record missing anchor/pivot data and test the asset in the real viewport without changing gameplay state or action order.
5. Mirror bytes into prepackaged routes when required, run the focused adapter and package checks, and keep visual acceptance separate from technical integration.
