# Architecture

Scaffold only. Module boundaries and ownership are defined in `AGENTS.md`.

- `src/core/` holds shared types, workflow state, manifest and evidence contracts, Bob command generation, and redaction.
- `src/analyzers/` collects deterministic repository facts.
- `src/execution/` will run processes, Docker, Compose, health checks, tests, and diagnostics.
- `src/webview/` will show workflow status and the readiness report. No frontend framework is included yet.

The demo stack is not chosen yet.
