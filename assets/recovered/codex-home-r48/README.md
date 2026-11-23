# Codex Home R48 recovery

This folder recovers the actual historical Codex-made Home UI donor material from commit `4c30486c3a39433da2b2c31a0d549cb1bda3b888` without generating any new image.

## Recovered bytes

- `pad-battle.png` — extracted byte-for-byte from the embedded `data:image/png;base64` source
- `pad-shop.png` — extracted byte-for-byte from the embedded `data:image/png;base64` source
- `pad-partner.png` — extracted byte-for-byte from the embedded `data:image/png;base64` source
- `pad-deck.png` — extracted byte-for-byte from the embedded `data:image/png;base64` source
- `pad-center.png` — extracted byte-for-byte from the embedded `data:image/png;base64` source
- `ui-pro-max-r48.css` — the R48 visual hierarchy pass.
- `codex-home-r4-shell.css` — the broader R4 Codex Home shell styling.
- `codex-home-r4-markup.html` — historical Home markup, with embedded pad data URIs replaced by the recovered PNG file paths.
- `manifest.json` — provenance and reuse boundary.

## Reuse boundary

These are donor assets, not a request to revive old Home semantics. PR #1542 later deliberately removed the old `codexHomeVisualLayer`, `codexPartnerChip`, and `codexBattleCta` producers. Reuse the recovered visual pieces selectively against the current Home consumer and current route/state authority.
