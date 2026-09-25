# Project Architecture Rules (Non-Obvious Only)

- **The product has two repositories in play at runtime:** this extension repo, and the user's *target* repo being productionized. Do not conflate them. `.bob/commands/` is written to the target repo.
- **`Repo2ProdState` enum drives the entire workflow** (`src/core/state.ts`). Every UI state, Bob handoff point, and repair gate is an enum value — never use ad-hoc strings for phase tracking.
- **Bob is NOT called programmatically.** The extension writes Markdown files; the user manually runs slash commands in Bob Agent mode. There is no API call to Bob from this extension.
- **Verification PASS requires observed execution** — `CheckResult.observed` must be `true`. An LLM claim, a generated file, or a successful `docker build` exit code alone is insufficient for a PASS on health/tests.
- **The repair loop is deliberately unbounded in the state machine but hard-capped at `MAX_REPAIR_ATTEMPTS = 2`** in `src/core/state.ts`. Attempt 2 requires explicit user confirmation before running.
- **Analyzers are deterministic fact collectors only** (`src/analyzers/`). They must never call Bob or any LLM. Bob interprets facts; analyzers collect them.
- **`EnvRequirement` never crosses a trust boundary with secret values.** The `envNames` field on `Evidence` is an array of string names only. Secret values are never stored anywhere in `src/core/` or sent to Bob.
- **The webview has no frontend framework** (React, Vue, etc. are explicitly excluded from the scaffold). Use VS Code's webview message-passing (`HostToWebviewMessage` / `WebviewToHostMessage` in `src/webview/messages.ts`).
- **Three JSON schemas in `schemas/` are the source of truth** for `RuntimeManifest`, `FailureBundle`, and `ReadinessReport` shapes. TypeScript types in `src/core/types.ts` must stay consistent with them.
- **`out/` is gitignored** — the compiled extension is never committed. VSIX packaging happens via `pnpm run package`.
