# Capability matrix

This matrix tracks functional coverage, not brand/API compatibility. Proprietary hosted implementations are not copied.

| Capability | Replacement | Local metered dependency | Notes |
|---|---|---:|---|
| Read/write/move local files | Desktop Commander MCP | None | Local process |
| Recursive file/content search | Desktop Commander MCP | None | ripgrep-backed upstream capability |
| Terminal commands | Desktop Commander MCP | None | Local shell |
| Long-running processes / sessions | Desktop Commander MCP | None | Local process control |
| Process list/kill | Desktop Commander MCP | None | Local OS |
| Python/Node/R in-memory execution | Desktop Commander MCP | None | Where runtime exists locally |
| Excel read/write/search | Desktop Commander MCP | None | Upstream native support |
| PDF read/create/modify | Desktop Commander MCP | None | Upstream support |
| DOCX read/create/edit/search | Desktop Commander MCP | None | Upstream support |
| File metadata / directory operations | Desktop Commander MCP | None | Local OS |
| Browser navigate/snapshot/click/type/forms | Playwright MCP | None | Headed by default |
| Browser screenshots | Playwright MCP | None | Full browser evidence |
| Browser cookies/local/session storage | Playwright MCP full storage capability | None | Enabled by GAMEROAD Operator |
| Persistent login profile | Playwright MCP | None | Default profile persists between sessions |
| Save/restore browser auth state | Playwright MCP storage capability | None | browser_storage_state / restore |
| Network mocking/offline state | Playwright MCP network capability | None | Enabled |
| Browser assertions/testing | Playwright MCP testing capability | None | Enabled |
| Browser vision/PDF/devtools/tracing | Playwright MCP full capability set | None | Enabled |
| Public web search | ChatGPT native web | No TinyFish wallet | Existing capability; not rebuilt |
| Public page fetch/research | ChatGPT native web + Playwright when dynamic | No TinyFish wallet | Dynamic/authenticated pages use local browser |
| Authenticated web workflows | Playwright persistent browser | None | Sign in once in headed browser as needed |
| Browser-context/profile persistence | Playwright profile/state | None | Replaces TinyFish browser profile dependency |
| Recurring simple checks | ChatGPT scheduled tasks or OS scheduler via desktop tools | No TinyFish monitor | Reasoning schedules remain subject to ChatGPT task limits; local OS jobs can run deterministic scripts independently |
| Cancel/list local running work | Desktop Commander process/session tools | None | Local sessions |
| GAMEROAD CURRENT work loop | Bundled GAMEROAD skill + Drive/GitHub connectors + local MCPs | None beyond existing account/tool access | Fresh CURRENT remains authority |
| Remote PC access from a non-local ChatGPT surface | Optional remote MCP transport / OpenAI Secure MCP Tunnel | Depends on target OpenAI product/account | Not required for ChatGPT Desktop local operation |

## Deliberate non-clones

- TinyFish billing/wallet APIs are not reproduced because the local browser path does not need them.
- Hosted Desktop Commander account/device relay is not reproduced. The local open-source MCP server runs directly on the PC.
- Native ChatGPT search, Google Drive, GitHub, and scheduled-task functions are reused rather than duplicated.
- Product/account permissions, OS permissions, website authentication, and ChatGPT plan restrictions are not bypassed.

## Runtime acceptance

The stack is accepted only after all of these pass on the target PC:

1. ChatGPT Desktop loads GAMEROAD Operator from the local marketplace.
2. Desktop MCP reads a harmless local file and runs a harmless command with readback.
3. Browser MCP opens a test page, performs an interaction, and reads back resulting state.
4. Browser profile persistence is verified across one MCP restart.
5. A GAMEROAD turn fresh-reads CURRENT, resolves a non-conflicting task slice, performs one safe PC/browser operation, and writes/verifies evidence.
