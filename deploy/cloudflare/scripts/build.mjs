import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  VERSION_MANIFEST_FILENAME,
  serializeVersionManifest,
} from './generate-version-manifest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const defaultSource = path.join(repoRoot, 'browser/GAMEROAD.html');
const defaultDist = path.join(repoRoot, 'deploy/cloudflare/dist');

const FORMAL_SELECTED3_SFX_BLOBS = Object.freeze({
  click: '4564b888c25143eaed79c384a5ce02054813a41c',
  cardSlide: 'b0090036bd9c0d48c3f6d79fd77eaf30901b6a05',
  cardPlace: '42bbfa8ea2daaadd237c48287388c7c931cc817e',
});
const FORMAL_PARTNER_CONVERSATION_BLOBS = Object.freeze({
  core: '4c389c95de525cffd0a0eafad95ec03dde9d4e90',
  saasunaSource: 'c1fc8e854cd08e3e29649becbc097e83f5ca96c7',
});

const ARTIFACT_SPECS = Object.freeze([
  { option: 'coreSource', expected: 'expectedCoreBlob', source: 'browser/deck-save-recovery-core.mjs', output: 'deck-save-recovery-core.mjs', artifact: 'deck_save_recovery_core', label: 'Deck save recovery core', sourceFlag: '--core-source', expectedFlag: '--expected-core-blob' },
  { option: 'deckSaveAckCoreSource', expected: 'expectedDeckSaveAckCoreBlob', source: 'browser/deck-save-ack-core.mjs', output: 'deck-save-ack-core.mjs', artifact: 'deck_save_ack_core', label: 'Deck save ACK core', sourceFlag: '--deck-save-ack-core-source', expectedFlag: '--expected-deck-save-ack-core-blob' },
  { option: 'presenceCoreSource', expected: 'expectedPresenceCoreBlob', source: 'browser/hate-peer-presence-core.mjs', output: 'hate-peer-presence-core.mjs', artifact: 'hate_peer_presence_core', label: 'HATE peer presence core', sourceFlag: '--presence-core-source', expectedFlag: '--expected-presence-core-blob' },
  { option: 'navigationCoreSource', expected: 'expectedNavigationCoreBlob', source: 'browser/screen-navigation-core.mjs', output: 'screen-navigation-core.mjs', artifact: 'screen_navigation_core', label: 'Screen navigation core', sourceFlag: '--navigation-core-source', expectedFlag: '--expected-navigation-core-blob' },
  { source: 'browser/temp-sfx-reference-runtime.mjs', output: 'temp-sfx-reference-runtime.mjs', artifact: 'temp_sfx_reference_runtime', label: 'Temporary synthesized reference SFX runtime' },
  { source: 'assets/visual/effects/screen-transition-edge-shimmer-sprite-v1.png', output: 'assets/visual/effects/screen-transition-edge-shimmer-sprite-v1.png', artifact: 'screen_transition_edge_shimmer_sprite', label: 'Screen transition edge shimmer sprite' },
  { source: 'assets/visual/effects/records-selection-sweep-sprite-v1.png', output: 'assets/visual/effects/records-selection-sweep-sprite-v1.png', artifact: 'records_selection_sweep_sprite', label: 'Records selection sweep sprite' },
  { source: 'browser/assets/visual/rank-match/waiting-bg.webp', output: 'assets/visual/rank-match/waiting-bg.webp', artifact: 'rank_match_waiting_bg', label: 'Rank Match waiting background' },
  { source: 'browser/assets/visual/rank-match/ui-chrome.webp', output: 'assets/visual/rank-match/ui-chrome.webp', artifact: 'rank_match_ui_chrome', label: 'Rank Match UI chrome' },
  { source: 'browser/assets/visual/rank-match/partner-picker.webp', output: 'assets/visual/rank-match/partner-picker.webp', artifact: 'rank_match_partner_picker', label: 'Rank Match partner picker texture' },
  { source: 'browser/assets/visual/rank-match/picker-modal.webp', output: 'assets/visual/rank-match/picker-modal.webp', artifact: 'rank_match_picker_modal', label: 'Rank Match picker modal' },
  { source: 'browser/assets/visual/rank-match/picker-tile-selected.webp', output: 'assets/visual/rank-match/picker-tile-selected.webp', artifact: 'rank_match_picker_tile_selected', label: 'Rank Match selected picker tile' },
  { source: 'browser/assets/visual/rank-match/button-primary.webp', output: 'assets/visual/rank-match/button-primary.webp', artifact: 'rank_match_button_primary', label: 'Rank Match primary button' },
  { source: 'browser/assets/visual/rank-match/button-secondary.webp', output: 'assets/visual/rank-match/button-secondary.webp', artifact: 'rank_match_button_secondary', label: 'Rank Match secondary button' },
  { source: 'browser/assets/visual/rank-match/action-ring.webp', output: 'assets/visual/rank-match/action-ring.webp', artifact: 'rank_match_action_ring', label: 'Rank Match action ring' },
  { source: 'browser/assets/visual/rank-match/waiting-vfx.webp', output: 'assets/visual/rank-match/waiting-vfx.webp', artifact: 'rank_match_waiting_vfx', label: 'Rank Match waiting VFX' },
  { option: 'resultPresentationCoreSource', expected: 'expectedResultPresentationCoreBlob', source: 'browser/result-presentation-core.mjs', output: 'result-presentation-core.mjs', artifact: 'result_presentation_core', label: 'Result presentation core', sourceFlag: '--result-presentation-core-source', expectedFlag: '--expected-result-presentation-core-blob' },
  { option: 'postMatchAutoqueueCoreSource', expected: 'expectedPostMatchAutoqueueCoreBlob', source: 'browser/post-match-autoqueue-core.mjs', output: 'post-match-autoqueue-core.mjs', artifact: 'post_match_autoqueue_core', label: 'Post-match autoqueue core', sourceFlag: '--post-match-autoqueue-core-source', expectedFlag: '--expected-post-match-autoqueue-core-blob' },
  { option: 'replayAdapterSource', expected: 'expectedReplayAdapterBlob', source: 'browser/battle-replay-live-adapter.mjs', output: 'battle-replay-live-adapter.mjs', artifact: 'battle_replay_live_adapter', label: 'Battle replay live adapter', sourceFlag: '--replay-adapter-source', expectedFlag: '--expected-replay-adapter-blob' },
  { option: 'remainingDeckInspectCoreSource', expected: 'expectedRemainingDeckInspectCoreBlob', source: 'browser/battle-self-deck-inspect-core.mjs', output: 'battle-self-deck-inspect-core.mjs', artifact: 'battle_self_deck_inspect_core', label: 'Battle viewer-safe remaining Deck inspect core', sourceFlag: '--remaining-deck-inspect-core-source', expectedFlag: '--expected-remaining-deck-inspect-core-blob' },
  { source: 'browser/battle-self-deck-owner-knowledge-adapter.mjs', output: 'battle-self-deck-owner-knowledge-adapter.mjs', artifact: 'battle_self_deck_owner_knowledge_adapter', label: 'Battle owner-safe remaining Deck knowledge adapter' },
  { source: 'browser/battle-self-deck-live-consumer.mjs', output: 'battle-self-deck-live-consumer.mjs', artifact: 'battle_self_deck_live_consumer', label: 'Battle owner remaining Deck live consumer' },
  { option: 'partnerBattleEventProjectionSource', expected: 'expectedPartnerBattleEventProjectionBlob', source: 'browser/partner-battle-event-log-projection.mjs', output: 'partner-battle-event-log-projection.mjs', artifact: 'partner_battle_event_log_projection', label: 'Partner battle event projection', sourceFlag: '--partner-battle-event-projection-source', expectedFlag: '--expected-partner-battle-event-projection-blob' },
  { option: 'naki4pBoardVisualBindingSource', expected: 'expectedNaki4pBoardVisualBindingBlob', source: 'browser/battle-board-naki-4p-visual-binding.mjs', output: 'battle-board-naki-4p-visual-binding.mjs', artifact: 'battle_board_naki_4p_visual_binding', label: 'Naki 4P actual-board visual binding', sourceFlag: '--naki-4p-board-visual-binding-source', expectedFlag: '--expected-naki-4p-board-visual-binding-blob' },
  { source: 'browser/battle-controlled-character-motion-core.mjs', output: 'battle-controlled-character-motion-core.mjs', artifact: 'battle_controlled_character_motion_core', label: 'Battle controlled character motion core' },
  { source: 'browser/battle-controlled-character-4p-motion-director.mjs', output: 'battle-controlled-character-4p-motion-director.mjs', artifact: 'battle_controlled_character_4p_motion_director', label: 'Battle controlled character 4P motion director' },
  { source: 'browser/battle-camera-control-core.mjs', output: 'battle-camera-control-core.mjs', artifact: 'battle_camera_control_core', label: 'Battle camera control core' },
  { source: 'browser/battle-camera-input-router.mjs', output: 'battle-camera-input-router.mjs', artifact: 'battle_camera_input_router', label: 'Battle camera input router' },
  { source: 'browser/battle-camera-live-runtime.mjs', output: 'battle-camera-live-runtime.mjs', artifact: 'battle_camera_live_runtime', label: 'Battle camera live runtime' },
  { source: 'browser/battle-2v2-reconnect-core.mjs', output: 'battle-2v2-reconnect-core.mjs', artifact: 'battle_2v2_reconnect_core', label: 'Battle 2v2 reconnect core' },
  { source: 'browser/battle-recovery-presentation-core.mjs', output: 'battle-recovery-presentation-core.mjs', artifact: 'battle_recovery_presentation_core', label: 'Battle recovery presentation core' },
  { source: 'browser/battle-recovery-runtime-surface.mjs', output: 'battle-recovery-runtime-surface.mjs', artifact: 'battle_recovery_runtime_surface', label: 'Battle recovery runtime surface' },
  { source: 'browser/battle-recovery-live-adapter.mjs', output: 'battle-recovery-live-adapter.mjs', artifact: 'battle_recovery_live_adapter', label: 'Battle recovery live adapter' },
  { source: 'browser/battle-interaction-feedback-cue-core.mjs', output: 'battle-interaction-feedback-cue-core.mjs', artifact: 'battle_interaction_feedback_cue_core', label: 'Battle interaction feedback cue core' },
  { source: 'browser/battle-invalid-action-feedback-live-adapter.mjs', output: 'battle-invalid-action-feedback-live-adapter.mjs', artifact: 'battle_invalid_action_feedback_live_adapter', label: 'Battle invalid-action feedback live adapter' },
  // BATTLE_CENTRAL_WORLD_PUBLIC_PACKAGE_R4 — package the already-merged presentation chain; no live/gameplay authority.
  { option: 'newBaseGoalPathPresentationCoreSource', expected: 'expectedNewBaseGoalPathPresentationCoreBlob', source: 'browser/new-base-goal-path-presentation-core.mjs', output: 'new-base-goal-path-presentation-core.mjs', artifact: 'new_base_goal_path_presentation_core', label: 'New Base GOAL path presentation core', sourceFlag: '--new-base-goal-path-presentation-core-source', expectedFlag: '--expected-new-base-goal-path-presentation-core-blob' },
  { option: 'newBaseProgressionLanePresentationCoreSource', expected: 'expectedNewBaseProgressionLanePresentationCoreBlob', source: 'browser/new-base-progression-lane-presentation-core.mjs', output: 'new-base-progression-lane-presentation-core.mjs', artifact: 'new_base_progression_lane_presentation_core', label: 'New Base progression lane presentation core', sourceFlag: '--new-base-progression-lane-presentation-core-source', expectedFlag: '--expected-new-base-progression-lane-presentation-core-blob' },
  { option: 'newBaseFlanoraMapLayoutCoreSource', expected: 'expectedNewBaseFlanoraMapLayoutCoreBlob', source: 'browser/new-base-flanora-map-layout-core.mjs', output: 'new-base-flanora-map-layout-core.mjs', artifact: 'new_base_flanora_map_layout_core', label: 'New Base Flanora map layout core', sourceFlag: '--new-base-flanora-map-layout-core-source', expectedFlag: '--expected-new-base-flanora-map-layout-core-blob' },
  { option: 'newBaseFlanoraBoardSurfaceRuntimeSource', expected: 'expectedNewBaseFlanoraBoardSurfaceRuntimeBlob', source: 'browser/new-base-flanora-board-surface-runtime.mjs', output: 'new-base-flanora-board-surface-runtime.mjs', artifact: 'new_base_flanora_board_surface_runtime', label: 'New Base Flanora board surface runtime', sourceFlag: '--new-base-flanora-board-surface-runtime-source', expectedFlag: '--expected-new-base-flanora-board-surface-runtime-blob' },
  { option: 'battleFlanoraLegacyBoardBridgeSource', expected: 'expectedBattleFlanoraLegacyBoardBridgeBlob', source: 'browser/battle-flanora-legacy-board-bridge.mjs', output: 'battle-flanora-legacy-board-bridge.mjs', artifact: 'battle_flanora_legacy_board_bridge', label: 'Battle Flanora legacy-board authority bridge', sourceFlag: '--battle-flanora-legacy-board-bridge-source', expectedFlag: '--expected-battle-flanora-legacy-board-bridge-blob' },
  // BATTLE_CENTRAL_WORLD_PUBLIC_PACKAGE_R5 — close existing live-composer imports; no HTML/gameplay authority.
  { option: 'newBaseGoalPathCoreSource', expected: 'expectedNewBaseGoalPathCoreBlob', source: 'browser/new-base-goal-path-core.mjs', output: 'new-base-goal-path-core.mjs', artifact: 'new_base_goal_path_core', label: 'New Base GOAL path core', sourceFlag: '--new-base-goal-path-core-source', expectedFlag: '--expected-new-base-goal-path-core-blob' },
  { option: 'newBaseGoalEntryGateCueRuntimeSource', expected: 'expectedNewBaseGoalEntryGateCueRuntimeBlob', source: 'browser/new-base-goal-entry-gate-cue-runtime.mjs', output: 'new-base-goal-entry-gate-cue-runtime.mjs', artifact: 'new_base_goal_entry_gate_cue_runtime', label: 'New Base GOAL entry gate cue runtime', sourceFlag: '--new-base-goal-entry-gate-cue-runtime-source', expectedFlag: '--expected-new-base-goal-entry-gate-cue-runtime-blob' },
  { option: 'battleNewBaseBoardLivePresentationComposerSource', expected: 'expectedBattleNewBaseBoardLivePresentationComposerBlob', source: 'browser/battle-new-base-board-live-presentation-composer.mjs', output: 'battle-new-base-board-live-presentation-composer.mjs', artifact: 'battle_new_base_board_live_presentation_composer', label: 'Battle New Base board live presentation composer', sourceFlag: '--battle-new-base-board-live-presentation-composer-source', expectedFlag: '--expected-battle-new-base-board-live-presentation-composer-blob' },
  { option: 'newBaseBattleBoardVisualGraphSource', expected: 'expectedNewBaseBattleBoardVisualGraphBlob', source: 'browser/new-base-battle-board-visual-graph.mjs', output: 'new-base-battle-board-visual-graph.mjs', artifact: 'new_base_battle_board_visual_graph', label: 'New Base canonical Battle board visual graph', sourceFlag: '--new-base-battle-board-visual-graph-source', expectedFlag: '--expected-new-base-battle-board-visual-graph-blob' },
  { option: 'battleBoardWorldFieldRendererSource', expected: 'expectedBattleBoardWorldFieldRendererBlob', source: 'browser/battle-board-world-field-renderer.mjs', output: 'battle-board-world-field-renderer.mjs', artifact: 'battle_board_world_field_renderer', label: 'Battle board world-field renderer', sourceFlag: '--battle-board-world-field-renderer-source', expectedFlag: '--expected-battle-board-world-field-renderer-blob' },
  // BATTLE_SHARED_PUBLIC_PACKAGE_TRAIN_R4 — already-merged Battle runtime/public closure.
  { source: 'browser/battle-interaction-feedback-runtime.mjs', output: 'battle-interaction-feedback-runtime.mjs', artifact: 'battle_interaction_feedback_runtime', label: 'Battle accepted-action interaction feedback runtime' },
  { source: 'browser/battle-screen-presentation-core.mjs', output: 'battle-screen-presentation-core.mjs', artifact: 'battle_screen_presentation_core', label: 'Battle screen presentation core' },
  { source: 'browser/battle-critical-resource-hud-runtime.mjs', output: 'battle-critical-resource-hud-runtime.mjs', artifact: 'battle_critical_resource_hud_runtime', label: 'Battle critical resource HUD runtime' },
  { source: 'browser/battle-resolution-action-order-adapter.mjs', output: 'battle-resolution-action-order-adapter.mjs', artifact: 'battle_resolution_action_order_adapter', label: 'Battle resolution action-order adapter' },
  { source: 'browser/battle-resolution-board-return-presentation-core.mjs', output: 'battle-resolution-board-return-presentation-core.mjs', artifact: 'battle_resolution_board_return_presentation_core', label: 'Battle resolution board-return presentation core' },
  { source: 'browser/battle-screen-runtime-mount.mjs', output: 'battle-screen-runtime-mount.mjs', artifact: 'battle_screen_runtime_mount', label: 'Battle screen runtime mount' },
  { source: 'browser/battle-load-card-chain-presentation-core.mjs', output: 'battle-load-card-chain-presentation-core.mjs', artifact: 'battle_load_card_chain_presentation_core', label: 'Battle LOAD card chain presentation core' },
  { source: 'browser/battle-four-public-live-bridge.mjs', output: 'battle-four-public-live-bridge.mjs', artifact: 'battle_four_public_live_bridge', label: 'Battle four-public live bridge' },
  { source: 'browser/battle-four-public-live-integration.mjs', output: 'battle-four-public-live-integration.mjs', artifact: 'battle_four_public_live_integration', label: 'Battle four-public live integration' },
  { source: 'browser/battle-current-player-ui-runtime.mjs', output: 'battle-current-player-ui-runtime.mjs', artifact: 'battle_current_player_ui_runtime', label: 'Battle current player UI compositor' },
  { source: 'browser/battle-current-player-ui-live-adapter.mjs', output: 'battle-current-player-ui-live-adapter.mjs', artifact: 'battle_current_player_ui_live_adapter', label: 'Battle current player UI live adapter' },
  { source: 'browser/battle-current-action-context-presentation-core.mjs', output: 'battle-current-action-context-presentation-core.mjs', artifact: 'battle_current_action_context_presentation_core', label: 'Battle current action context presentation core' },
  { source: 'browser/battle-critical-resource-hud-live-adapter.mjs', output: 'battle-critical-resource-hud-live-adapter.mjs', artifact: 'battle_critical_resource_hud_live_adapter', label: 'Battle critical resource HUD live adapter' },
  { source: 'browser/new-base-goal-result-core.mjs', output: 'new-base-goal-result-core.mjs', artifact: 'new_base_goal_result_core', label: 'New Base GOAL result authority core' },
  { source: 'browser/new-base-goal-arrival-presentation-core.mjs', output: 'new-base-goal-arrival-presentation-core.mjs', artifact: 'new_base_goal_arrival_presentation_core', label: 'New Base GOAL arrival presentation core' },
  { source: 'browser/new-base-goal-arrival-runtime-mount.mjs', output: 'new-base-goal-arrival-runtime-mount.mjs', artifact: 'new_base_goal_arrival_runtime_mount', label: 'New Base GOAL arrival runtime mount' },
  { source: 'browser/new-base-goal-arrival-consumer.mjs', output: 'new-base-goal-arrival-consumer.mjs', artifact: 'new_base_goal_arrival_consumer', label: 'New Base GOAL arrival consumer' },
  { source: 'browser/battle-goal-arrival-live-adapter.mjs', output: 'battle-goal-arrival-live-adapter.mjs', artifact: 'battle_goal_arrival_live_adapter', label: 'Battle GOAL arrival live adapter' },
  { source: 'browser/battle-goal-arrival-live-integration.mjs', output: 'battle-goal-arrival-live-integration.mjs', artifact: 'battle_goal_arrival_live_integration', label: 'Battle GOAL arrival live integration' },
  { source: 'browser/triad-resolver-core.mjs', output: 'triad-resolver-core.mjs', artifact: 'triad_resolver_core', label: 'Triad first-win-lock resolver core' },
  { source: 'browser/battle-janken-processing-order-authority-adapter.mjs', output: 'battle-janken-processing-order-authority-adapter.mjs', artifact: 'battle_janken_processing_order_authority_adapter', label: 'Battle janken processing-order authority adapter' },
  { option: 'battleBoardVisualExplanationSource', expected: 'expectedBattleBoardVisualExplanationBlob', source: 'browser/battle-board-visual-explanation-core.mjs', output: 'battle-board-visual-explanation-core.mjs', artifact: 'battle_board_visual_explanation_core', label: 'Battle board visual explanation core', sourceFlag: '--battle-board-visual-explanation-source', expectedFlag: '--expected-battle-board-visual-explanation-blob' },
  { option: 'battleBoardVisualExplanationRuntimeMountSource', expected: 'expectedBattleBoardVisualExplanationRuntimeMountBlob', source: 'browser/battle-board-visual-explanation-runtime-mount.mjs', output: 'battle-board-visual-explanation-runtime-mount.mjs', artifact: 'battle_board_visual_explanation_runtime_mount', label: 'Battle board visual explanation runtime mount', sourceFlag: '--battle-board-visual-explanation-runtime-mount-source', expectedFlag: '--expected-battle-board-visual-explanation-runtime-mount-blob' },
  { option: 'replayCoreSource', expected: 'expectedReplayCoreBlob', source: 'browser/battle-replay-core.mjs', output: 'battle-replay-core.mjs', artifact: 'battle_replay_core', label: 'Battle replay core', sourceFlag: '--replay-core-source', expectedFlag: '--expected-replay-core-blob' },
  { option: 'cardPresentationCoreSource', expected: 'expectedCardPresentationCoreBlob', source: 'browser/card-presentation-core.mjs', output: 'card-presentation-core.mjs', artifact: 'card_presentation_core', label: 'Card presentation core', sourceFlag: '--card-presentation-core-source', expectedFlag: '--expected-card-presentation-core-blob' },
  { option: 'cardsDeckPresentationSource', source: 'browser/cards-deck-presentation.mjs', output: 'cards-deck-presentation.mjs', artifact: 'cards_deck_presentation', label: 'Cards deck presentation', sourceFlag: '--cards-deck-presentation-source' },
  { source: 'browser/cards-deck-presentation-core.mjs', output: 'cards-deck-presentation-core.mjs', artifact: 'cards_deck_presentation_core', label: 'Cards deck presentation core' },
  { source: 'browser/deck-storage-corner-runtime.mjs', output: 'deck-storage-corner-runtime.mjs', artifact: 'deck_storage_corner_runtime', label: 'Deck Storage corner runtime' },
  { source: 'browser/deck-storage-corner-core.mjs', output: 'deck-storage-corner-core.mjs', artifact: 'deck_storage_corner_core', label: 'Deck Storage corner core' },
  { source: 'browser/ze-kuu-formal-card-art-runtime.mjs', output: 'ze-kuu-formal-card-art-runtime.mjs', artifact: 'ze_kuu_formal_card_art_runtime', label: 'Ze-Kuu formal card art runtime' },
  { source: 'assets/visual/cards/dcg-ze-kuu.jpg', output: 'assets/visual/cards/dcg-ze-kuu.jpg', artifact: 'ze_kuu_formal_card_art', label: 'Ze-Kuu formal card art' },
  { source: 'browser/battle-janken-slidepad-runtime-mount.mjs', output: 'battle-janken-slidepad-runtime-mount.mjs', artifact: 'battle_janken_slidepad_runtime_mount', label: 'Battle janken SlidePad runtime mount' },
  { source: 'browser/battle-hidden-road-janken-slidepad-integration.mjs', output: 'battle-hidden-road-janken-slidepad-integration.mjs', artifact: 'battle_hidden_road_janken_slidepad_integration', label: 'Battle Hidden Road janken SlidePad integration' },
  { source: 'browser/battle-hidden-hand-add-button-runtime.mjs', output: 'battle-hidden-hand-add-button-runtime.mjs', artifact: 'battle_hidden_hand_add_button_runtime', label: 'Battle Hidden Hand add-button runtime' },
  { source: 'browser/new-base-hidden-hand-runtime-core.mjs', output: 'new-base-hidden-hand-runtime-core.mjs', artifact: 'new_base_hidden_hand_runtime_core', label: 'New Base Hidden Hand runtime core' },
  { source: 'assets/visual/battle-power-energy.jpg', output: 'assets/visual/battle-power-energy.jpg', artifact: 'battle_power_energy_visual', label: 'Battle Power Energy visual' },
  { source: 'browser/battle-card-release-flight-motion-core.mjs', output: 'battle-card-release-flight-motion-core.mjs', artifact: 'battle_card_release_flight_motion_core', label: 'Battle card release flight motion core' },
  { source: 'browser/battle-card-release-flight-runtime-effect.mjs', output: 'battle-card-release-flight-runtime-effect.mjs', artifact: 'battle_card_release_flight_runtime_effect', label: 'Battle card release flight runtime effect' },
  { source: 'browser/battle-janken-compound-attack-package-core.mjs', output: 'battle-janken-compound-attack-package-core.mjs', artifact: 'battle_janken_compound_attack_package_core', label: 'Battle janken compound attack package core' },
  { source: 'browser/new-base-hand3-uniform-assignment-policy.mjs', output: 'new-base-hand3-uniform-assignment-policy.mjs', artifact: 'new_base_hand3_uniform_assignment_policy', label: 'New Base Hand3 uniform assignment policy' },
  { source: 'browser/battle-optional-rule-activation-core.mjs', output: 'battle-optional-rule-activation-core.mjs', artifact: 'battle_optional_rule_activation_core', label: 'Battle optional rule activation core' },
  { source: 'browser/battle-new-base-live-consumer-adapter.mjs', output: 'battle-new-base-live-consumer-adapter.mjs', artifact: 'battle_new_base_live_consumer_adapter', label: 'Battle New Base live consumer adapter' },
  { source: 'browser/road-move-compatibility-core.mjs', output: 'road-move-compatibility-core.mjs', artifact: 'road_move_compatibility_core', label: 'Road move compatibility core' },
  { source: 'browser/battle-compound-attack-preview-runtime.mjs', output: 'battle-compound-attack-preview-runtime.mjs', artifact: 'battle_compound_attack_preview_runtime', label: 'Battle compound attack preview runtime' },
  { source: 'browser/battle-compound-preview-live-consumer-bridge.mjs', output: 'battle-compound-preview-live-consumer-bridge.mjs', artifact: 'battle_compound_preview_live_consumer_bridge', label: 'Battle compound preview live consumer bridge' },
  { source: 'browser/battle-janken-slidepad-live-input-coordinator.mjs', output: 'battle-janken-slidepad-live-input-coordinator.mjs', artifact: 'battle_janken_slidepad_live_input_coordinator', label: 'Battle janken SlidePad live input coordinator' },
  { source: 'browser/battle-janken-focus-presentation-core.mjs', output: 'battle-janken-focus-presentation-core.mjs', artifact: 'battle_janken_focus_presentation_core', label: 'Battle janken focus presentation core' },
  { source: 'browser/battle-janken-focus-runtime-surface.mjs', output: 'battle-janken-focus-runtime-surface.mjs', artifact: 'battle_janken_focus_runtime_surface', label: 'Battle janken focus runtime surface' },
  { source: 'browser/battle-janken-focus-authority-context.mjs', output: 'battle-janken-focus-authority-context.mjs', artifact: 'battle_janken_focus_authority_context', label: 'Battle janken focus authority context' },
  { source: 'browser/battle-janken-focus-live-integration.mjs', output: 'battle-janken-focus-live-integration.mjs', artifact: 'battle_janken_focus_live_integration', label: 'Battle janken focus live integration' },
  { source: 'browser/battle-janken-order-live-adapter.mjs', output: 'battle-janken-order-live-adapter.mjs', artifact: 'battle_janken_order_live_adapter', label: 'Battle janken processing-order live adapter' },
  { source: 'browser/battle-janken-order-chain-presentation-core.mjs', output: 'battle-janken-order-chain-presentation-core.mjs', artifact: 'battle_janken_order_chain_presentation_core', label: 'Battle janken processing-order chain presentation core' },
  { source: 'browser/battle-janken-order-motion-core.mjs', output: 'battle-janken-order-motion-core.mjs', artifact: 'battle_janken_order_motion_core', label: 'Battle janken processing-order motion core' },
  { source: 'browser/battle-action-order-presentation-core.mjs', output: 'battle-action-order-presentation-core.mjs', artifact: 'battle_action_order_presentation_core', label: 'Battle action-order presentation core' },
  { source: 'browser/battle-thumb-cluster-presentation-core.mjs', output: 'battle-thumb-cluster-presentation-core.mjs', artifact: 'battle_thumb_cluster_presentation_core', label: 'Battle right-thumb cluster presentation core' },
  { source: 'browser/battle-playable-hand-row-roulette-runtime.mjs', output: 'battle-playable-hand-row-roulette-runtime.mjs', artifact: 'battle_playable_hand_row_roulette_runtime', label: 'Battle playable hand row roulette runtime' },
  { source: 'browser/battle-playable-hand-row-roulette-oreca-presentation-core.mjs', output: 'battle-playable-hand-row-roulette-oreca-presentation-core.mjs', artifact: 'battle_playable_hand_row_roulette_oreca_presentation_core', label: 'Battle playable hand row roulette Oreca presentation core' },
  { source: 'browser/new-base-round-start-janken-slot-assignment-core.mjs', output: 'new-base-round-start-janken-slot-assignment-core.mjs', artifact: 'new_base_round_start_janken_slot_assignment_core', label: 'Round-start janken slot assignment core' },
  { source: 'browser/new-base-fixed-janken-slot-state.mjs', output: 'new-base-fixed-janken-slot-state.mjs', artifact: 'new_base_fixed_janken_slot_state', label: 'Fixed janken slot state' },
  { option: 'battleConveyorCoreSource', expected: 'expectedBattleConveyorCoreBlob', source: 'browser/battle-conveyor-presentation-core.mjs', output: 'battle-conveyor-presentation-core.mjs', artifact: 'battle_conveyor_presentation_core', label: 'Battle conveyor presentation core', sourceFlag: '--battle-conveyor-core-source', expectedFlag: '--expected-battle-conveyor-core-blob' },
  { option: 'boardFacilityClassicSource', expected: 'expectedBoardFacilityClassicBlob', source: 'browser/board-facility-state-core.classic.js', output: 'board-facility-state-core.classic.js', artifact: 'board_facility_classic', label: 'Board facility classic bridge', sourceFlag: '--board-facility-classic-source', expectedFlag: '--expected-board-facility-classic-blob' },
  { option: 'boardFacilityCoreSource', expected: 'expectedBoardFacilityCoreBlob', source: 'browser/board-facility-state-core.mjs', output: 'board-facility-state-core.mjs', artifact: 'board_facility_core', label: 'Board facility core', sourceFlag: '--board-facility-core-source', expectedFlag: '--expected-board-facility-core-blob' },
  { option: 'boardFacilityRuntimeMountSource', expected: 'expectedBoardFacilityRuntimeMountBlob', source: 'browser/board-facility-runtime-mount.mjs', output: 'board-facility-runtime-mount.mjs', artifact: 'board_facility_runtime_mount', label: 'Board facility runtime mount', sourceFlag: '--board-facility-runtime-mount-source', expectedFlag: '--expected-board-facility-runtime-mount-blob' },
  { source: 'browser/partner-conversation-core.mjs', output: 'partner-conversation-core.mjs', artifact: 'partner_conversation_core', label: 'Partner conversation core', formalBlob: FORMAL_PARTNER_CONVERSATION_BLOBS.core },
  { source: 'browser/partner-saasuna-conversation-source.mjs', output: 'partner-saasuna-conversation-source.mjs', artifact: 'partner_saasuna_conversation_source', label: 'Partner Saasuna conversation source', formalBlob: FORMAL_PARTNER_CONVERSATION_BLOBS.saasunaSource },
  { source: 'browser/partner-advice-player-control-core.mjs', output: 'partner-advice-player-control-core.mjs', artifact: 'partner_advice_player_control_core', label: 'Partner advice player control core' },
  { source: 'browser/partner-dialogue-source-registry.mjs', output: 'partner-dialogue-source-registry.mjs', artifact: 'partner_dialogue_source_registry', label: 'Partner dialogue source registry' },
  { source: 'browser/partner-tea-quick-choice-core.mjs', output: 'partner-tea-quick-choice-core.mjs', artifact: 'partner_tea_quick_choice_core', label: 'Partner Tea quick-choice core' },
  { source: 'browser/partner-tea-runtime-mount.mjs', output: 'partner-tea-runtime-mount.mjs', artifact: 'partner_tea_runtime_mount', label: 'Partner Tea quick-choice runtime mount' },
  { source: 'browser/partner-shell-presentation-core.mjs', output: 'partner-shell-presentation-core.mjs', artifact: 'partner_shell_presentation_core', label: 'Partner shell presentation core' },
  { source: 'browser/partner-dialogue-feedback-core.mjs', output: 'partner-dialogue-feedback-core.mjs', artifact: 'partner_dialogue_feedback_core', label: 'Partner dialogue feedback core' },
  { source: 'browser/partner-saasuna-voice-runtime.mjs', output: 'partner-saasuna-voice-runtime.mjs', artifact: 'partner_saasuna_voice_runtime', label: 'Partner Saasuna voice runtime' },
  { source: 'browser/partner-costume-core.mjs', output: 'partner-costume-core.mjs', artifact: 'partner_costume_core', label: 'Partner costume core' },
  { source: 'browser/partner-costume-browser-session-runtime.mjs', output: 'partner-costume-browser-session-runtime.mjs', artifact: 'partner_costume_browser_session_runtime', label: 'Partner costume browser session runtime' },
  { source: 'browser/partner-costume-screen-runtime-mount.mjs', output: 'partner-costume-screen-runtime-mount.mjs', artifact: 'partner_costume_screen_runtime_mount', label: 'Partner costume screen runtime mount' },
  { source: 'browser/partner-shell-runtime-mount.mjs', output: 'partner-shell-runtime-mount.mjs', artifact: 'partner_shell_runtime_mount', label: 'Partner shell runtime mount' },
  { option: 'uiStateFeedbackCoreSource', expected: 'expectedUiStateFeedbackCoreBlob', source: 'browser/ui-state-feedback-core.mjs', output: 'ui-state-feedback-core.mjs', artifact: 'ui_state_feedback_core', label: 'UI state feedback core', sourceFlag: '--ui-state-feedback-core-source', expectedFlag: '--expected-ui-state-feedback-core-blob' },
  { source: 'browser/battle-auto-input-core.mjs', output: 'battle-auto-input-core.mjs', artifact: 'battle_auto_input_core', label: 'Battle Auto input core' },
  { source: 'browser/battle-precommit-clear-core.mjs', output: 'battle-precommit-clear-core.mjs', artifact: 'battle_precommit_clear_core', label: 'Battle precommit clear core' },
  { option: 'uiStateFeedbackReadyPlanAdapterSource', expected: 'expectedUiStateFeedbackReadyPlanAdapterBlob', source: 'browser/ui-state-feedback-ready-plan-adapter.mjs', output: 'ui-state-feedback-ready-plan-adapter.mjs', artifact: 'ui_state_feedback_ready_plan_adapter', label: 'UI state feedback ready-plan adapter', sourceFlag: '--ui-state-feedback-ready-plan-adapter-source', expectedFlag: '--expected-ui-state-feedback-ready-plan-adapter-blob' },
  { option: 'fieldMusicPolicyCoreSource', expected: 'expectedFieldMusicPolicyCoreBlob', source: 'browser/field-music-policy-core.mjs', output: 'field-music-policy-core.mjs', artifact: 'field_music_policy_core', label: 'Field music policy core', sourceFlag: '--field-music-policy-core-source', expectedFlag: '--expected-field-music-policy-core-blob' },
  { option: 'homeCards2p5dPresentationSource', source: 'browser/home-cards-2p5d-presentation.mjs', output: 'home-cards-2p5d-presentation.mjs', artifact: 'home_cards_2p5d_presentation', label: 'Home Cards 2.5D presentation', sourceFlag: '--home-cards-2p5d-presentation-source' },
  { option: 'homeBootRuntimeMountSource', expected: 'expectedHomeBootRuntimeMountBlob', source: 'browser/home-boot-runtime-mount.mjs', output: 'home-boot-runtime-mount.mjs', artifact: 'home_boot_runtime_mount', label: 'Home Boot runtime mount', sourceFlag: '--home-boot-runtime-mount-source', expectedFlag: '--expected-home-boot-runtime-mount-blob' },
  { source: 'browser/home-boot-runtime-base-r3.mjs', output: 'home-boot-runtime-base-r3.mjs', artifact: 'home_boot_runtime_base_r3', label: 'Home Boot runtime base R3' },
  { source: 'browser/profile-presentation-runtime-mount.mjs', output: 'profile-presentation-runtime-mount.mjs', artifact: 'profile_presentation_runtime_mount', label: 'Profile presentation runtime mount' },
  { source: 'browser/slidepad-slot-roll-core.mjs', output: 'slidepad-slot-roll-core.mjs', artifact: 'slidepad_slot_roll_core', label: 'SlidePad Slot Roll core' },
  { option: 'homeShellPresentationCoreSource', expected: 'expectedHomeShellPresentationCoreBlob', source: 'browser/home-shell-presentation-core.mjs', output: 'home-shell-presentation-core.mjs', artifact: 'home_shell_presentation_core', label: 'Home shell presentation core', sourceFlag: '--home-shell-presentation-core-source', expectedFlag: '--expected-home-shell-presentation-core-blob' },
  { option: 'homeThemeOrientationSource', expected: 'expectedHomeThemeOrientationBlob', source: 'browser/home-theme-orientation-core.mjs', output: 'home-theme-orientation-core.mjs', artifact: 'home_theme_orientation_core', label: 'Home theme/orientation core' },
  { option: 'homeLandscapeAssetSource', source: 'assets/visual/home/home-illustration-landscape.webp', output: 'assets/visual/home/home-illustration-landscape.webp', artifact: 'home_illustration_landscape', label: 'Home visual' },
  { option: 'homePortraitAssetSource', source: 'assets/visual/home/home-illustration-portrait.webp', output: 'assets/visual/home/home-illustration-portrait.webp', artifact: 'home_illustration_portrait', label: 'Home visual' },
  { option: 'partnerAdviceRuntimeMountSource', expected: 'expectedPartnerAdviceRuntimeMountBlob', source: 'browser/partner-advice-runtime-mount.mjs', output: 'partner-advice-runtime-mount.mjs', artifact: 'partner_advice_runtime_mount', label: 'Partner advice runtime mount', sourceFlag: '--partner-advice-runtime-mount-source', expectedFlag: '--expected-partner-advice-runtime-mount-blob' },
  { option: 'partnerSaasunaMotionCoreSource', expected: 'expectedPartnerSaasunaMotionCoreBlob', source: 'browser/partner-saasuna-motion-core.mjs', output: 'partner-saasuna-motion-core.mjs', artifact: 'partner_saasuna_motion_core', label: 'Partner Saasuna motion core', sourceFlag: '--partner-saasuna-motion-core-source', expectedFlag: '--expected-partner-saasuna-motion-core-blob' },
  { option: 'partnerSaasunaBustupVisualsSource', expected: 'expectedPartnerSaasunaBustupVisualsBlob', source: 'browser/partner-saasuna-bustup-visuals.mjs', output: 'partner-saasuna-bustup-visuals.mjs', artifact: 'partner_saasuna_bustup_visuals', label: 'Partner Saasuna bust-up visuals', sourceFlag: '--partner-saasuna-bustup-visuals-source', expectedFlag: '--expected-partner-saasuna-bustup-visuals-blob' },
  { source: 'browser/assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_01_HAPPY_WAVE_TRANSPARENT_20260915.png', output: 'assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_01_HAPPY_WAVE_TRANSPARENT_20260915.png', artifact: 'partner_saasuna_nav_01', label: 'Partner Saasuna nav 01' },
  { source: 'browser/assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_02_CURIOUS_CONFUSED_TRANSPARENT_20260915.png', output: 'assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_02_CURIOUS_CONFUSED_TRANSPARENT_20260915.png', artifact: 'partner_saasuna_nav_02', label: 'Partner Saasuna nav 02' },
  { source: 'browser/assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_03_SHH_TRANSPARENT_20260915.png', output: 'assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_03_SHH_TRANSPARENT_20260915.png', artifact: 'partner_saasuna_nav_03', label: 'Partner Saasuna nav 03' },
  { source: 'browser/assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_04_GUIDE_PRESENT_TRANSPARENT_20260915.png', output: 'assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_04_GUIDE_PRESENT_TRANSPARENT_20260915.png', artifact: 'partner_saasuna_nav_04', label: 'Partner Saasuna nav 04' },
  { source: 'browser/assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_05_IDLE_GENTLE_TRANSPARENT_20260915.png', output: 'assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_05_IDLE_GENTLE_TRANSPARENT_20260915.png', artifact: 'partner_saasuna_nav_05', label: 'Partner Saasuna nav 05' },
  { source: 'browser/assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_06_SURPRISED_TRANSPARENT_20260915.png', output: 'assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_06_SURPRISED_TRANSPARENT_20260915.png', artifact: 'partner_saasuna_nav_06', label: 'Partner Saasuna nav 06' },
  { source: 'browser/assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_07_TOUCH_CRY_TRANSPARENT_20260915.png', output: 'assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_07_TOUCH_CRY_TRANSPARENT_20260915.png', artifact: 'partner_saasuna_nav_07', label: 'Partner Saasuna nav 07' },
  { source: 'browser/assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_08_HAPPY_SMILE_TRANSPARENT_20260915.png', output: 'assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_08_HAPPY_SMILE_TRANSPARENT_20260915.png', artifact: 'partner_saasuna_nav_08', label: 'Partner Saasuna nav 08' },
  { source: 'browser/assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_09_SAD_DOWNCAST_TRANSPARENT_20260915.png', output: 'assets/partners/saasuna/GAMEROAD_SAASUNA_NAV_09_SAD_DOWNCAST_TRANSPARENT_20260915.png', artifact: 'partner_saasuna_nav_09', label: 'Partner Saasuna nav 09' },
  { option: 'tutorialExperienceProfileCoreSource', expected: 'expectedTutorialExperienceProfileCoreBlob', source: 'browser/tutorial-experience-profile-core.mjs', output: 'tutorial-experience-profile-core.mjs', artifact: 'tutorial_experience_profile_core', label: 'Tutorial experience profile core', sourceFlag: '--tutorial-experience-profile-core-source', expectedFlag: '--expected-tutorial-experience-profile-core-blob' },
  { option: 'partnerLegalActionAdapterSource', expected: 'expectedPartnerLegalActionAdapterBlob', source: 'browser/partner-legal-action-adapter.mjs', output: 'partner-legal-action-adapter.mjs', artifact: 'partner_legal_action_adapter', label: 'Partner legal action adapter', sourceFlag: '--partner-legal-action-adapter-source', expectedFlag: '--expected-partner-legal-action-adapter-blob' },
  { option: 'adviceCollectiveEvalSource', expected: 'expectedAdviceCollectiveEvalBlob', source: 'tools/advice-collective-eval.mjs', output: 'tools/advice-collective-eval.mjs', artifact: 'advice_collective_eval', label: 'Advice collective evaluator', sourceFlag: '--advice-collective-eval-source', expectedFlag: '--expected-advice-collective-eval-blob' },
  { option: 'clickSfxSource', source: 'assets/audio/sfx/click_002.ogg', output: 'click_002.ogg', artifact: 'sfx_click_002', label: 'Formal click SFX', formalBlob: FORMAL_SELECTED3_SFX_BLOBS.click },
  { option: 'cardSlideSfxSource', source: 'assets/audio/sfx/cardSlide6.ogg', output: 'cardSlide6.ogg', artifact: 'sfx_card_slide_6', label: 'Formal card-slide SFX', formalBlob: FORMAL_SELECTED3_SFX_BLOBS.cardSlide },
  { option: 'cardPlaceSfxSource', source: 'assets/audio/sfx/cardPlace1.ogg', output: 'cardPlace1.ogg', artifact: 'sfx_card_place_1', label: 'Formal card-place SFX', formalBlob: FORMAL_SELECTED3_SFX_BLOBS.cardPlace },
]);

function gitBlobSha1(buffer) {
  return createHash('sha1').update(Buffer.from(`blob ${buffer.length}\0`)).update(buffer).digest('hex');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function provenance(source, output, input, blob) {
  return { source, output, git_blob_sha1: blob, sha256: sha256(input), bytes: input.length };
}

function localModuleRefs(sourceText) {
  const refs = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:[^'\"]*?\s+from\s*)?(['\"])(\.{1,2}\/[^'\"?#]+\.(?:mjs|js))(?:[?#][^'\"]*)?\1/g,
    /\bimport\s*\(\s*(['\"])(\.{1,2}\/[^'\"?#]+\.(?:mjs|js))(?:[?#][^'\"]*)?\1\s*\)/g,
  ];
  for (const pattern of patterns) for (const match of sourceText.matchAll(pattern)) refs.add(match[2]);
  return [...refs].sort();
}

function resolvePublicModuleOutput(parentOutput, ref) {
  const parentDir = path.posix.dirname(`/${String(parentOutput || '')}`);
  const resolved = path.posix.normalize(path.posix.join(parentDir, ref));
  const output = resolved.replace(/^\/+/, '');
  if (!output || output.includes('\\') || output === '.' || output === '..') {
    throw new Error(`Unsupported Browser runtime dependency path in public package: ${ref}`);
  }
  return output;
}

export async function assertBrowserRuntimeDependencyCompleteness(browserInput, dist) {
  const html = Buffer.isBuffer(browserInput) ? browserInput.toString('utf8') : String(browserInput ?? '');
  const refs = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:[^'\"]*?\s+from\s*)?(['\"])(\.\/[^'\"?#]+\.(?:mjs|js))(?:[?#][^'\"]*)?\1/g,
    /\bimport\s*\(\s*(['"])(\.\/[^'"?#]+\.(?:mjs|js))(?:[?#][^'"]*)?\1\s*\)/g,
    /<script\b[^>]*\bsrc\s*=\s*(['"])(\.\/[^'"?#]+\.(?:mjs|js))(?:[?#][^'"]*)?\1[^>]*>/gi,
  ];
  for (const pattern of patterns) for (const match of html.matchAll(pattern)) refs.add(match[2]);

  const pending = [];
  for (const ref of refs) {
    const output = ref.slice(2);
    if (!output || output.includes('/') || output.includes('\\') || output === '.' || output === '..') {
      throw new Error(`Unsupported Browser runtime dependency path in public package: ${ref}`);
    }
    pending.push(output);
  }

  const visited = new Set();
  while (pending.length) {
    const output = pending.shift();
    if (visited.has(output)) continue;
    visited.add(output);
    let bytes;
    try {
      bytes = await readFile(path.join(dist, output));
    } catch (error) {
      if (error?.code === 'ENOENT') throw new Error(`Public package missing Browser runtime dependency: ./${output}`);
      throw error;
    }
    if (!/\.(?:mjs|js)$/i.test(output)) continue;
    for (const ref of localModuleRefs(bytes.toString('utf8'))) {
      const dependencyOutput = resolvePublicModuleOutput(output, ref);
      if (!visited.has(dependencyOutput)) pending.push(dependencyOutput);
    }
  }
  return [...visited].sort();
}

async function readArtifact(spec, options) {
  const sourcePath = spec.option && options[spec.option] ? options[spec.option] : path.join(repoRoot, spec.source);
  const input = await readFile(sourcePath);
  const blob = gitBlobSha1(input);
  if (spec.formalBlob && blob !== spec.formalBlob) {
    throw new Error(`${spec.label} blob mismatch: expected=${spec.formalBlob} actual=${blob}`);
  }
  if (spec.expected && options[spec.expected] && blob !== options[spec.expected]) {
    throw new Error(`${spec.label} blob mismatch: expected=${options[spec.expected]} actual=${blob}`);
  }
  return { ...spec, input, blob };
}

async function writeArtifact(dist, item) {
  const outputPath = path.join(dist, item.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, item.input);
  const roundTrip = await readFile(outputPath);
  if (!item.input.equals(roundTrip)) throw new Error(`dist/${item.output} is not byte-identical to ${item.label} source`);
}

export async function buildPackage(options = {}) {
  const source = options.source ?? defaultSource;
  const dist = options.dist ?? defaultDist;
  const input = await readFile(source);
  const blob = gitBlobSha1(input);
  if (options.expectedBlob && blob !== options.expectedBlob) {
    throw new Error(`Browser blob mismatch: expected=${options.expectedBlob} actual=${blob}`);
  }

  const artifacts = [];
  for (const spec of ARTIFACT_SPECS) artifacts.push(await readArtifact(spec, options));

  const versionManifestBytes = serializeVersionManifest({
    sourceCommit: options.sourceCommit ?? '',
    publishedAt: options.publishedAt ?? '',
  });
  const versionManifestBuffer = Buffer.from(versionManifestBytes, 'utf8');

  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  const indexPath = path.join(dist, 'index.html');
  await writeFile(indexPath, input);
  if (!input.equals(await readFile(indexPath))) throw new Error('dist/index.html is not byte-identical to Browser source');

  for (const item of artifacts) await writeArtifact(dist, item);
  await assertBrowserRuntimeDependencyCompleteness(input, dist);

  const versionManifestPath = path.join(dist, VERSION_MANIFEST_FILENAME);
  await writeFile(versionManifestPath, versionManifestBytes, 'utf8');
  if (await readFile(versionManifestPath, 'utf8') !== versionManifestBytes) {
    throw new Error(`dist/${VERSION_MANIFEST_FILENAME} is not byte-identical to generated version manifest`);
  }

  const headers = [
    '/',
    '  Cache-Control: no-cache, no-store',
    '',
    '/index.html',
    '  Cache-Control: no-cache, no-store',
    '',
    `/${VERSION_MANIFEST_FILENAME}`,
    '  Cache-Control: no-store',
    '',
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '',
  ].join('\n');
  await writeFile(path.join(dist, '_headers'), headers, 'utf8');

  const artifactManifest = {
    index_html: provenance('browser/GAMEROAD.html', 'index.html', input, blob),
  };
  for (const item of artifacts) artifactManifest[item.artifact] = provenance(item.source, item.output, item.input, item.blob);
  artifactManifest.browser_version_manifest = {
    source: 'build-package-release-identity',
    output: VERSION_MANIFEST_FILENAME,
    sha256: sha256(versionManifestBuffer),
    bytes: versionManifestBuffer.length,
  };

  const manifest = {
    schema: 'gameroad.public-pack.v1',
    source: 'browser/GAMEROAD.html',
    source_commit: String(options.sourceCommit || ''),
    git_blob_sha1: blob,
    sha256: sha256(input),
    bytes: input.length,
    artifacts: artifactManifest,
  };
  await writeFile(path.join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

const CLI_OPTIONS = new Map([
  ['--source', ['source', true]],
  ['--dist', ['dist', true]],
  ['--expected-blob', ['expectedBlob', false]],
  ['--source-commit', ['sourceCommit', false]],
  ['--published-at', ['publishedAt', false]],
]);
for (const spec of ARTIFACT_SPECS) {
  if (spec.sourceFlag) CLI_OPTIONS.set(spec.sourceFlag, [spec.option, true]);
  if (spec.expectedFlag) CLI_OPTIONS.set(spec.expectedFlag, [spec.expected, false]);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const entry = CLI_OPTIONS.get(argv[i]);
    if (!entry) throw new Error(`Unknown argument: ${argv[i]}`);
    const value = argv[++i];
    const [key, resolvePath] = entry;
    out[key] = resolvePath ? path.resolve(value) : (value || '');
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = await buildPackage(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(manifest)}\n`);
}