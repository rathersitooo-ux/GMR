from pathlib import Path

home_path = Path('browser/home-boot-runtime-base-r3.mjs')
test_path = Path('tests/home-boot-presentation.test.mjs')

home = home_path.read_text(encoding='utf-8')
test = test_path.read_text(encoding='utf-8')

helper_anchor = """export function setHomeObservedAttributeIfChanged(node, name, value) {
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
helper_replacement = helper_anchor + """
export function setHomeObservedTextContentIfChanged(node, value) {
  if (!node || !('textContent' in node)) throw new TypeError('HOME_OBSERVED_TEXT_NODE_REQUIRED');
  const nextValue = String(value);
  if (node.textContent === nextValue) return false;
  node.textContent = nextValue;
  return true;
}
"""
if home.count(helper_anchor) != 1:
    raise SystemExit(f'expected one attribute helper anchor, found {home.count(helper_anchor)}')
home = home.replace(helper_anchor, helper_replacement, 1)

old_write = "  trigger.textContent = HOME_CONTEXTUAL_REPLAY_LABEL;"
new_write = "  setHomeObservedTextContentIfChanged(trigger, HOME_CONTEXTUAL_REPLAY_LABEL);"
if home.count(old_write) != 1:
    raise SystemExit(f'expected one contextual replay text write, found {home.count(old_write)}')
home = home.replace(old_write, new_write, 1)

import_anchor = "  setHomeObservedAttributeIfChanged,\n"
if test.count(import_anchor) != 1:
    raise SystemExit(f'expected one test import anchor, found {test.count(import_anchor)}')
test = test.replace(import_anchor, import_anchor + "  setHomeObservedTextContentIfChanged,\n", 1)

regression = r'''

test('Home contextual replay child text refresh is idempotent under the childList observer', () => {
  let current = HOME_CONTEXTUAL_REPLAY_LABEL;
  let writes = 0;
  const node = {
    get textContent() { return current; },
    set textContent(value) {
      current = String(value);
      writes += 1;
    },
  };

  assert.equal(setHomeObservedTextContentIfChanged(node, HOME_CONTEXTUAL_REPLAY_LABEL), false);
  assert.equal(writes, 0);
  assert.equal(setHomeObservedTextContentIfChanged(node, '別表示'), true);
  assert.equal(writes, 1);
  assert.equal(setHomeObservedTextContentIfChanged(node, '別表示'), false);
  assert.equal(writes, 1);

  const runtimeSource = fs.readFileSync(new URL('../browser/home-boot-runtime-base-r3.mjs', import.meta.url), 'utf8');
  assert.ok(runtimeSource.includes("setHomeObservedTextContentIfChanged(trigger, HOME_CONTEXTUAL_REPLAY_LABEL);"));
  assert.equal(runtimeSource.includes("trigger.textContent = HOME_CONTEXTUAL_REPLAY_LABEL;"), false);
  assert.ok(runtimeSource.includes('subtree: true'));
  assert.ok(runtimeSource.includes('childList: true'));
});
'''
if "Home contextual replay child text refresh is idempotent under the childList observer" in test:
    raise SystemExit('regression test already exists')
test += regression

home_path.write_text(home, encoding='utf-8')
test_path.write_text(test, encoding='utf-8')
