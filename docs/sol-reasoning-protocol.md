# Sol Structured Reasoning Protocol R1

This layer turns one bounded `grp1` reasoning packet into one correlated Sol reasoning request and validates one structured response before control returns to the executor.

It is a **decision protocol**, not a browser driver and not an execution engine.

## Flow

`Codex/Luna -> grp1 packet -> Sol request -> Sol response -> validator -> Codex/Luna`

R1 deliberately keeps transport outside this module. The same request/response contract can be carried by a browser session, a native model handoff, or another approved transport later without changing task identity or mutation authority.

## Outcome-routing contract

R1 is intentionally a small executable boundary rather than a second copy of the full GAMEROAD operating rules.

The queue/reasoning packet already carries the high-value invariants that Sol needs for one bounded decision:

- `userEndState`: the user-facing state the work is supposed to move toward;
- `realOutputTarget`: the concrete output expected from the executor path;
- `acceptance`: clauses that must be explicitly covered;
- `exactMutableResources`: the mutation boundary;
- `doNotChange`: protected resources and adjacent owner boundaries;
- `resumeCondition`: where control returns after this bounded decision;
- bounded context items: the JIT evidence packet used for this decision.

The protocol must not silently replace `userEndState` with research, planning, task creation, checkpointing, CI, or PR creation. Those can be intermediate executor actions, but a Sol response is only a bounded decision about how to reach the packet's real output.

The context packet is evidence, not authority expansion. It should contain the smallest decision-sufficient set selected by the upstream CURRENT/evidence router. Source discovery, CURRENT freshness checks, Web retrieval, relation expansion, HOT/WARM/COLD/QUARANTINE classification, and context-budget policy stay upstream. Baking those changing retrieval mechanics into this RPC would duplicate authority and make the protocol harder to retire or replace later.

When material evidence is missing, Sol must return `NEEDS_EVIDENCE` with the missing evidence named. It must not compensate by widening scope, inventing current state, or turning uncertainty into a plan. Counterevidence and failure evidence should be included as bounded context items by the upstream router; Sol is expected to account for them in `cause`, `decision`, `uncertainties`, and `evidenceRequests` rather than ignoring contrary context.

A valid `PLAN` is not completion evidence. Execution, mutation, runtime verification, readback, downstream use, and final outcome classification remain executor responsibilities. This separation is deliberate: it prevents a reasoning model from converting a plausible plan into a fake implementation or product-success claim.

## Minimality and self-compression

Do not add a new protocol field merely because a long-lived operating prompt has a named concept for it. Add structure only when an observed failure cannot be reliably prevented with the existing queue identity, bounded evidence, acceptance coverage, scope checks, and dispositions.

Candidate additions should first be evaluated against representative failures and nearby normal cases. Prefer the smaller contract when it preserves correctness. Retrieval policy, transport details, model-selection details, browser selectors, scheduler mechanics, and provider-specific behavior belong in their owning layers, not here.

This keeps R1 composable and allows obsolete prompt rules or transport workarounds to be removed without changing the reasoning contract.

## Request

`buildSolRequest(reasoningPacket, { mode, question })` validates the packed reasoning packet and binds the request to:

- task ID;
- work-unit key;
- acquire key;
- reasoning-packet fingerprint;
- allowed reasoning mode;
- exact question;
- response schema.

The deterministic `requestId` is a hash of those fields. Changing the question, mode, identity, packet fingerprint, or schema without rebuilding the request fails validation.

Allowed modes are `ROOT_CAUSE`, `DESIGN_DECISION`, `FAILURE_RECOVERY`, `WORK_DECOMPOSITION`, and `REVIEW`.

`buildSolPrompt()` produces a deterministic transport-ready prompt containing the bounded reasoning packet and an exact response shape.

## Response

Sol must return exactly one `sol-reasoning-response` fenced JSON object.

Allowed dispositions are:

- `PLAN`: a bounded implementation plan;
- `NEEDS_EVIDENCE`: no decision yet; explicit evidence requests are required;
- `BLOCKED`: reasoning cannot safely proceed under the current contract;
- `NO_CHANGE`: the bounded decision is to make no mutation.

There is intentionally no `SUCCESS`, `COMPLETE`, `MERGED`, or `DEPLOYED` disposition. Sol can decide; it cannot claim that the executor actually changed or verified the product.

The response carries:

- `cause`
- `decision`
- `filesToChange`
- `doNotTouch`
- `implementationOrder`
- `tests`
- `rollback`
- `uncertainties`
- `evidenceRequests`
- `acceptanceCoverage`

## Fail-closed checks

`validateSolResponse()` rejects the response when:

- task/work/acquire correlation differs;
- the reasoning-packet fingerprint differs;
- a proposed file lies outside `exactMutableResources`;
- a proposed file is protected by `doNotChange`;
- Sol omits any queue `doNotChange` entry from `doNotTouch`;
- proposed mutation overlaps response-local `doNotTouch`;
- any original acceptance clause is omitted or replaced;
- a mutating `PLAN` omits implementation order, tests, or rollback;
- `NEEDS_EVIDENCE` does not name missing evidence;
- `NO_CHANGE` contains hidden implementation work;
- an unknown field or unsupported disposition appears.

The only supported wildcard in file-scope validation is a trailing `/**`. R1 does not infer permission from prose-like resource descriptions or broader glob syntax.

## Usage

```js
import { packReasoningPacket } from './executor-bus-packet-compressor.mjs';
import {
  buildSolPrompt,
  parseSolResponse,
} from './sol-reasoning-protocol.mjs';

const packed = packReasoningPacket(queuePacket, contextItems, { maxWireBytes: 3000 });
if (!packed.ok) throw new Error(packed.reason);

const outbound = buildSolPrompt(packed.packet, {
  mode: 'ROOT_CAUSE',
  question: 'What is the smallest bounded repair that satisfies every acceptance clause?',
});
if (!outbound.ok) throw new Error(outbound.reason);

// Transport outbound.prompt to Sol and collect returnedText.

const checked = parseSolResponse(returnedText, outbound.request, packed.packet);
if (!checked.ok) throw new Error(checked.reason);

// Only now may the executor/HEAD decide whether to perform the plan.
```

## R1 test target

```sh
node --test tests/sol-reasoning-protocol.test.mjs
```

The focused suite covers deterministic request correlation, request tamper rejection, exact acquire correlation, mutable-scope enforcement, `/**` scope handling, do-not-change preservation, overlap rejection, acceptance coverage, fake success rejection, evidence gating, no-change smuggling, single-fence parsing, and deterministic prompt generation.

## Explicitly out of scope

- browser automation or ChatGPT UI selectors;
- logging in to ChatGPT or selecting a model in the UI;
- automatic execution of Sol text;
- shell-command transport;
- changing executor-bus or packet-compressor authority;
- workflow changes;
- product/game changes.

This is the reasoning RPC contract that later transport code should carry unchanged.
