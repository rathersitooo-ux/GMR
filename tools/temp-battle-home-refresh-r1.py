from pathlib import Path

BASE = Path('browser/home-boot-runtime-base-r3.mjs')
TEST = Path('tests/home-boot-presentation.test.mjs')

base = BASE.read_text()
test = TEST.read_text()

anchor = "export const HOME_CONTEXTUAL_REPLAY_LABEL = '操作を再確認';\n"
helper = """export const HOME_CONTEXTUAL_REPLAY_LABEL = '操作を再確認';

export function setHomeObservedAttributeIfChanged(node, name, value) {
  if (!node || typeof node.getAttribute !== 'function' || typeof node.setAttribute !== 'function') {
    throw new TypeError('HOME_OBSERVED_ATTRIBUTE_NODE_REQUIRED');
  }
  const attributeName = String(name || '').trim();
  if (!attributeName) throw new TypeError('HOME_OBSERVED_ATTRIBUTE_NAME_REQUIRED');
  const nextValue = String(value);
  if (node.getAttribute(attributeName) === nextValue) return false;
  node.setAttribute(attributeName, nextValue);
  return true;
}
"""
if anchor not in base:
    raise SystemExit('missing HOME_CONTEXTUAL_REPLAY_LABEL anchor')
base = base.replace(anchor, helper, 1)

old_active = "  trigger.setAttribute('aria-pressed', home.getAttribute('data-home-contextual-replay-active') === 'true' ? 'true' : 'false');\n  trigger.hidden = false;"
new_active = "  setHomeObservedAttributeIfChanged(trigger, 'aria-pressed', home.getAttribute('data-home-contextual-replay-active') === 'true' ? 'true' : 'false');\n  if (trigger.hidden) trigger.hidden = false;"
if old_active not in base:
    raise SystemExit('missing active replay refresh anchor')
base = base.replace(old_active, new_active, 1)

old_inactive = "    if (replayTrigger instanceof HTMLElement) replayTrigger.setAttribute('aria-pressed', 'false');"
new_inactive = "    if (replayTrigger instanceof HTMLElement) setHomeObservedAttributeIfChanged(replayTrigger, 'aria-pressed', 'false');"
if old_inactive not in base:
    raise SystemExit('missing inactive replay refresh anchor')
base = base.replace(old_inactive, new_inactive, 1)

import_anchor = "  HOME_CONTEXTUAL_REPLAY_LABEL,\n  HOME_QUICKSET_CANCEL_LABEL,"
import_replacement = "  HOME_CONTEXTUAL_REPLAY_LABEL,\n  HOME_QUICKSET_CANCEL_LABEL,\n  setHomeObservedAttributeIfChanged,"
if import_anchor not in test:
    raise SystemExit('missing Home test import anchor')
test = test.replace(import_anchor, import_replacement, 1)

regression = r'''

test('Home refresh observed-attribute writes are idempotent and do not retrigger the observer on equal aria state', () => {
  let current = 'false';
  let writes = 0;
  const node = {
    getAttribute(name) {
      assert.equal(name, 'aria-pressed');
      return current;
    },
    setAttribute(name, value) {
      assert.equal(name, 'aria-pressed');
      current = String(value);
      writes += 1;
    },
  };

  assert.equal(setHomeObservedAttributeIfChanged(node, 'aria-pressed', 'false'), false);
  assert.equal(writes, 0);
  assert.equal(setHomeObservedAttributeIfChanged(node, 'aria-pressed', 'true'), true);
  assert.equal(writes, 1);
  assert.equal(setHomeObservedAttributeIfChanged(node, 'aria-pressed', 'true'), false);
  assert.equal(writes, 1);

  const runtimeSource = fs.readFileSync(new URL('../browser/home-boot-runtime-base-r3.mjs', import.meta.url), 'utf8');
  assert.ok(runtimeSource.includes("setHomeObservedAttributeIfChanged(trigger, 'aria-pressed'"));
  assert.ok(runtimeSource.includes("setHomeObservedAttributeIfChanged(replayTrigger, 'aria-pressed', 'false')"));
});
'''
if "Home refresh observed-attribute writes are idempotent" in test:
    raise SystemExit('regression test already present')
test += regression

BASE.write_text(base)
TEST.write_text(test)

print('patched Home observed-attribute refresh idempotence')
