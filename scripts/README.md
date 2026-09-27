# Scripts

## verify-smoke.cjs

Dev-only smoke test for `src/execution/verifier.ts` — runs after `pnpm compile` against any demo workspace; prints phases, per-check results, and the failure summary.

## exec-smoke.cjs

Dev-only smoke test for `src/execution/*` — runs after `pnpm compile` against the golden-demo fixture; prints a `PASS`/`FAIL` line per step.

## reset-demo-fixture.sh

Copies the golden-demo fixture into a controlled demo workspace, tears down
any existing Compose stack and volumes for that project, generates a fresh
`.env`, and commits the clean state.

### Usage

```bash
./scripts/reset-demo-fixture.sh
```

Override the destination directory:

```bash
REPO2PROD_DEMO_DIR=/path/to/my-demo ./scripts/reset-demo-fixture.sh
```

### Default demo directory

`$HOME/repo2prod-demos/golden-demo`

### Compose project name rule

The script derives the Compose project name from the last path segment of the
demo directory:

1. Take `basename(DEMO_DIR)`.
2. Lowercase (BSD-safe `tr`).
3. Replace every character outside `[a-z0-9-]` with `-`.
4. Prefix with `repo2prod-`.

Default result: **`repo2prod-golden-demo`**

Example override:
`REPO2PROD_DEMO_DIR=/tmp/my-demo ./scripts/reset-demo-fixture.sh`
→ project name: `repo2prod-my-demo`

Member C's TypeScript Compose wrapper uses the same derivation rule.

### What the script deletes

The script **only** deletes:

- The demo workspace directory, **but only if** `.git/repo2prod-demo-marker`
  exists inside it. Without the marker the script aborts and refuses to
  delete anything.
- Docker containers, networks, and volumes belonging to the derived Compose
  project name (via `docker compose -p <project> down -v`).
- Any remaining Docker volumes labelled
  `com.docker.compose.project=<project>`.

It **never** runs `docker system prune`, `docker volume prune`, or any
global Docker cleanup command. Only resources owned by this project are
touched.

### Why volumes are always removed

A fresh `.env` is generated on every reset with a new `POSTGRES_PASSWORD`.
If an old `pgdata` volume from a previous run remains, PostgreSQL would
reject the new password and produce a confusing authentication error rather
than the intended demo failure. Removing the volume guarantees that the
database initialises cleanly with the new credentials.

### Safety checks

The script refuses to operate if:

- `DEMO_DIR` is empty, `/`, or `$HOME`.
- `DEMO_DIR` is inside the extension source repository.
- `DEMO_DIR` exists but does not contain `.git/repo2prod-demo-marker`.
- Docker is not running.
- `docker compose`, `git`, `rsync`, or `openssl` are not found.

### What is excluded from the demo copy

The following are never copied to the demo workspace:

- `FIXTURE_NOTES.md` (team-only fixture documentation)
- `__pycache__/` and `*.pyc`
- `.env` (generated fresh each run)
