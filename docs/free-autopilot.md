# GAMEROAD Free Autopilot

## Role

This is not a second task system. The existing `[EXECUTOR]` issue packet remains the transport and CURRENT remains authority. The free worker is only an optional executor lane behind `GAMEROAD Executor Bus`.

A queue packet is eligible only when `executorCapabilityHint` explicitly contains `FREE_LOCAL_CODER`. The issue must be authored by the repository owner. Other Executor Bus packets continue to use the existing transport-only behavior.

## Zero-cash contract

The worker uses only a standard GitHub-hosted `ubuntu-latest` runner on the public GMR repository and local open-weight inference. It does not call Copilot, OpenAI, Anthropic, GitHub Models, a paid inference API, a GPU runner, or a larger runner. There is no paid fallback.

Pinned inference inputs:

- Qwen `Qwen2.5-Coder-1.5B-Instruct-GGUF`, Q4_K_M, Apache-2.0.
- Model revision: `38f6bab61d341b23a6c00226f32c0d6148bf9f43`.
- Model SHA-256: `cc324af070c2ecbfd324a30884d2f951a7ff756aba85cb811a6ec436933bb046`.
- llama.cpp release: `b10951`, target commit `093a2f86c3e37c54fa3e1f9efb17b304f3433abd`.
- Ubuntu x64 CPU archive SHA-256: `cb0e453d8d88b62a8962c5b13e46c117315f7740017f2636bcf0de20c6253f7a`.

Every external binary/model download is hash checked before execution. A mismatch stops the worker.

## Deterministic safety envelope

Before the model runs:

- `baseRef` must be a full 40-character SHA and equal the current default-branch SHA;
- `FREE_LOCAL_CODER` must be explicit;
- at most eight exact repository paths may be mutable;
- at least one focused `tests/*.test.mjs` path is required;
- traversal, globs, workflow/control-plane paths and PRE_ACTION manifests are rejected;
- prompt file context is capped so the small CPU model cannot consume the repository unboundedly.

After the model runs:

- only a unified text diff is accepted;
- binary, rename and symlink patches are rejected;
- every changed path must be inside the exact mutable set;
- `git apply --check` must pass;
- all mutable focused Node tests must pass;
- main must still equal the packet base SHA before the candidate is pushed.

## Output boundary

The free worker may push a `work/free-auto-*` candidate branch and open a **draft** pull request. It returns that PR/commit to the original Executor Bus issue. It never merges its own product change and never claims product/game success.

GitHub Actions cannot currently fresh-read the private Google Drive `CURRENT_ACTIVE_LEASES` authority. Therefore draft candidate production is the furthest safe unattended boundary. HEAD or another current-authorized adopter must fresh-read CURRENT before promotion/merge.

## Stop conditions

The worker stops with no substitute when the packet is invalid, the base moved, external hashes mismatch, local inference fails, the model reports blocked, the diff escapes scope, or focused tests fail. Failure never enables a paid service automatically.
