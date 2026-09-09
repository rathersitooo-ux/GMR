from __future__ import annotations

import pathlib
import re
import subprocess

RUNTIME = pathlib.Path('browser/battle-janken-slidepad-runtime-mount.mjs')
TEST = pathlib.Path('tests/battle-janken-slidepad-runtime-mount.test.mjs')
DONOR_HEAD = 'c4111748e5fd76c320d91d74cf4b0464d4e891ef'
DONOR_TEST = 'tests/battle-janken-order-slidepad-presenter.test.mjs'
ORDER_ADAPTER_IMPORT = "import { projectBattleJankenOrderSnapshot } from '../browser/battle-janken-order-live-adapter.mjs';\n"
PRESENTER_IMPORTS = [
    'BATTLE_JANKEN_ORDER_SLIDEPAD_PRESENTER_SCHEMA',
    'presentBattleJankenOrderMotionToSlidePad',
    'projectBattleJankenOrderSlidePadPresentation',
]


def run(*args: str, input_text: str | None = None) -> str:
    result = subprocess.run(
        list(args),
        input=input_text,
        text=True,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout


def require_once(source: str, marker: str, label: str) -> None:
    count = source.count(marker)
    if count != 1:
        raise SystemExit(f'fail-closed: expected exactly one {label}, found {count}')


def donor_block(donor: str, start: str, end: str, label: str) -> str:
    require_once(donor, start, f'donor {label} start')
    require_once(donor, end, f'donor {label} end')
    start_index = donor.index(start)
    end_index = donor.index(end, start_index)
    if end_index <= start_index:
        raise SystemExit(f'fail-closed: invalid donor {label} bounds')
    return donor[start_index:end_index]


def insert_before_once(source: str, anchor: str, block: str, label: str) -> str:
    require_once(source, anchor, f'current {label} anchor')
    return source.replace(anchor, block + anchor, 1)


def apply_runtime_donor() -> None:
    current = RUNTIME.read_text(encoding='utf-8')
    schema_marker = 'BATTLE_JANKEN_ORDER_SLIDEPAD_PRESENTER_SCHEMA'
    if schema_marker in current:
        raise SystemExit('fail-closed: order presenter already exists in current runtime')

    preserved_markers = [
        "export const BATTLE_CARD_FOCUS_PRESENTATION_SCHEMA = 'gameroad.battle-card-focus-presentation.v1';",
        'cardFocusSnapshot: () => syncHandCardFocusPresentation(),',
        'data-card-focus="true"',
    ]
    for marker in preserved_markers:
        if marker not in current:
            raise SystemExit(f'fail-closed: current card-focus marker missing before composition: {marker}')

    donor = run('git', 'show', f'{DONOR_HEAD}:{RUNTIME}')
    blocks = [
        (
            'const GESTURE_DEAD_ZONE_PX = 10;',
            donor_block(
                donor,
                "const ORDER_PRESENTER_ATTR = 'data-janken-order-presentation';",
                'const GESTURE_DEAD_ZONE_PX = 10;',
                'presenter constants',
            ),
            'presenter constants',
        ),
        (
            '${BATTLE_JANKEN_TARGET_PROXY_LAYER_CSS}',
            donor_block(
                donor,
                '[${HOST_ATTR}="1"] .grJankenOrderPresenter{',
                '${BATTLE_JANKEN_TARGET_PROXY_LAYER_CSS}',
                'presenter CSS',
            ),
            'presenter CSS',
        ),
        (
            'export function mountBattleJankenSlidePadRuntime',
            donor_block(
                donor,
                'function orderPresenterStateLabel(finalState) {',
                'export function mountBattleJankenSlidePadRuntime',
                'presenter functions',
            ),
            'presenter functions',
        ),
        (
            "  const handle = documentRef.createElement('button');",
            donor_block(
                donor,
                "  const orderPresenterHost = documentRef.createElement('div');",
                "  const handle = documentRef.createElement('button');",
                'presenter host',
            ),
            'presenter host',
        ),
        (
            '    isExpanded: () => expanded,',
            donor_block(
                donor,
                '    presentOrderMotion: (motion, metadata = {}) =>',
                '    isExpanded: () => expanded,',
                'runtime presenter methods',
            ),
            'runtime presenter methods',
        ),
    ]

    updated = current
    for anchor, block, label in blocks:
        updated = insert_before_once(updated, anchor, block, label)

    required = [
        schema_marker,
        'projectBattleJankenOrderSlidePadPresentation',
        'presentBattleJankenOrderMotionToSlidePad',
        'presentOrderMotion:',
        'orderPresentationSnapshot:',
        'grJankenOrderPresenter',
    ]
    missing = [value for value in required if value not in updated]
    if missing:
        raise SystemExit(f'fail-closed: runtime donor markers missing after semantic composition: {missing}')
    for marker in preserved_markers:
        if marker not in updated:
            raise SystemExit(f'fail-closed: card-focus marker lost during composition: {marker}')
    if '<<<<<<<' in updated or '>>>>>>>' in updated or '\n=======' in updated:
        raise SystemExit('fail-closed: conflict marker found after semantic composition')

    RUNTIME.write_text(updated, encoding='utf-8')


def add_runtime_imports(test_source: str) -> str:
    pattern = re.compile(
        r"import \{(?P<body>[\s\S]*?)\} from '../browser/battle-janken-slidepad-runtime-mount\.mjs';"
    )
    matches = list(pattern.finditer(test_source))
    if len(matches) != 1:
        raise SystemExit(f'fail-closed: expected one classified SlidePad runtime import block, found {len(matches)}')
    match = matches[0]
    body = match.group('body')
    for name in PRESENTER_IMPORTS:
        if re.search(rf'\b{re.escape(name)}\b', body):
            raise SystemExit(f'fail-closed: presenter import already exists: {name}')
    insertion = ''.join(f'\n  {name},' for name in PRESENTER_IMPORTS)
    new_body = body.rstrip() + insertion + '\n'
    return test_source[:match.start('body')] + new_body + test_source[match.end('body'):]


def donor_test_body() -> str:
    donor = run('git', 'show', f'{DONOR_HEAD}:{DONOR_TEST}')
    start_marker = 'function authoritativeSnapshot() {'
    require_once(donor, start_marker, 'donor focused-test body marker')
    body = donor[donor.index(start_marker):]
    replacements = {
        'authoritativeSnapshot': 'orderPresenterAuthoritativeSnapshot',
        'FakeElement': 'OrderPresenterFakeElement',
        'FakeDocument': 'OrderPresenterFakeDocument',
        'makeHost': 'makeOrderPresenterHost',
    }
    for old, new in replacements.items():
        body = re.sub(rf'\b{old}\b', new, body)
    return body.rstrip() + '\n'


def integrate_classified_tests() -> None:
    source = TEST.read_text(encoding='utf-8')
    sentinel = 'projects exact authoritative order without sorting or gameplay recalculation'
    if sentinel in source or 'orderPresenterAuthoritativeSnapshot' in source:
        raise SystemExit('fail-closed: order presenter assertions already exist in classified test')
    if 'projectBattleJankenOrderSnapshot' in source:
        raise SystemExit('fail-closed: order adapter import unexpectedly already exists')

    source = add_runtime_imports(source)
    runtime_import_end_marker = "from '../browser/battle-janken-slidepad-runtime-mount.mjs';"
    require_once(source, runtime_import_end_marker, 'classified runtime import end')
    runtime_import_end = source.index(runtime_import_end_marker) + len(runtime_import_end_marker)
    source = source[:runtime_import_end] + '\n' + ORDER_ADAPTER_IMPORT.rstrip() + source[runtime_import_end:]
    source = source.rstrip() + '\n\n' + donor_test_body()
    TEST.write_text(source, encoding='utf-8')

    final = TEST.read_text(encoding='utf-8')
    for marker in [*PRESENTER_IMPORTS, 'projectBattleJankenOrderSnapshot', sentinel]:
        if marker not in final:
            raise SystemExit(f'fail-closed: classified test integration missing marker: {marker}')


def main() -> None:
    apply_runtime_donor()
    integrate_classified_tests()
    subprocess.run(['git', 'diff', '--check'], check=True)
    changed = run('git', 'diff', '--name-only').splitlines()
    expected = {str(RUNTIME), str(TEST)}
    actual = {path for path in changed if path}
    if actual != expected:
        raise SystemExit(f'fail-closed: unexpected product paths after patch: {sorted(actual)}')
    print('R3 product patch ready:', ', '.join(sorted(actual)))


if __name__ == '__main__':
    main()
