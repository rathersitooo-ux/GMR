# GAMEROAD Free Autopilot R1

## Goal

Make bounded GAMEROAD implementation work continue without a user chat while preserving CURRENT authority and the existing Executor Bus.

This is **not** a second task system. The existing `[EXECUTOR]` issue packet remains the transport. A packet is eligible only when `executorCapabilityHint` explicitly contains `FREE_LOCAL_CODER`.

## Zero-cash contract

R1 uses only a standard GitHub-hosted `ubuntu-latest` runner in the public GMR repository and local open-weight inference. It does not call Copilot, OpenAI, Anthropic, GitHub Models, paid GPU runners, or another paid inference API.

The repository's existing `config/zero-cash-runtime-policy.json` remains authoritative. If repository visibility, billing/quota assumptions, the pinned model/runtime download, or any cost boundary cannot be proven, the worker stops. There is no paid fallback.

Model candidate for R1: `Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF`, Q4_K_M, Apache-2.0, pinned to Hugging Face revision `2ab9f8f42af02fc212effaef7c4850c885e965f4`. Inference runs locally with a source-pinned `llama.cpp` build; no inference token/key is required.

## Safety envelope

The deterministic wrapper runs before and after the model:

- full 40-character base SHA is required;
- at most 8 exact repository paths may be mutable;
- path traversal and globs are rejected;
- `.github/workflows/**`, `data/preaction-authorizations/**`, the Executor Bus, and the zero-cash policy are never model-mutable;
- binary, rename, symlink, and out-of-scope patches are rejected;
- model output is only a candidate unified diff;
- candidate tests run before any branch is pushed;
- the free worker never merges its own product PR.

## CURRENT / lease boundary

GitHub Actions does not currently have an authorized direct read of the private Google Drive CURRENT lease authority. Therefore R1 is deliberately candidate-only: it may create a **draft** PR and return an Executor Bus result, but it must not convert that candidate into a main/product success claim or self-merge it.

This is useful work rather than a fake completion claim: code generation, bounded patching, focused tests, branch persistence, and a draft PR can happen unattended. The remaining step is current-authority adoption. A future R2 may enable fully unattended merge only after a read-only, fail-closed CURRENT lease verification surface exists.

## Packet eligibility

Use the normal Executor Bus packet and add an explicit capability hint such as:

`"executorCapabilityHint": "FREE_LOCAL_CODER"`

The packet's `exactMutableResources` must be exact relative repository file paths. Broad prose resources, shell commands, credentials, and control-plane files are rejected.

## Stop conditions

The worker stops without a paid or unsafe substitute when any of the following is true:

- base SHA is no longer the current main SHA;
- packet validation fails;
- requested paths leave the bounded scope;
- local model/runtime download or build fails;
- the model reports it cannot safely solve the task;
- generated diff is malformed or escapes scope;
- focused tests fail after the bounded attempt;
- GitHub/Drive authority cannot be revalidated for main adoption.
