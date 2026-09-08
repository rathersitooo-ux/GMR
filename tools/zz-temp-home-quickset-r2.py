from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)

runtime_path = Path('browser/home-boot-runtime-mount.mjs')
runtime = runtime_path.read_text(encoding='utf-8')

runtime = replace_once(runtime,
'''const SLIDEPAD_SWITCH_ADVANTAGE = 0.22;
const SLIDEPAD_ROUTE_IDS = Object.freeze({''',
'''const SLIDEPAD_SWITCH_ADVANTAGE = 0.22;
export const HOME_QUICKSET_CANCEL_LABEL = 'キャンセル';
const HOME_QUICKSET_BUTTON_SIZE_PX = 56;
const SLIDEPAD_ROUTE_IDS = Object.freeze({''',
'quickset constants')

runtime = replace_once(runtime,
'''    detentPx: 0,
    previewNode: null,
  },
};''',
'''    detentPx: 0,
    previewNode: null,
    quickSetNode: null,
    cancelNode: null,
    cancelArmed: false,
  },
};''',
'runtime quickset fields')

runtime = replace_once(runtime,
'''${HOME_SELECTOR}[data-home-shell-mounted=\"true\"] ${ROUTE_SELECTOR}[data-home-slidepad-attached=\"true\"]{
  opacity:1;
  translate:var(--gameroad-home-slidepad-attach-x,0px) var(--gameroad-home-slidepad-attach-y,0px);
  scale:1.035;
  filter:brightness(1.16) saturate(1.08) drop-shadow(0 0 9px currentColor);
  outline:3px solid currentColor;
  outline-offset:2px;
}
${HOME_SELECTOR}[data-home-shell-mounted=\"true\"] ${SLIDEPAD_CENTER_SELECTOR}{''',
'''${HOME_SELECTOR}[data-home-shell-mounted=\"true\"] ${ROUTE_SELECTOR}[data-home-slidepad-attached=\"true\"]{
  opacity:1;
  translate:var(--gameroad-home-slidepad-attach-x,0px) var(--gameroad-home-slidepad-attach-y,0px);
  scale:1.035;
  filter:brightness(1.16) saturate(1.08) drop-shadow(0 0 9px currentColor);
  outline:3px solid currentColor;
  outline-offset:2px;
}
/* Idle Home gummies remain direct buttons. While the SlidePad is held, Quick Set owns the
   gesture and the normal gummies disappear instead of doubling as the active selector. */
${HOME_SELECTOR}[data-home-shell-mounted=\"true\"][data-home-quick-set-active=\"true\"] ${ROUTE_SELECTOR}{
  opacity:0!important;
  visibility:hidden!important;
  pointer-events:none!important;
}
${HOME_SELECTOR}[data-home-shell-mounted=\"true\"] ${SLIDEPAD_CENTER_SELECTOR}{''',
'active gummy hide CSS')

runtime = replace_once(runtime,
'''function clearPreview() {
  if (runtime.slidepad.previewButton) clearButtonAttachment(runtime.slidepad.previewButton);
  runtime.slidepad.previewButton = null;
}

export function normalizeHomeSetupModeItems(items = []) {''',
'''function clearPreview() {
  if (runtime.slidepad.previewButton) clearButtonAttachment(runtime.slidepad.previewButton);
  runtime.slidepad.previewButton = null;
}

export function resolveHomeQuickSetCancelHit({ pointerX, pointerY, cancelRect } = {}) {
  const x = Number(pointerX);
  const y = Number(pointerY);
  const left = Number(cancelRect?.left);
  const top = Number(cancelRect?.top);
  const width = Number(cancelRect?.width);
  const height = Number(cancelRect?.height);
  if (![x, y, left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return false;
  return x >= left && x <= left + width && y >= top && y <= top + height;
}

function clearHomeQuickSetProjection() {
  runtime.slotRoll.quickSetNode?.remove?.();
  runtime.slotRoll.cancelNode?.remove?.();
  runtime.slotRoll.quickSetNode = null;
  runtime.slotRoll.cancelNode = null;
  runtime.slotRoll.cancelArmed = false;
}

function setHomeQuickSetCancelArmed(armed) {
  const next = armed === true;
  runtime.slotRoll.cancelArmed = next;
  const node = runtime.slotRoll.cancelNode;
  if (!(node instanceof HTMLElement)) return next;
  node.dataset.homeQuickSetCancelArmed = next ? 'true' : 'false';
  node.style.filter = next ? 'brightness(1.18) saturate(1.08)' : 'brightness(.9) saturate(.78)';
  node.style.outline = next ? '3px solid currentColor' : '1px solid currentColor';
  return next;
}

function renderHomeQuickSetProjection(home, center) {
  const state = runtime.slotRoll.state;
  if (!(home instanceof HTMLElement) || !(center instanceof HTMLElement) || !state) return null;

  let node = runtime.slotRoll.quickSetNode;
  if (!(node instanceof HTMLElement)) {
    node = document.createElement('div');
    node.dataset.homeQuickSetPreview = 'true';
    node.setAttribute('aria-live', 'polite');
    node.style.cssText = 'position:fixed;z-index:86;display:flex;gap:8px;align-items:center;justify-content:center;pointer-events:none;transform:translate(-50%,-100%);';
    home.appendChild(node);
    runtime.slotRoll.quickSetNode = node;
  }

  const windowItems = projectSlotRollWindow(state, { radius: 1 });
  node.replaceChildren(...windowItems.map((entry) => {
    const item = document.createElement('div');
    item.dataset.homeQuickSetItem = entry.item.id;
    item.dataset.homeQuickSetSelected = entry.selected ? 'true' : 'false';
    item.textContent = entry.item.label;
    item.style.cssText = `box-sizing:border-box;width:${HOME_QUICKSET_BUTTON_SIZE_PX}px;height:${HOME_QUICKSET_BUTTON_SIZE_PX}px;border-radius:50%;display:grid;place-items:center;text-align:center;padding:5px;background:rgba(9,13,30,.9);border:${entry.selected ? 3 : 1}px solid currentColor;box-shadow:0 7px 20px rgba(0,0,0,.3);font-size:10px;font-weight:800;line-height:1.05;overflow:hidden;filter:${entry.selected ? 'brightness(1.16) saturate(1.06)' : 'brightness(.82) saturate(.72)'};`;
    return item;
  }));

  const rect = center.getBoundingClientRect();
  const viewportWidth = Math.max(HOME_QUICKSET_BUTTON_SIZE_PX, Number(globalThis.innerWidth) || document.documentElement.clientWidth || 0);
  const previewHalfWidth = Math.max(HOME_QUICKSET_BUTTON_SIZE_PX, windowItems.length * (HOME_QUICKSET_BUTTON_SIZE_PX + 8) / 2);
  const previewX = Math.min(viewportWidth - previewHalfWidth - 8, Math.max(previewHalfWidth + 8, rect.left + rect.width / 2));
  node.style.left = `${previewX}px`;
  node.style.top = `${Math.max(HOME_QUICKSET_BUTTON_SIZE_PX + 12, rect.top - 12)}px`;

  let cancel = runtime.slotRoll.cancelNode;
  if (!(cancel instanceof HTMLElement)) {
    cancel = document.createElement('div');
    cancel.dataset.homeQuickSetCancel = 'true';
    cancel.textContent = HOME_QUICKSET_CANCEL_LABEL;
    cancel.setAttribute('aria-label', HOME_QUICKSET_CANCEL_LABEL);
    cancel.style.cssText = `box-sizing:border-box;position:fixed;z-index:87;width:${HOME_QUICKSET_BUTTON_SIZE_PX}px;height:${HOME_QUICKSET_BUTTON_SIZE_PX}px;border-radius:50%;display:grid;place-items:center;text-align:center;padding:4px;background:rgba(20,20,24,.88);border:1px solid currentColor;box-shadow:0 7px 20px rgba(0,0,0,.3);font-size:10px;font-weight:800;line-height:1.05;pointer-events:none;transform:translate(-50%,-50%);`;
    home.appendChild(cancel);
    runtime.slotRoll.cancelNode = cancel;
  }
  const viewportHeight = Math.max(HOME_QUICKSET_BUTTON_SIZE_PX, Number(globalThis.innerHeight) || document.documentElement.clientHeight || 0);
  const half = HOME_QUICKSET_BUTTON_SIZE_PX / 2;
  const cancelX = Math.min(viewportWidth - half - 8, Math.max(half + 8, rect.left - half - 10));
  const cancelY = Math.min(viewportHeight - half - 8, Math.max(half + 8, rect.top + rect.height / 2));
  cancel.style.left = `${cancelX}px`;
  cancel.style.top = `${cancelY}px`;
  setHomeQuickSetCancelArmed(runtime.slotRoll.cancelArmed);
  return node;
}

function updateHomeQuickSetCancelFromPointer(event) {
  const cancel = runtime.slotRoll.cancelNode;
  if (!(cancel instanceof HTMLElement)) return setHomeQuickSetCancelArmed(false);
  return setHomeQuickSetCancelArmed(resolveHomeQuickSetCancelHit({
    pointerX: Number(event.clientX),
    pointerY: Number(event.clientY),
    cancelRect: cancel.getBoundingClientRect(),
  }));
}

export function normalizeHomeSetupModeItems(items = []) {''',
'cancel and quickset projection helpers')

runtime = replace_once(runtime,
'''function clearSlotRollProjection() {
  runtime.slotRoll.previewNode?.remove?.();''',
'''function clearSlotRollProjection() {
  clearHomeQuickSetProjection();
  runtime.slotRoll.previewNode?.remove?.();''',
'clear quickset projection')

runtime = replace_once(runtime,
'''    runtime.slotRoll.detentPx = created.detentPx;
    home.dataset.homeQuickSetActive = 'true';
    return setQuickSetButton(buttons, created.anchorId);
  };

  const updateFromPointer = (event) => {''',
'''    runtime.slotRoll.detentPx = created.detentPx;
    home.dataset.homeQuickSetActive = 'true';
    const button = setQuickSetButton(buttons, created.anchorId);
    renderHomeQuickSetProjection(home, center);
    return button;
  };

  const updateFromPointer = (event) => {''',
'begin quickset projection')

runtime = replace_once(runtime,
'''      runtime.slotRoll.state = advanced.state;
      setQuickSetButton(buttons, runtime.slotRoll.state.itemId);
    }
    moveKnobWithGesture(center, dx, dy);
    return { dx, dy, button: runtime.slidepad.previewButton };
  };''',
'''      runtime.slotRoll.state = advanced.state;
      setQuickSetButton(buttons, runtime.slotRoll.state.itemId);
      renderHomeQuickSetProjection(home, center);
    }
    const cancelArmed = updateHomeQuickSetCancelFromPointer(event);
    moveKnobWithGesture(center, dx, dy);
    return { dx, dy, button: runtime.slidepad.previewButton, cancelArmed };
  };''',
'update quickset projection and cancel')

runtime = replace_once(runtime,
'''    pointerup(event) {
      if (event.pointerId !== runtime.slidepad.pointerId) return;
      updateFromPointer(event);
      const commit = runtime.slotRoll.state ? resolveSlotRollCommit(runtime.slotRoll.state) : null;
      const button = commit?.itemId
        ? routeButtons(home).find((candidate) => routeId(candidate) === commit.itemId) || null
        : null;
      resetGesture();''',
'''    pointerup(event) {
      if (event.pointerId !== runtime.slidepad.pointerId) return;
      const { cancelArmed } = updateFromPointer(event);
      const commit = !cancelArmed && runtime.slotRoll.state ? resolveSlotRollCommit(runtime.slotRoll.state) : null;
      const button = commit?.itemId
        ? routeButtons(home).find((candidate) => routeId(candidate) === commit.itemId) || null
        : null;
      resetGesture();''',
'pointerup explicit cancel')

runtime_path.write_text(runtime, encoding='utf-8')

test_path = Path('tests/home-boot-presentation.test.mjs')
test = test_path.read_text(encoding='utf-8')

test = replace_once(test,
'''import test from 'node:test';
import assert from 'node:assert/strict';''',
'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';''',
'test fs import')

test = replace_once(test,
'''  HOME_CONTEXTUAL_REPLAY_LABEL,
  createHomeQuickSetSlotRoll,''',
'''  HOME_CONTEXTUAL_REPLAY_LABEL,
  HOME_QUICKSET_CANCEL_LABEL,
  createHomeQuickSetSlotRoll,''',
'test cancel label import')

test = replace_once(test,
'''  resolveHomeSlidepadFeedbackTranslation,
  resolveHomeSlidepadRayTarget,''',
'''  resolveHomeQuickSetCancelHit,
  resolveHomeSlidepadFeedbackTranslation,
  resolveHomeSlidepadRayTarget,''',
'test cancel resolver import')

anchor = '''test('Home Quick Set cycles both directions and wraps through the existing route gummies', () => {
  const quickSet = createHomeQuickSetSlotRoll({
    items: [
      { id: 'setup', label: 'Battle' },
      { id: 'shop', label: 'Shop' },
      { id: 'partner', label: 'Partner' },
      { id: 'cards', label: 'Deck' },
    ],
    centerWidth: 64,
  });
  let state = quickSet.state;
  state = advanceSlotRollDrag(state, { deltaPx: 64, detentPx: quickSet.detentPx }).state;
  assert.equal(state.itemId, 'shop');
  state = advanceSlotRollDrag(state, { deltaPx: 64 * 3, detentPx: quickSet.detentPx }).state;
  assert.equal(state.itemId, 'setup');
  state = advanceSlotRollDrag(state, { deltaPx: -64, detentPx: quickSet.detentPx }).state;
  assert.equal(state.itemId, 'cards');
  assert.equal(resolveSlotRollCommit(state)?.itemId, 'cards');
});
'''
addition = anchor + '''\ntest('Home Quick Set cancel uses one explicit displayed target and does not replace zero-move commit', () => {
  assert.equal(HOME_QUICKSET_CANCEL_LABEL, 'キャンセル');
  const cancelRect = { left: 40, top: 60, width: 56, height: 56 };
  assert.equal(resolveHomeQuickSetCancelHit({ pointerX: 68, pointerY: 88, cancelRect }), true);
  assert.equal(resolveHomeQuickSetCancelHit({ pointerX: 39, pointerY: 88, cancelRect }), false);
  assert.equal(resolveHomeQuickSetCancelHit({ pointerX: 68, pointerY: 117, cancelRect }), false);
  assert.equal(resolveHomeQuickSetCancelHit({ pointerX: 68, pointerY: 88, cancelRect: { ...cancelRect, width: 0 } }), false);

  const quickSet = createHomeQuickSetSlotRoll({
    items: [{ id: 'setup', label: 'Battle' }, { id: 'shop', label: 'Shop' }],
    centerWidth: 64,
  });
  assert.equal(resolveSlotRollCommit(quickSet.state)?.itemId, 'setup');
  assert.equal(resolveSlotRollCommit(quickSet.state)?.totalSteps, 0);
});

test('Home held Quick Set hides idle route gummies and renders a separate cancel place', () => {
  const source = fs.readFileSync(new URL('../browser/home-boot-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('[data-home-quick-set-active=\\"true\\"] ${ROUTE_SELECTOR}'));
  assert.ok(source.includes('visibility:hidden!important'));
  assert.ok(source.includes('data.homeQuickSetActive'));
  assert.ok(source.includes('dataset.homeQuickSetCancel'));
});
'''

test = replace_once(test, anchor, addition, 'quickset cancel tests')
test_path.write_text(test, encoding='utf-8')
