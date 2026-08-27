# B03-A — Setup Entry Worker Packet

## Exclusive scope
Setup presentation only.

### Own outputs
- current Setup state inventory
- external reference packet
- settled 16:9 target
- 844×390 target
- screenshot-to-code component map
- Setup-specific test/screenshot plan

### Current authoritative DOM/state to preserve
Current main contains `<section class="screen setup" data-screen="setup">` with:
- `data-content`: `road_shield`, `honey_hunt`
- `data-mode`: `2p`, `4p`, `2v2`
- `setupDeckNote` / `fixDeckFromSetup`
- `friendRoomEntry`
- `startMatch`

Do not invent deck legality, Partner rules, match rules, opponent authority, price/reward, or matchmaking backend.

## Visual requirement
The selected match configuration is the focus. The user must immediately understand mode/content/deck state/opponent and the primary Start action. Do not flatten all choices into equal cards.

## Collision rule
Do not edit `browser/GAMEROAD.html` concurrently with B03-B or B03-C. Visual/reference/test-design work can proceed in parallel; monolith implementation is serialized by B03-CODE-OWNER.

## Exit evidence
- target still
- 844×390 still
- component map
- current→target mapping
- acceptance checklist covering Start/back/Friend Room/deck-invalid state
