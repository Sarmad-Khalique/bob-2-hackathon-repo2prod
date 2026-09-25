# Project Documentation Rules (Non-Obvious Only)

- **`AGENTS.md` in the project root is the product/design spec** (26 sections), not just coding rules. Read sections 1–26 before answering architecture questions. Section 27 is the technical quick-reference for agents.
- **`tsconfig.json` is listed in `.bobignore`** — it will not appear in Bob's file index. Ask the user to run `cat tsconfig.json` if compiler options are needed.
- **`src/` contains a VS Code extension**, not a web application. It activates on specific `repo2prod.*` command IDs defined in `package.json`.
- **`test-fixtures/golden-demo/` is an empty scaffold** — the fixture app (Django or Node + PostgreSQL) has not been built yet.
- **There is no test runner in `package.json`** — `pnpm test` does not exist. Only `compile`, `watch`, and `package` scripts exist.
- **Templates in `templates/bob-commands/` are placeholders** — the extension generates real command Markdown at runtime and writes it to `.bob/commands/` inside the user's target repo, not here.
- **`docs/architecture.md` says "scaffold only"** — the team runbook (`docs/team-runbook.md`) is more useful: it names the package manager and the compile command.
- **`bob_sessions/` must contain screenshots of Bob task/session consumption** — this folder is required for hackathon submission and is NOT gitignored.
