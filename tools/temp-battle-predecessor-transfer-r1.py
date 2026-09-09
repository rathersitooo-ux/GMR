#!/usr/bin/env python3
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
BROWSER = ROOT / 'browser'
HTML = BROWSER / 'GAMEROAD.html'

IMPORT_RE = re.compile(r'''(?:from\s*|import\s*\(\s*)["']([^"']+\.mjs)["']''')
HTML_MJS_RE = re.compile(r'''["'](?:\./)?([^"']+\.mjs)["']''')


def read(path):
    try:
        return path.read_text(encoding='utf-8')
    except Exception:
        return ''


def norm_browser_import(owner, spec):
    if spec.startswith('http:') or spec.startswith('https:'):
        return None
    if spec.startswith('./') or spec.startswith('../'):
        try:
            return pathlib.PurePosixPath(pathlib.PurePosixPath(owner).parent, spec).as_posix()
        except Exception:
            return None
    if spec.startswith('browser/'):
        return spec
    return None


def collect_graph():
    graph = {}
    for path in BROWSER.glob('*.mjs'):
        rel = path.relative_to(ROOT).as_posix()
        specs = IMPORT_RE.findall(read(path))
        deps = []
        for spec in specs:
            dep = norm_browser_import(rel, spec)
            if dep and dep.startswith('browser/'):
                # PurePosixPath doesn't collapse .., resolve manually.
                dep = pathlib.PurePosixPath(dep)
                parts = []
                for part in dep.parts:
                    if part == '..':
                        if parts: parts.pop()
                    elif part != '.':
                        parts.append(part)
                deps.append('/'.join(parts))
        graph[rel] = sorted(set(deps))
    return graph


def html_roots(html):
    roots = set()
    for spec in HTML_MJS_RE.findall(html):
        rel = spec if spec.startswith('browser/') else f'browser/{spec}'
        if (ROOT / rel).exists():
            roots.add(rel)
    return sorted(roots)


def reachable(graph, roots):
    seen = set()
    stack = list(roots)
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        stack.extend(graph.get(cur, []))
    return seen


def git(*args):
    try:
        return subprocess.check_output(['git', *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ''


def count(text, needle):
    return text.count(needle)


def history_for_term(term):
    rows = git('log', '--all', '-S', term, '--format=%H|%cI|%s', '--', 'browser/GAMEROAD.html').splitlines()
    return rows[:8]


def live_atom(name, files, html_terms, graph_reachable, html):
    files_present = [f for f in files if (ROOT / f).exists()]
    reachable_files = [f for f in files_present if f in graph_reachable]
    term_counts = {t: count(html, t) for t in html_terms}
    if reachable_files or any(term_counts.values()):
        state = 'PRESERVED_LIVE_OR_INLINE'
    elif files_present:
        state = 'CODE_EXISTS_BUT_LIVE_MOUNT_MISSING'
    else:
        state = 'DROPPED_OR_RENAMED_REQUIRES_HISTORY'
    return {
        'atom': name,
        'state': state,
        'files_present': files_present,
        'reachable_files': reachable_files,
        'html_term_counts': term_counts,
    }


def main():
    html = read(HTML)
    graph = collect_graph()
    roots = html_roots(html)
    live = reachable(graph, roots)

    atoms = [
        live_atom('PLAYER_CLOCK_QUICK30', [], ['remainingTime', 'quickPoints', 'TIME 30', 'PERFECT!', 'GOOD'], live, html),
        live_atom('HATE_WAIT_ACCUMULATION_AND_FORCED_DELEGATION', [
            'browser/hate-peer-presence-core.mjs',
            'browser/hate-forced-delegation-core.mjs',
        ], ['hateTime', 'hateClocks', 'hateBlockers', 'friendExplode'], live, html),
        live_atom('BATTLE_RECONNECT', ['browser/battle-2v2-reconnect-core.mjs'], ['reconnect', 'rejoin'], live, html),
        live_atom('READY_PLAN_FEEDBACK', ['browser/ui-state-feedback-ready-plan-adapter.mjs'], ['READY', 'planSubmitted'], live, html),
        live_atom('SELF_DECK_INSPECT', ['browser/battle-self-deck-inspect-core.mjs'], ['deckInspect', 'remaining deck'], live, html),
        live_atom('TEAM_PING', ['browser/battle-team-ping-core.mjs'], ['teamPing'], live, html),
        live_atom('REPLAY_AND_RECENT_CAUSAL_HISTORY', [
            'browser/battle-replay-core.mjs',
            'browser/battle-replay-live-adapter.mjs',
            'browser/battle-replay-public-commentary-core.mjs',
        ], ['battleReplay', 'recent history'], live, html),
        live_atom('ADVICE_PARTNER', [
            'browser/partner-advice-runtime-mount.mjs',
            'browser/partner-battle-event-log-projection.mjs',
        ], ['partnerAdvice', 'Advice'], live, html),
        live_atom('CONTROLLED_CHARACTER', [
            'browser/battle-controlled-character-motion-core.mjs',
            'browser/battle-controlled-character-4p-motion-director.mjs',
        ], ['controlledCharacter'], live, html),
        live_atom('BATTLE_CAMERA', [
            'browser/battle-camera-control-core.mjs',
            'browser/battle-camera-input-router.mjs',
            'browser/battle-camera-presentation-runtime.mjs',
        ], ['battleCamera'], live, html),
        live_atom('GOAL_ARRIVAL', [
            'browser/battle-goal-arrival-live-adapter.mjs',
            'browser/new-base-goal-arrival-runtime-mount.mjs',
        ], ['GOAL_REACHED', 'goal-arrival-complete'], live, html),
    ]

    watched_terms = [
        'remainingTime', 'quickPoints', 'TIME 30', 'PERFECT!', 'GOOD',
        'hateTime', 'hateClocks', 'hateBlockers', 'friendExplode',
    ]
    history = {t: history_for_term(t) for t in watched_terms}

    battle_files = sorted(
        p.relative_to(ROOT).as_posix()
        for p in BROWSER.glob('*.mjs')
        if p.name.startswith('battle-') or p.name.startswith('hate-')
    )
    orphaned = [f for f in battle_files if f not in live]

    report = {
        'schema': 'gameroad.battle-predecessor-transfer-audit.r1',
        'head': git('rev-parse', 'HEAD'),
        'html_blob': git('rev-parse', 'HEAD:browser/GAMEROAD.html'),
        'html_bytes': HTML.stat().st_size,
        'html_module_roots': roots,
        'reachable_browser_modules_count': len(live),
        'atoms': atoms,
        'term_history': history,
        'battle_or_hate_module_count': len(battle_files),
        'battle_or_hate_unreachable_count': len(orphaned),
        'battle_or_hate_unreachable': orphaned,
        'notes': [
            'Reachability means HTML root -> static/dynamic .mjs import graph only; inline HTML behavior is additionally detected by semantic term counts.',
            'A missing literal may be renamed; DROPPED_OR_RENAMED_REQUIRES_HISTORY is intentionally fail-closed.',
            'Current explicit new-base supersessions must be applied before any predecessor restoration.',
        ],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
