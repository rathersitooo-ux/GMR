export const GACHA_PREVIEW_NOTICE_ID = 'gachaPreviewAuthorityNotice';
export const GACHA_PREVIEW_NOTICE_TEXT = '※ 現在は演出プレビューです。表示されたカードは所持・保存には反映されません。';

function styleDisclosure(note) {
  const style = note?.style;
  if (!style) return;
  style.margin = '8px 0 4px';
  style.fontSize = '12px';
  style.lineHeight = '1.45';
  style.fontWeight = '700';
  style.textAlign = 'center';
  style.letterSpacing = '.01em';
  style.pointerEvents = 'none';
}

export function ensureGachaPreviewDisclosure(documentSource = globalThis.document) {
  if (!documentSource || typeof documentSource.getElementById !== 'function' || typeof documentSource.createElement !== 'function') return null;
  try {
    const screen = documentSource.getElementById('gachaScreen');
    if (!screen) return null;

    const existing = documentSource.getElementById(GACHA_PREVIEW_NOTICE_ID);
    if (existing) return existing;

    const note = documentSource.createElement('p');
    note.id = GACHA_PREVIEW_NOTICE_ID;
    note.className = 'gachaPreviewAuthorityNotice';
    note.textContent = GACHA_PREVIEW_NOTICE_TEXT;
    note.setAttribute?.('role', 'note');
    note.setAttribute?.('data-gacha-authority', 'preview-only');
    styleDisclosure(note);

    const openButton = documentSource.getElementById('openPack');
    if (openButton?.parentNode?.insertBefore) {
      openButton.parentNode.insertBefore(note, openButton);
      return note;
    }
    if (typeof screen.prepend === 'function') {
      screen.prepend(note);
      return note;
    }
    if (typeof screen.appendChild === 'function') {
      screen.appendChild(note);
      return note;
    }
    return null;
  } catch {
    return null;
  }
}
