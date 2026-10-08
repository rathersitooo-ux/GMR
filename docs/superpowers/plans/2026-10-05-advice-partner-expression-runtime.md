# Advice Partner Bust-up Expression Runtime

## Goal

Add expressive, high quality bust-up presentation for Saasuna and Naki in the existing Advice/Partner battle chat surface. Reuse each character's existing chibi art as a pose/personality reference, while keeping Board art and the independent Mesh Avatar Studio work untouched. Voice is out of scope.

## Scope

- Reuse the approved Advice partner selection and display-name sources.
- Add candidate 3×3 bust-up expression sheets and deterministic frame/state mapping for both partners.
- Preserve Saasuna's existing nine individual bust-up assets and motion behavior for their current consumers; add sprite-aware state motion only to the Advice bust-up presentation.
- Render the selected partner in the shared battle Advice surface with descriptive alt/ARIA text and accessible reduced-motion behavior.
- Crossfade same-partner expression frames over 180 ms in the game runtime; switch partner identities directly to avoid ghosting. Reduced-motion preference uses an immediate frame change.
- Treat the runtime crossfade as a visual dissolve. Continuous facial deformation requires separately layered source art and a manually refined mesh rig.
- Package the new runtime modules and PNGs in the Cloudflare public build and verify byte-identical output.
- Keep all state strictly presentational; do not alter dialogue, roster, gameplay, battle rules, Board display, or voice.

## Test-first plan

1. Add focused tests for sprite crop geometry, safe state selection, all nine expression frames, and distinct expressive mappings for Saasuna/Naki.
2. Add mount tests for selected-partner rendering, label/alt updates, legacy Saasuna behavior, and nonselected hiding.
3. Add build-contract coverage for every new module and candidate PNG; observe the focused tests fail before implementation.
4. Implement the shared frame renderer, partner maps, minimal mount integration, and explicit package artifacts.
5. Run focused tests, Cloudflare build tests, the full Node test suite, required pre-push gate, and an Advice surface smoke check if its harness is available.
6. Remove the temporary pre-action manifest before the final implementation commit/push; retain this plan as project documentation.

## Acceptance

- Both partners show distinct expression states, including deliberate asymmetric/wink or focused expressions instead of a permanently neutral, equally open-eyed face.
- Repeated Advice renders do not interrupt an in-flight expression crossfade, and switching partner identities does not blend one character into another.
- Switching the active Advice partner updates figure visibility, name, image frame, and accessible description.
- The 3×3 source sheets render one cell at a time without changing or replacing the Board sprites.
- Existing nine Saasuna asset contracts remain byte-identical.
- Public package contains both sheets and all imported runtime dependencies.
- Tests and the repository's required pre-push gate pass. No deployment is included.
