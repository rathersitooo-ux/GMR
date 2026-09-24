# Temporary action sound map (R2)

This pass gives every shared screen the same small interaction vocabulary. Battle keeps its own card, target, action, and turn cues. These are temporary audio candidates; they do not replace the accepted navigation click or the existing SFX settings.

## Shared screens

The shared mapping applies to Home, Cards, Characters, Setup, Missions, Profile, Shop, Gacha, Records, Settings, and other screens using the common navigation runtime.

| Action | Runtime cue | Audio file | Relative level | Trigger |
| --- | --- | --- | ---: | --- |
| Ordinary button or action | `ui_button` | `click_001.ogg` | 0.42 | Click on a generic enabled control |
| Confirm, purchase, save, start, claim, submit | `ui_confirm` | `confirmation_001.ogg` | 0.52 | Click on a confirm-like control or submit a form |
| Choose a card, character, item, or player | `ui_select` | `select_001.ogg` | 0.44 | Click on a selection-like control |
| Switch tab | `ui_tab` | `switch_001.ogg` | 0.38 | Click on a tab |
| Turn a toggle on | `ui_toggle_on` | `toggle_001.ogg` | 0.42 | Checkbox, radio, switch, or pressed control becomes on |
| Turn a toggle off | `ui_toggle_off` | `toggle_002.ogg` | 0.40 | Checkbox, radio, switch, or pressed control becomes off |
| Open panel, menu, or select list | `ui_open` | `open_001.ogg` | 0.38 | Click on an open/details/menu action or open a select list |
| Close, cancel, return, or Escape | `ui_close` | `close_001.ogg` | 0.38 | Click on a close/back action or press Escape |
| Move a range slider | `ui_slider` | `tick_001.ogg` | 0.30 | Range input; repeated slider events are rate-limited |
| Focus a text field | `ui_focus` | `click_003.ogg` | 0.30 | Focus a text, search, number, textarea, or editable field |
| Rejected or unavailable action | `ui_invalid` | `error_001.ogg` | 0.48 | Click a disabled control or rejected navigation |
| Tap an otherwise empty active screen area | `ui_empty_tap` | `click_005.ogg` | 0.18 | Short pointer tap outside controls and helper overlays |
| Accepted screen navigation | Existing formal sound | `click_002.ogg` | Existing setting | One existing playback on accepted navigation; delegated generic playback skips it |

## Battle screen

| Action | Runtime cue | Audio file | Relative level | Trigger |
| --- | --- | --- | ---: | --- |
| Select a hand card | `battle_card_select` | `bookFlip1.ogg` | 0.48 | Click a Battle hand card |
| Select a player or reachable target | `battle_target` | `metalClick.ogg` | 0.40 | Click a Battle token, target, or selectable board node |
| Commit an action | `battle_action` | `sword.1.ogg` | 0.34 | Confirm-like Battle action or drag a hand card onto a Battle target |
| Pass or end the turn | `battle_turn` | `bookClose.ogg` | 0.48 | Click a pass/end-turn action |
| Battle utility control | `battle_button` | `click_003.ogg` | 0.30 | Other enabled Battle control |
| Tap an otherwise empty Battle area | `battle_empty_tap` | `click_005.ogg` | 0.14 | Short pointer tap outside controls and helper overlays |
| Close, cancel, or return | `ui_close` | `close_001.ogg` | 0.38 | Uses the shared close cue |

## Playback and source notes

- Temporary cue level is multiplied by the current `#sfxVolume` value. `#sfxMute` suppresses temporary cues. Playback starts only during a trusted user gesture and fails softly if the browser cannot play an asset.
- Interface sounds (`click_001`, `confirmation_001`, `select_001`, `switch_001`, both toggles, `open_001`, `close_001`, `tick_001`, `click_003`, `error_001`, `click_005`) come from the Kenney Interface Sounds package.
- Battle card and board cues (`bookFlip1`, `metalClick`, `bookClose`) come from Kenney RPG Audio. The Battle action cue (`sword.1`) comes from the StarNinjas Sword Sounds attack set.
- The supplied Sacred Stones sound page informed the separate Battle action categories. Its direct sound-file route was unavailable during this pass, so the mapped playable files above come from the listed sound packages.
