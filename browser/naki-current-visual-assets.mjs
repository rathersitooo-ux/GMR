export const NAKI_CURRENT_PARTNER_ID = 'partner.naki';
export const NAKI_CURRENT_DISPLAY_NAME = '緋累ナキ';

function asset(relativePath) {
  return new URL(relativePath, import.meta.url).href;
}

export const NAKI_CURRENT_VISUAL_ASSETS = Object.freeze({
  board: Object.freeze({
    atlas: asset('./assets/partners/naki-idol/current/naki-board-locomotion-r2-atlas.png'),
    columns: 4,
    rows: 8,
    frameWidth: 128,
    frameHeight: 128,
    states: Object.freeze({
      BOARD_IDLE: Object.freeze({ start: 0, frames: 8, frameDurationMs: 125, loop: true }),
      WALK_LEFT: Object.freeze({ start: 8, frames: 8, frameDurationMs: 100, loop: true }),
      WALK_RIGHT: Object.freeze({ start: 16, frames: 8, frameDurationMs: 100, loop: true }),
      ARRIVE: Object.freeze({ start: 24, frames: 8, frameDurationMs: 115, loop: false }),
    }),
    authoredFacing: Object.freeze(['WALK_LEFT', 'WALK_RIGHT']),
    mirrorPolicy: 'NEVER_MIRROR_AUTHORED_LEFT_RIGHT',
    reducedMotionFrame: 0,
  }),
  battle: Object.freeze({
    idle: asset('./assets/partners/naki-idol/battle/primary-r1/naki-idol-battle-idle-3x3.png'),
    attack: asset('./assets/partners/naki-idol/battle/primary-r1/naki-idol-battle-song-attack-3x3.png'),
    columns: 3,
    rows: 3,
    frameCount: 9,
  }),
  advice: Object.freeze({
    atlas: asset('./assets/partners/naki-idol/current/naki-advice-idle-12.webp'),
    portrait: asset('./assets/partners/naki-idol/current/naki-advice-portrait.webp'),
    columns: 4,
    rows: 3,
    frameCount: 12,
    reducedMotionFrame: 0,
  }),
});

export function isCurrentNakiCharacterId(value) {
  return value === NAKI_CURRENT_PARTNER_ID;
}

export function spriteFramePosition(columns, rows, frameIndex) {
  const safeColumns = Math.max(1, Number(columns) || 1);
  const safeRows = Math.max(1, Number(rows) || 1);
  const maxFrame = safeColumns * safeRows - 1;
  const safeFrame = Math.max(0, Math.min(maxFrame, Number.isInteger(frameIndex) ? frameIndex : 0));
  const column = safeFrame % safeColumns;
  const row = Math.floor(safeFrame / safeColumns);
  return Object.freeze({
    frame: safeFrame,
    column,
    row,
    xPercent: safeColumns === 1 ? 0 : column * 100 / (safeColumns - 1),
    yPercent: safeRows === 1 ? 0 : row * 100 / (safeRows - 1),
  });
}

export function applySpriteFrame(node, {
  src,
  columns,
  rows,
  frameIndex = 0,
} = {}) {
  if (!node?.style || !src) return null;
  const position = spriteFramePosition(columns, rows, frameIndex);
  node.style.backgroundImage = `url("${src}")`;
  node.style.backgroundRepeat = 'no-repeat';
  node.style.backgroundSize = `${Math.max(1, columns) * 100}% ${Math.max(1, rows) * 100}%`;
  node.style.backgroundPosition = `${position.xPercent}% ${position.yPercent}%`;
  node.dataset.spriteFrame = String(position.frame);
  return position;
}

export const NAKI_CURRENT_VISUAL_CONTRACT = Object.freeze({
  schema: 'gameroad.naki-current-visual.v1',
  partnerId: NAKI_CURRENT_PARTNER_ID,
  displayName: NAKI_CURRENT_DISPLAY_NAME,
  singleSourcePolicy: 'NO_LEGACY_NAKI_VISUAL_FALLBACK',
  boardSource: 'NAKI_BOARD_LOCOMOTION_R2',
  battleSource: 'NAKI_IDOL_BATTLE_PRIMARY_R1',
  adviceSource: 'NAKI_12_FRAME_CURRENT_BUSTUP',
  presentationOnly: true,
  gameplayAuthority: false,
  saveAuthority: false,
  networkAuthority: false,
});
