---
name: repo2prod
description: Productionize the current repository using Repo2Prod runtime evidence
user-invocable: true
---

Read the following Repo2Prod state files before doing any work:

- `.repo2prod/evidence.json`
- `.repo2prod/runtime-manifest.json`
- `.repo2prod/resolved-config.json`

If any of these files does not exist, stop and report clearly which required
Repo2Prod state file is missing. Do not invent data to substitute for missing
state.

Once you have read the state files, perform the following:

1. **Validate runtime assumptions** — confirm that the evidence in
   `.repo2prod/evidence.json` matches the actual repository structure.
   Note any discrepancies.

2. **Create or minimally repair the local Docker runtime** — create or update
   only what is needed to make the application run locally in Docker/Compose.
   Candidates include:
   - `Dockerfile`
   - `.dockerignore`
   - `compose.yaml`
   - `.env.example`

3. **Preserve working configuration** — if a file already exists and is
   largely correct, make the smallest targeted change rather than rewriting it.

4. **Do not refactor unrelated application code.** Only touch runtime
   configuration files unless a direct source-level fix is required for the
   container to start.

5. **Never invent real external credentials.** Use placeholder values in
   `.env.example` and reference them in `compose.yaml` via environment
   variable substitution.

6. **Never deploy to cloud.** This task is for local reproducible execution
   only.

7. When finished, summarize:
   - files changed and why
   - runtime assumptions corrected
   - any unresolved requirements that Repo2Prod must verify

Repo2Prod will execute and verify the runtime immediately after you finish.
