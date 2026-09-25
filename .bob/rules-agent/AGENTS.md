# Project Coding Rules (Non-Obvious Only)

- **Use `pnpm` exclusively.** `npm install` / `yarn` will corrupt the lockfile.
- **`tsconfig.json` is in `.bobignore`** — Bob cannot read it. Use the shell (`cat tsconfig.json`) if you need to inspect compiler settings.
- **Stub pattern for not-implemented functions:** use `void arg;` before `throw new Error('Not implemented')` — this satisfies TypeScript strict unused-variable checks without needing `_` prefixes.
- **All shared types are owned by `src/core/types.ts`.** Never redeclare `RunStatus`, `Evidence`, `RuntimeManifest`, `EnvRequirement`, etc. in other files.
- **`CheckResult.observed` must only be `true` when real execution was observed.** Never set it based on what a generated config looks like or what Bob said.
- **`MAX_REPAIR_ATTEMPTS = 2` in `src/core/state.ts` is a hard budget cap** — do not increase it.
- **`EnvRequirement` must never carry env var values** — names and categories only. This type crosses the Bob boundary.
- **`RuntimeManifest.version` is `const 1`** — the JSON schema rejects any other value; keep the TypeScript type as `version: 1`.
- **No frontend framework in the webview** (`src/webview/panel.ts` comment explicitly says so). Use plain VS Code webview APIs.
- **Docker cleanup must be scoped to a known Compose project name** — never run `docker system prune` or `docker volume prune` globally.
- **Bob command Markdown files are written to `.bob/commands/` inside the target repository**, not inside this extension repo. Templates live in `templates/bob-commands/`.
- **`out/` is the compiled output dir** — never edit files there. Edit `src/` only.
