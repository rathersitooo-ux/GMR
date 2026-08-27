# B03 CODE OWNER — Monolith Serialization Contract

## Verified collision
Setup markup, Friend Room markup, Setup CSS, Friend Room runtime/render/wiring all currently live in `browser/GAMEROAD.html`.

## Rule
Exactly one B03 code writer may modify `browser/GAMEROAD.html` at a time.

A/B/C may run concurrently only for outputs that do not mutate the monolith:
- reference collection
- target still design
- component maps
- fixture/test design
- asset preparation

## Serialization order
Default code integration order:
1. B03-A Setup presentation
2. run Setup-focused tests/screenshots
3. B03-B Friend Room presentation
4. run Friend Room tests/screenshots
5. B03-C queue/social shell only for verified states/consumers
6. B03-Z route/regression integration

If a behavior-preserving extraction creates stable independently imported owners, update this contract before parallel code edits. Do not split simply to manufacture concurrency.

## Foreign-owner prohibition
Do not modify Home, Battle core, Result, Cards/Deck, Partner semantics, global transition infrastructure, global Reduced Motion/LowPerf infrastructure, or public matchmaking backend authority from this branch.

## External gate
Public Matchmaking production enablement remains outside B03 until its external authority is supplied.
