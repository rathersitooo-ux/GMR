# B03-C — Match / Social Shell Worker Packet

## Exclusive scope
Public-match queue/wait/cancel shell and social entry architecture only where current authoritative consumers exist.

### Hard production gate
Current work authority marks `TASK-ONLINE-002P` as `BACKLOG / WAITING_EXTERNAL`.

Therefore this lane may build:
- queue/wait/cancel state contract
- backend-unavailable state
- retry/error state
- deterministic fixture-driven UI tests
- Friend Battle/Spectate entry architecture only after a real current consumer is found
- AI-fill presentation only when current runtime exposes authoritative state

It may NOT:
- invent endpoint/schema
- fake a successful production match
- declare public matchmaking complete
- modify Battle rules to create a success path

## Visual requirement
The user must always know:
- what match type is requested
- whether they are waiting, blocked, failed, cancelled, or matched
- how to cancel
- what retry will do

Never display a fabricated progress percentage.

## Collision rule
Do not edit `browser/GAMEROAD.html` concurrently with B03-A or B03-B. Contract/reference/test-fixture design may proceed in parallel; monolith implementation is serialized by B03-CODE-OWNER.

## Exit evidence
- finite state contract
- blocked-backend production state
- cancel/retry acceptance tests
- no-fake-success proof
- consumer inventory for Friend Battle/Spectate/AI-fill
