# B03-B — Friend Room Worker Packet

## Exclusive scope
Friend Room presentation over the existing authoritative Friend Room runtime.

### Own outputs
- idle/create/join state inventory
- host/member/ready/wait state inventory
- leave/error/timeout/disconnect presentation inventory
- external reference packet
- settled targets for deterministic states
- component map
- Friend Room-specific test/screenshot plan

### Existing runtime to preserve
Current main already owns Friend Room in `browser/GAMEROAD.html`, including `renderLobby`, create/join/ready/start/leave flow, host/guest projection, remote transport adapter, ready reset and result→lobby behavior.

Do not rewrite the room protocol or infer host/member/ready from visuals. UI renders authoritative room state only.

## Required visible states
- not in room
- host lobby
- guest lobby
- participant slots connected/empty
- ready/not-ready
- start enabled/disabled
- join rejection
- transport error/timeout
- leave
- result return / ready reset

## Collision rule
Do not edit `browser/GAMEROAD.html` concurrently with B03-A or B03-C. Visual/reference/test-design work can proceed in parallel; monolith implementation is serialized by B03-CODE-OWNER.

## Exit evidence
- state→visual matrix
- deterministic targets/screenshots
- component map
- no-success-on-error proof
- repeated enter/leave stale-owner test plan
