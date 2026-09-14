from pathlib import Path

html_path = Path('browser/GAMEROAD.html')
test_path = Path('tests/browser-static-check.mjs')
html = html_path.read_text(encoding='utf-8')
test = test_path.read_text(encoding='utf-8')

replacements = []

old = '''function navEntry(screen){return{screen}}\nfunction currentScreenTransitionRuntime(){const runtime=globalThis.GAMEROAD_SCREEN_TRANSITION;if(!runtime||typeof runtime.navigate!=="function"||typeof runtime.back!=="function")throw new Error("GAMEROAD screen transition runtime is not ready");return runtime}'''
new = '''function navEntry(screen){return{screen}}\nconst HOME_TRANSITION_CONTROL_SELECTOR='.homePadChoice[data-home-target],.screen.home button[data-go]';\nfunction screenTransitionRuntimeReady(){const runtime=globalThis.GAMEROAD_SCREEN_TRANSITION;return !!runtime&&typeof runtime.navigate==="function"&&typeof runtime.back==="function"}\nfunction syncHomeTransitionReadiness(){const ready=screenTransitionRuntimeReady();document.querySelectorAll(HOME_TRANSITION_CONTROL_SELECTOR).forEach(button=>{button.disabled=!ready;button.dataset.transitionReady=ready?'1':'0'});return ready}\nglobalThis.GAMEROAD_SYNC_HOME_TRANSITION_READINESS=syncHomeTransitionReadiness;\nfunction currentScreenTransitionRuntime(){const runtime=globalThis.GAMEROAD_SCREEN_TRANSITION;if(!runtime||typeof runtime.navigate!=="function"||typeof runtime.back!=="function")throw new Error("GAMEROAD screen transition runtime is not ready");return runtime}'''
replacements.append(('runtime-readiness-helper', old, new))

old = '''function homeMotionNavigate(target){const meta=HOME_MOTION_DESTINATIONS[target];if(!meta||homeMotionRuntime.busy||state.screen!=='home')return false;if(homeMotionRuntime.state===HOME_MOTION_STATES.COLLAPSED){'''
new = '''function homeMotionNavigate(target){const meta=HOME_MOTION_DESTINATIONS[target];if(!meta||homeMotionRuntime.busy||state.screen!=='home')return false;if(!screenTransitionRuntimeReady())return false;if(homeMotionRuntime.state===HOME_MOTION_STATES.COLLAPSED){'''
replacements.append(('home-route-fail-closed', old, new))

old = '''}});homeMotionOnRender()}\nlet homeMotionGamepadConfirmHeld=false'''
new = '''}});syncHomeTransitionReadiness();homeMotionOnRender()}\nlet homeMotionGamepadConfirmHeld=false'''
replacements.append(('home-wire-readiness-sync', old, new))

old = '''if(!existingScreenTransitionRuntime)Object.defineProperty(globalThis,"GAMEROAD_SCREEN_TRANSITION",{value:screenTransitionRuntime,enumerable:false,configurable:false,writable:false});\nlet orientationProjection='''
new = '''if(!existingScreenTransitionRuntime)Object.defineProperty(globalThis,"GAMEROAD_SCREEN_TRANSITION",{value:screenTransitionRuntime,enumerable:false,configurable:false,writable:false});\nglobalThis.GAMEROAD_SYNC_HOME_TRANSITION_READINESS?.();\nlet orientationProjection='''
replacements.append(('runtime-install-releases-home-controls', old, new))

for label, old, new in replacements:
    count = html.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, found {count}')
    html = html.replace(old, new, 1)

anchor = '''  for (const [pattern, message] of screenNavigationContracts) {\n    if (!pattern.test(html)) errors.push(message);\n  }\n  if (/if\\s*\\(\\s*!target\\s*\\|\\|\\s*target\\s*===\\s*state\\.screen\\s*\\)\\s*return\\s*;/.test(html)) {'''
insert = '''  for (const [pattern, message] of screenNavigationContracts) {\n    if (!pattern.test(html)) errors.push(message);\n  }\n  const homeTransitionReadinessContracts = [\n    [/HOME_TRANSITION_CONTROL_SELECTOR='\\.homePadChoice\\[data-home-target\\],\\.screen\\.home button\\[data-go\\]'/, 'Home transition controls do not share the readiness gate'],\n    [/function screenTransitionRuntimeReady\\(\\)\\{const runtime=globalThis\\.GAMEROAD_SCREEN_TRANSITION;return !!runtime&&typeof runtime\\.navigate===[\"']function[\"']&&typeof runtime\\.back===[\"']function[\"']\\}/, 'Home transition readiness does not reuse the existing transition runtime'],\n    [/function syncHomeTransitionReadiness\\(\\)\\{[^}]*button\\.disabled=!ready;button\\.dataset\\.transitionReady=ready\\?[\"']1[\"']:[\"']0[\"']/, 'Home route controls are not disabled until transition runtime readiness'],\n    [/function homeMotionNavigate\\(target\\)\\{[^}]*if\\(!screenTransitionRuntimeReady\\(\\)\\)return false;/, 'Home motion route does not fail closed before transition runtime readiness'],\n    [/syncHomeTransitionReadiness\\(\\);homeMotionOnRender\\(\\)/, 'Home controls are not readiness-synced when Home motion wires'],\n    [/GAMEROAD_SYNC_HOME_TRANSITION_READINESS\\?\\.\\(\\);\\s*let orientationProjection=/, 'transition runtime installation does not release Home controls'],\n  ];\n  for (const [pattern, message] of homeTransitionReadinessContracts) {\n    if (!pattern.test(html)) errors.push(message);\n  }\n  if (/if\\s*\\(\\s*!target\\s*\\|\\|\\s*target\\s*===\\s*state\\.screen\\s*\\)\\s*return\\s*;/.test(html)) {'''
count = test.count(anchor)
if count != 1:
    raise SystemExit(f'static-test-anchor: expected exactly 1 anchor, found {count}')
test = test.replace(anchor, insert, 1)

for required in [
    "const HOME_TRANSITION_CONTROL_SELECTOR='.homePadChoice[data-home-target],.screen.home button[data-go]'",
    'function screenTransitionRuntimeReady()',
    'function syncHomeTransitionReadiness()',
    'if(!screenTransitionRuntimeReady())return false',
    'globalThis.GAMEROAD_SYNC_HOME_TRANSITION_READINESS?.();',
]:
    if required not in html:
        raise SystemExit(f'missing postcondition: {required}')

html_path.write_text(html, encoding='utf-8')
test_path.write_text(test, encoding='utf-8')
print('patched Home transition readiness with 4 exact HTML anchors + classified static regression')
