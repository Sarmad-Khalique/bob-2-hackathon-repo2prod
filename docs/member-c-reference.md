# Member C — Reference Document

**Role:** Member C — Execution, verification, diagnostics, golden demo fixture
**Branch:** `feat/verification-demo`
**Stack (locked, do not reopen):** Django + PostgreSQL
**Sources:** `AGENTS.md`, `Repo2Prod — Team Execution Plan & Build Spec v0.4.pdf` (incl. its SAMPLE PROMPT), the code on `main` up to `821338d` (2026-09-26), and the team's first end-to-end test in `~/Desktop/sandbox-sarmad` (see §2A).

> **Status for the team (answer to "Is Member C's branch/PR ready?"):** not yet. All Member C modules are still stubs. Member C is now building C2 → C3 → C4 directly against the real `sandbox-sarmad` SQLite failure (§2A), and will open the PR once that failure produces a correct `diagnostics/latest.json` and `DIAGNOSTIC_READY`.

> **Local code collects facts. Bob interprets and modifies. Local code verifies.**
> Member C owns the "local code verifies" part. Nothing gets PASS unless Member C's code saw it happen.

---

## Contents

1. [What Member C owns](#1-what-member-c-owns)
2. [Project status snapshot](#2-project-status-snapshot)
   - [2A. Live test target: sandbox-sarmad SQLite failure](#2a-live-test-target-sandbox-sarmad-sqlite-failure)
3. [Hard rules for Member C](#3-hard-rules-for-member-c)
4. [Contracts Member C must use](#4-contracts-member-c-must-use)
5. [Gaps and risks to resolve with the team](#5-gaps-and-risks-to-resolve-with-the-team)
6. [Task roadmap C1 → C5](#6-task-roadmap-c1--c5)
7. [How to write a Bob prompt (template from the sample prompt)](#7-how-to-write-a-bob-prompt)
8. [Ready-to-paste Bob prompts](#8-ready-to-paste-bob-prompts)
   - [8.7 C6: health endpoint in the /repo2prod skill](#87--c6-health-endpoint-in-the-repo2prod-skill-paired-with-member-a)
9. [Bob session evidence and Bobcoin budget](#9-bob-session-evidence-and-bobcoin-budget)
10. [Manual verification checklists](#10-manual-verification-checklists)
11. [Golden-path demo from Member C's side](#11-golden-path-demo-from-member-cs-side)
12. [Decision log (append as we go)](#12-decision-log)
- [Appendix A — Original SAMPLE PROMPT (Member A, Task 5)](#appendix-a--original-sample-prompt-member-a-task-5)

---

## 1. What Member C owns

| Area | Files |
|---|---|
| Process execution | `src/execution/processRunner.ts` |
| Docker | `src/execution/docker.ts` |
| Compose | `src/execution/compose.ts` |
| Verification engine | `src/execution/verifier.ts` |
| Diagnostics / FailureBundle | `src/execution/diagnostics.ts`, `schemas/diagnostics.schema.json` (coordinate) |
| Redaction | `src/core/redaction.ts` (stub is assigned to C: `TODO(Member C)`) |
| Golden demo fixture | `test-fixtures/golden-demo/` |
| Reset tooling / demo helpers | `scripts/` |

**Not Member C's (don't edit unless you're pairing with the owner):**
- Member A: `src/extension.ts`, `src/commands/*`, `src/core/orchestrator.ts`, `src/core/state.ts`, `src/core/bobSkills.ts`, `src/execution/gitGuard.ts` (it's in `execution/` but marked `TODO(Member A)`).
- Member B: `src/analyzers/*`, `src/core/manifest.ts`, `src/core/evidence.ts`, `src/webview/*`, `schemas/runtime-manifest.schema.json`.
- Shared: `src/core/types.ts` — any change must be posted to the team first, and schemas and consumers updated in the same change.

**Member C returns data and results. Member C never moves workflow state itself.** Member A's orchestrator owns transitions. C calls the orchestrator's hook methods, or returns results that A's command layer turns into those calls.

---

## 2. Project status snapshot

### Done by Member A (Tasks 1–5, runtime-tested inside IBM Bob 2.2.0)
- Extension scaffold, VSIX packaging, installs in Bob.
- Bob Skills: `/repo2prod`, `/repo2prod-repair`, `/repo2prod-ci` installed to `.bob/skills/<name>/SKILL.md` in the target repo (templates in `templates/bob-skills/`).
- State machine in `src/core/state.ts`, `MAX_REPAIR_ATTEMPTS = 2`, transition map, `.repo2prod/run-state.json` persistence, reset.
- Orchestrator (`src/core/orchestrator.ts`) with hooks for Member C (see §4).
- `verifyRuntime` command moves to `BUILDING`, then stops with "verification implementation pending". **C5 replaces this.**

### Done by Member B (PR #3)
- Django-only framework analyzer (`manage.py` or a `django` dependency means framework `django`).
- Env-name scanning of `.py` files: `os.environ["X"]`, `os.environ.get("X")`, `os.environ.setdefault("X")`, `os.getenv("X")`, and django-environ `env("X")` / `env.str("X")`.
- Env classification. `DATABASE_URL`, `PG*`, and names with the `POSTGRES_`, `DB_`, `DATABASE_` or `REDIS_` prefixes are classed as `generated-local-infrastructure`. `SECRET_KEY` and `DJANGO_SECRET_KEY` are `generated-local-secret`. `DEBUG`, `ALLOWED_HOSTS` and `DJANGO_SETTINGS_MODULE` are `safe-inferred`.
- Manifest: the `app` service, plus a `db` (postgres, port 5432) service when postgres env names are seen, with a `depends_on` edge. **All `commands` are `null`.** No image tags and no invented ports.
- Ports come only from Dockerfile `EXPOSE`, the Compose container port, or the Procfile. Default Django ports are never assumed.
- Plan view is wired into the start flow. Writes `.repo2prod/evidence.json` and `.repo2prod/runtime-manifest.json`.

### Latest on `main` (`821338d`, Sarmad — "update the repo2prod skill")
- `/repo2prod` SKILL.md (`templates/bob-skills/repo2prod/SKILL.md` + `src/core/bobSkills.ts`): `evidence.json` and `runtime-manifest.json` are **required**, and `resolved-config.json` is now **optional**. This resolves old gap 7, so Bob no longer stops when `resolved-config.json` is missing.
- New session evidence `bob_sessions/necromancers_task06_bob_repo2prod_skill_update.png`. Task numbers are not strictly global in practice (task06 was used after task11 existed), so confirm the numbering rule with the team.
- Your branch `feat/verification-demo` doesn't have this commit yet. Run `git pull origin main` (or rebase) before starting the next Bob task.

### Member C — current state (all stubs)
| File | State |
|---|---|
| `src/execution/processRunner.ts` | Types only (`ProcessRunOptions`, `ProcessRunResult`, `ProcessHandle`, `ProcessRunner`). Keep and extend them. |
| `src/execution/docker.ts` | `dockerBuild()` throws Not implemented |
| `src/execution/compose.ts` | `composeUp()` / `composeDown()` throw |
| `src/execution/verifier.ts` | `verifyRuntime(manifest)` throws |
| `src/execution/diagnostics.ts` | `createFailureBundle(...)` throws |
| `src/core/redaction.ts` | `redactText()` throws |
| `test-fixtures/golden-demo/` | README placeholder only |
| `scripts/` | README placeholder only |

**No code outside `src/execution/` calls these stubs yet**, so C is free to reshape their signatures, as long as `pnpm compile` stays green.

### Environment on this machine
Docker 29.2.1, Docker Compose v5.5.1, Python 3.12, pnpm. TypeScript `^7`, `strict`, `module: Node16`, output in `out/`.

---

## 2A. Live test target: sandbox-sarmad SQLite failure

This is the team's **first useful end-to-end failure**. It's the concrete target for C2, C3 and C4 right now.

### What happened (team report)
```text
Healthy Django app locally          ✅  (manage.py check passed, runserver on :8000)
Repo2Prod analysis                  ✅
Runtime plan                        ✅
Approval                            ✅
/repo2prod (Bob Agent)              ✅
Dockerfile / Compose generated      ✅
Docker build                        ✅
Runtime execution                   ❌  real observed failure during `migrate`:
                                         sqlite3.OperationalError: unable to open database file
```
The failure comes from Django's SQLite backend during migration, not from the image build. It's much better than the earlier sandbox with a broken `manage.py`, because the app was healthy until productionization.

**Team instruction: do NOT fix it by hand.** It's the input for Verify Runtime → diagnostics → `/repo2prod-repair`.

### Sandbox facts (read from `~/Desktop/sandbox-sarmad`, 2026-09-26)
| Item | Value |
|---|---|
| Stack | Django **6.1.1**, `python-dotenv`, **SQLite** (`DATABASES.default.NAME = BASE_DIR / 'db.sqlite3'`). **No PostgreSQL.** |
| Env names (analyzer) | `ALLOWED_HOSTS`, `DEBUG`, `DJANGO_SETTINGS_MODULE` (safe-inferred), `SECRET_KEY` (generated-local-secret, read via `os.environ["SECRET_KEY"]`) |
| Manifest | a single `app` service, `ports: []`, `edges: []`, all `commands` null (so there's **no `db` service**) |
| URLs | only `admin/`, so there's **no health endpoint** and `/` returns 404 |
| Tests | **none** |
| Git | one commit `2ac095c feat: initial commit`. Bob's output is **uncommitted**: `Dockerfile`, `compose.yaml`, `.dockerignore`, `.bob/`, `.repo2prod/`, modified `.env.example` |
| Run state | `WAITING_FOR_BOB_PRODUCTIONIZATION`, `repairAttempts: 0` |
| Note | `evidence.workspaceRoot` is `/Volumes/Sarmad/sandbox` (copied from Sarmad's machine). **Execution code must use the currently opened workspace root, never `evidence.workspaceRoot`.** |

Bob-generated `compose.yaml` (the relevant part):
```yaml
services:
  app:
    build: .
    ports: ["8000:8000"]
    environment:
      SECRET_KEY: ${SECRET_KEY}          # interpolated from .env by Compose
      DEBUG: ${DEBUG:-False}
      ALLOWED_HOSTS: ${ALLOWED_HOSTS:-localhost,127.0.0.1}
      DJANGO_SETTINGS_MODULE: ${DJANGO_SETTINGS_MODULE:-config.settings}
    volumes:
      - db_data:/app/db.sqlite3          # ← named volume mounted onto a FILE path
    command: >
      sh -c "python manage.py migrate --noinput &&
             python manage.py runserver 0.0.0.0:8000"
volumes:
  db_data:
```
`.dockerignore` excludes `db.sqlite3`, so the file doesn't exist in the image.

### Root cause (confirmed from config, not guessed)
A **named volume is always a directory**. Mounting `db_data` at `/app/db.sqlite3` creates a *directory* at that path. SQLite then tries to open a directory as a database file and fails with `unable to open database file`. The build is fine. The failure happens at container start, inside `migrate`.

The fix belongs to Bob in `/repo2prod-repair`, not to us. Plausible smallest fixes: mount the volume on a directory (e.g. `/app/data`) and point the SQLite path there through an env var, or drop the volume for a local run. Repo2Prod only verifies whatever Bob chooses.

### Which phase and checks this should produce (C3 expectation)
| Check | Expected | Why |
|---|---|---|
| docker / compose | PASS (observed) | daemon + CLI present |
| build | PASS (observed) | image builds |
| database | **NOT_RUN** (observed false), detail "No infrastructure service in manifest" | no `db` service. **Don't assume Postgres.** |
| app | **FAIL** (observed) at **STARTING** | container exits (code 1) after `migrate` fails |
| health, tests | NOT_RUN, "Skipped: earlier phase failed" | stop at the first failure |

**Important for C2/C3:** `docker compose up -d` returns **exit 0** even though the app container dies seconds later. The failure is only visible through `compose ps -a` (state `exited`, exit code 1) and `compose logs app`. So "up succeeded" must never become an `app` PASS. Use a stability window (still `running` after N seconds) plus `ps`.

### What `diagnostics/latest.json` should look like for this failure (C4 target)
```json
{
  "attempt": 0,
  "phase": "STARTING",
  "command": "docker compose -p repo2prod-sandbox-sarmad up -d",
  "exitCode": 1,
  "redactedExcerpt": "Phase: STARTING\nFailed service: app (exited, code 1)\nCommand: docker compose -p repo2prod-sandbox-sarmad up -d\nRelevant files: compose.yaml, Dockerfile, .dockerignore, config/settings.py\nManifest: .repo2prod/runtime-manifest.json\n--- app log tail ---\nOperations to perform:\n  Apply all migrations: admin, auth, contenttypes, sessions\n...\nsqlite3.OperationalError: unable to open database file\n...\ndjango.db.utils.OperationalError: unable to open database file",
  "truncated": false
}
```
- `exitCode` here is the **app container's** exit code from `ps`. `up -d` itself returned 0. Say so in the excerpt header, or add `failedService` if gap 1 is approved.
- `attempt` is `repairAttemptsUsed()` at failure time, so 0 before any repair.
- The excerpt should keep the Django traceback tail (the last ~120 lines), because that's where the root cause line is.

### Secret notes specific to this sandbox
- The sandbox has a real `.env` (`SECRET_KEY` etc.). Compose reads it **automatically** for `${SECRET_KEY}` interpolation. Repo2Prod code must **never read `.env`**, and must **never run `docker compose config`** into diagnostics or the output channel, because that prints the interpolated secret values.
- Because `.env` values are unknown to Repo2Prod, `extraSecrets` is empty here. Pattern-based redaction (`SECRET_KEY=...`, `KEY: value`) is the safety net. Test that a `SECRET_KEY=<value>` line injected into a log gets redacted.

### How to use the sandbox safely while developing
1. **Keep a pristine copy of the failing state before any experiment**, because repair and experiments will modify it:
   `cp -R ~/Desktop/sandbox-sarmad ~/Desktop/sandbox-sarmad-failing-baseline`
   Develop against a working copy, and re-copy from the baseline to reset. Don't commit or reset inside Sarmad's sandbox unless the team asks.
2. Reproduce manually (scoped project, no global prune):
   ```bash
   cd ~/Desktop/sandbox-sarmad
   docker compose -p repo2prod-sandbox-sarmad up --build -d
   docker compose -p repo2prod-sandbox-sarmad ps -a            # app: exited (1)
   docker compose -p repo2prod-sandbox-sarmad logs --no-color --tail 60 app
   docker compose -p repo2prod-sandbox-sarmad down -v --remove-orphans
   ```
3. The run state here says `WAITING_FOR_BOB_PRODUCTIONIZATION`, so once C5 is wired, **Repo2Prod: Verify Runtime** is the exact next step from this state. If the copied run-state causes trouble (foreign `workspaceRoot`), re-run Start Productionization → Approve in Bob. Bob's files are already present, so skip the `/repo2prod` call to save Bobcoins.

### What this changes for Member C
- **Priority order is now C2 → C3 → C4 → C5 against this sandbox, then C1.** The concrete failure unblocks execution work immediately.
- The verifier must be **manifest-driven**, not Django+Postgres-hardcoded: infra checks come from the manifest's non-`app` services (none here gives `database` NOT_RUN).
- **No health endpoint** is a normal case, not an error. See the updated health rules in the C3 prompt (§8.3).
- **No tests** gives `tests` NOT_RUN, never PASS. Django prints `Ran 0 tests` / `NO TESTS RAN`. Treat those as NOT_RUN regardless of exit code.
- Whether the **final demo** uses this SQLite failure or the planned Postgres `localhost` fixture (C1) is an open team decision (§12). AGENTS.md prefers PostgreSQL "unless the fixture genuinely needs something else".

---

## 3. Hard rules for Member C

From AGENTS.md §§10–15, 17–18 and PDF §11:

1. **PASS requires observed execution.** `CheckResult.observed = true` only when real execution backed the check. Generated config or anything Bob says is never "observed".
2. **"Container started" does not mean "ready".** A 404 on `/` is not automatically a failure. Use an explicit health endpoint.
3. **No tests means `NOT_RUN`, never `PASS`.** A check that was skipped because an earlier one failed is also `NOT_RUN`.
4. **Status literals are frozen:** `PASS | FAIL | WARN | NOT_RUN | UNKNOWN`.
5. **Bounded and redacted logs only.** Never store full logs. Never store `.env` values, tokens or passwords in `.repo2prod/`.
6. **Never run global Docker cleanup.** No `docker system prune`, `docker volume prune` or `docker image prune`. Use a known Compose project name (`-p`) and only `docker compose -p <name> down [-v]`.
7. **No autonomous retries.** C runs once per "Verify Runtime". The repair budget (max 2) is enforced by Member A. C only records the attempt number.
8. **Don't invoke Bob programmatically.** The developer runs `/repo2prod-repair` visibly.
9. **The fixture defect must be real**, with no "if DEMO_MODE: fail" flags. Preferred defect: the app container uses PostgreSQL at `localhost` while Compose exposes it as service `db`.
10. **pnpm only.** `pnpm compile`. There is no `pnpm test` unless someone adds it. Don't let Bob invent it.
11. **Fail explicitly**, e.g. "Docker is not running. Start Docker and retry." Never "Something went wrong." Don't write broad `catch` blocks that hide failures.
12. **Stub pattern** for anything left unimplemented: `void arg; throw new Error('Not implemented');`
13. **Framework-agnostic shared code.** Django specifics (the `/health/` path, the `python manage.py test` command) go in execution-local defaults or options, not in `src/core/`.
14. **Don't commit or push automatically**, and don't commit `out/` or `*.vsix`.

---

## 4. Contracts Member C must use

### Shared types (`src/core/types.ts`)
```ts
export type RunStatus = 'PASS' | 'FAIL' | 'WARN' | 'NOT_RUN' | 'UNKNOWN';

export interface CheckResult {
  id: string;
  status: RunStatus;
  observed: boolean;      // true ONLY if backed by real execution
  detail: string | null;
}

export interface VerificationResult {
  checks: CheckResult[];
}

export interface FailureBundle {
  attempt: number;
  phase: Repo2ProdState;  // BUILDING | STARTING | VERIFYING_HEALTH | RUNNING_TESTS
  command: string | null;
  exitCode: number | null;
  redactedExcerpt: string;
  truncated: boolean;
}

export interface ReadinessReport {       // built by Member A in Task 8 from C's checks
  overall: RunStatus;
  checks: CheckResult[];
  repairAttemptsUsed: number;           // schema max = 2
  summary: string;
}
```
`schemas/diagnostics.schema.json` mirrors `FailureBundle` exactly, with `additionalProperties: false`.

### Process types (`src/execution/processRunner.ts`, owned by C)
```ts
export interface ProcessRunOptions { cwd: string; command: string; args: readonly string[];
  env?: Readonly<Record<string, string>>; timeoutMs?: number; }
export interface ProcessRunResult { exitCode: number | null; stdout: string; stderr: string;
  durationMs: number; timedOut: boolean; }
export interface ProcessHandle { cancel(): void; }
export type ProcessRunner = (options: ProcessRunOptions) => Promise<ProcessRunResult>;
```
Inject `ProcessRunner` everywhere so tests can mock Docker without running it.

### Orchestrator hooks C integrates with (`src/core/orchestrator.ts`)
| Method | Transition |
|---|---|
| `markBobProductionizationComplete()` / `markBobRepairComplete()` | WAITING_FOR_BOB_* → `BUILDING` (already called by `verifyRuntime`) |
| `beginStarting()` | `BUILDING → STARTING` |
| `beginVerification()` | `STARTING → VERIFYING_HEALTH` |
| `beginTests()` | `VERIFYING_HEALTH → RUNNING_TESTS` |
| `markVerified()` | `RUNNING_TESTS → VERIFIED` |
| `recordFailure(bundle)` | any of the 4 execution phases → `DIAGNOSTIC_READY` |
| `repairAttemptsUsed()` | use for `FailureBundle.attempt` |

### State flow
```text
WAITING_FOR_BOB_PRODUCTIONIZATION ─┐
WAITING_FOR_BOB_REPAIR ────────────┴→ BUILDING → STARTING → VERIFYING_HEALTH → RUNNING_TESTS → VERIFIED
                                         │           │              │                 │
                                         └───────────┴──────────────┴─────────────────┴→ DIAGNOSTIC_READY
DIAGNOSTIC_READY → (A: prepareRepair, max 2) → BOB_REPAIR_SKILL_READY → WAITING_FOR_BOB_REPAIR → BUILDING …
```

### Phase to check mapping (agree with Member A)
| Phase | Checks C produces |
|---|---|
| BUILDING | `docker` (daemon available), `compose` (available), `build` (compose build exit 0) |
| STARTING | `database` (db container healthy / `pg_isready`), `app` (app container running, not exited) |
| VERIFYING_HEALTH | `health` (HTTP 200 on the health endpoint) |
| RUNNING_TESTS | `tests` (exit 0 → PASS; nonzero → FAIL; none found → NOT_RUN) |

### Files under `.repo2prod/`
| File | Writer |
|---|---|
| `run-state.json` | A |
| `evidence.json`, `runtime-manifest.json` | B |
| `resolved-config.json` | **nobody yet** (see gap 7) |
| `diagnostics/latest.json` | **C** (read by `/repo2prod-repair`) |
| `readiness-report.json` | A (Task 8), using C's `VerificationResult` |

---

## 5. Gaps and risks to resolve with the team

| # | Gap / risk | Proposed resolution | Talk to |
|---|---|---|---|
| 1 | `FailureBundle` lacks the spec C4 fields: failed service, relevant files, manifest reference, previous repair outcome. The schema has `additionalProperties: false`. | Propose adding optional fields `failedService: string \| null`, `relevantFiles: string[]`, `manifestRef: string`, `previousOutcome: string \| null`. Update `types.ts` and `diagnostics.schema.json` in one change. **Post to the team first.** Until then, fit what's needed into `redactedExcerpt` headers. | A + B |
| 2 | Verifier inputs: the manifest has `commands: null` everywhere, and no health path. | Add a C-owned `VerifyOptions` in `src/execution/` (`workspaceRoot`, `composeFile`, `projectName`, `appService`, `infraServices`, `appContainerPort`, `healthPath`, `testCommand`, timeouts). **Derive infra services from the manifest's non-`app` services** (sandbox-sarmad has none, so `database` is NOT_RUN). Only framework defaults (`testCommand: ['python','manage.py','test']`) live in a Django defaults object. Read the host port with `docker compose port`. If the manifest has no app port (sandbox: `ports: []`), fall back to the Compose-published port of `app`. | A |
| 3 | **Defect survival:** Bob's `/repo2prod` may proactively fix the `localhost` DB host, and then there's no real failure to show. | Put the defect where it reads like a normal "works on my laptop" default: `settings.py` reads `POSTGRES_HOST` with default `localhost`, and the baseline `compose.yaml` doesn't set it. C1 must include one real `/repo2prod` dry run to confirm the failure still appears. If Bob fixes it, decide as a team (e.g. keep the `/repo2prod` flow and show repair on a different real defect). **Never fake it.** | whole team |
| 4 | Bob must open the fixture as its own workspace and git repo, not as a subfolder of the extension repo. | The reset script copies the baseline to a separate demo dir (default `~/repo2prod-demo`), runs `git init`, and makes a baseline commit. It refuses to delete a dir that lacks a marker file. | — |
| 5 | "Container up" ≠ PASS. Also, many real repos (sandbox-sarmad) have **no health endpoint**. | Fixture (C1): `/health/` runs `SELECT 1` and returns 200 `{"status":"ok","database":"ok"}` or 503. Verifier: probe the configured health path. If the repo has none, do an HTTP smoke probe of `/`. **Any HTTP response below 500 (incl. 404) gives `health` WARN** (observed, "server responds; no explicit health endpoint"). 5xx or connection refused gives FAIL. PASS only on 200 from an explicit health path. Also, `docker compose up -d` exits 0 even when the app dies later, so check `ps -a` plus a stability window. | A (report semantics) |
| 6 | Compose project naming and cleanup scope. | `projectName = 'repo2prod-' + sanitized(basename(workspaceRoot))`. For the demo dir that gives `repo2prod-repo2prod-demo`; acceptable, or name the dir `demo`. Cleanup is only `docker compose -p <name> down --remove-orphans` (+ `-v` only for a full reset). | — |
| 7 | ~~`/repo2prod` SKILL.md requires `resolved-config.json`, which nobody writes.~~ **Resolved on main `821338d`:** it's now optional. | Nothing to do. `extraSecrets` can still come from it later if Member A writes generated local secrets there. | — |
| 8 | Who creates the ReadinessReport? | Member A (Task 8). C just returns `VerificationResult`. | A |
| 9 | No test runner. | Optional support prompt S1 adds Vitest. Get a team OK first (new devDependency). | team |
| 10 | Tests need a DB. Django `manage.py test` creates `test_<db>`. | The Postgres image user is a superuser, so this works. Run tests with `docker compose -p X run --rm app python manage.py test` so they use the same network and env as the app. With SQLite, Django uses an in-memory test DB, and a repo with no tests gives NOT_RUN. | — |
| 11 | Execution must never trust `evidence.workspaceRoot` (sandbox-sarmad's says `/Volumes/Sarmad/sandbox`). | Use the workspace folder currently open in the editor, passed in by Member A's command layer. | A |
| 12 | Never leak `.env` via Compose. Compose auto-loads `.env` for `${VAR}` interpolation. | Never run `docker compose config` into logs or diagnostics. Never read `.env`. Redact `KEY=value` patterns in all captured output. | — |
| 13 | Demo target choice: the real SQLite sandbox failure (Bob-generated volume bug) vs the planned Postgres `localhost` fixture. | Team decision (§12). Build C2–C4 so they work for **both**. | whole team |
| 14 | Most real repos (incl. sandbox-sarmad) have **no health endpoint**, so health can never PASS and "deployment succeeded" can't be proven. | **Task C6:** the `/repo2prod` skill makes Bob look for an existing health endpoint first. If there is none, Bob creates a minimal one that really checks the DB, and declares it in `.repo2prod/health-endpoint.json`. The verifier uses the declared path, but **PASS still needs an observed HTTP 200**. The skill files are Member A's, so pair with or get approval from A. | A |

---

## 6. Task roadmap C1 → C5

Order (**updated after the sandbox-sarmad failure**): **C2 → C3 → C4 → C5 against `sandbox-sarmad`, then C1** (or skip C1 if the team picks the SQLite sandbox as the demo target). The real failure (§2A) is the acceptance test for C2–C4: it must end in a correct `latest.json` and `DIAGNOSTIC_READY` without any manual fix.

| Task | Goal | Key files | Done when (PDF §11) | Integration |
|---|---|---|---|---|
| **C1** | Golden Django + Postgres fixture with a real localhost-vs-`db` defect, plus a reset path | `test-fixtures/golden-demo/**`, `scripts/reset-demo-fixture.sh` | Reset works; failure reproduces; the known fix gives a healthy runtime; health and tests pass | B: analyzer must detect it (django, postgres, env names) |
| **C2** | Safe process runner, Docker and Compose wrappers | `processRunner.ts`, `docker.ts`, `compose.ts` | Can build and start the fixture and accurately report real outcomes | none |
| **C3** | Ordered verification engine | `verifier.ts` | Healthy fixture gives real PASS evidence; broken fixture gives a real failure | A: phase callbacks |
| **C4** | Redaction and FailureBundle, persisted to `latest.json` | `redaction.ts`, `diagnostics.ts`, schema | A real fixture failure produces a safe, useful diagnostic that `/repo2prod-repair` can consume | A/B if the type changes (gap 1) |
| **C5** | Wire `Verify Runtime` end to end with Member A (A's Task 7) | `src/commands/verifyRuntime.ts` (A's file, paired) | Full BUILDING→VERIFIED and failure→DIAGNOSTIC_READY; failure-mode matrix tested | A |
| **C6** | `/repo2prod` skill: Bob finds or creates a health endpoint and declares it; the verifier uses it to prove the deployment works | `templates/bob-skills/repo2prod/SKILL.md` + inline copy in `src/core/bobSkills.ts` (**A's files**), `repo2prod-repair` skill (one guard line), `src/execution/verifier.ts` (reads the declaration) | After `/repo2prod`, the repo has a working `GET /health/` (existing or created) that checks the DB, `.repo2prod/health-endpoint.json` exists, and Verify Runtime reports `health` **PASS from an observed 200** (or FAIL with a reason) | A (skill owner) |

**When to do C6:** the skill-text part is small and can go in any time once Member A agrees. Do it **before the next real `/repo2prod` run**, because installed skills are static. After the change, rerun "Repo2Prod: Install Bob Skills" (it overwrites) and reload Bob if the skill isn't picked up. The verifier part goes into C3, whose prompt already reads the declaration file.

Parallel plan (PDF §17): A Task 6 ∥ B B1/B2 ∥ **C C1/C2**. Second integration is **A + C** (verification to build/start/health/tests plus failure evidence).

---

## 7. How to write a Bob prompt

This template is distilled from the spec's SAMPLE PROMPT (full text in Appendix A). Every Member C prompt uses these sections, in this order:

```text
Read @AGENTS.md completely before making any changes.

I am Member C of Repo2Prod.

This is Task C<N>: <one-line task>.

IMPORTANT CONTEXT
  - what is already done (other members + previous C tasks)
  - what NOT to reimplement
==================================================
OWNERSHIP / SCOPE
==================================================
  - what I own / what others own / do not implement their internals
==================================================
GOAL
==================================================
==================================================
<DETAILED SECTIONS: one per file/component, with requirements + rules>
==================================================
==================================================
ERROR HANDLING
==================================================
  - good vs bad error message examples
==================================================
NO SCOPE EXPANSION
==================================================
  - explicit "do NOT add" list; no new dependencies unless necessary
==================================================
COMPILATION / VALIDATION
==================================================
  - pnpm compile; do not invent pnpm test; manual inspections
==================================================
MANUAL DEVELOPMENT TEST
==================================================
==================================================
FINAL REPORT
==================================================
  - numbered list of what Bob must report back
Do not implement anything outside this task.
```

**Prompt-partner tips:**
- One task per Bob session, and screenshot the consumption summary right after (§9).
- Always give Bob the exact file paths and the existing type names, so it doesn't invent parallel models.
- Always include "Do NOT modify src/core/types.ts / state.ts / orchestrator.ts" unless the task is an agreed interface change.
- Tell Bob what it **can't** see: `.bobignore` blocks `.env*`, `*secret*`, `*password*`, `*token*`, and `tsconfig.json` (there's an exception in place, but mention it). Don't name fixture files with those words.
- Ask for a FINAL REPORT so you can paste it back to me (your prompt partner) for review before the next task.

---

## 8. Ready-to-paste Bob prompts

> Before each one: `git pull`, `pnpm install`, `pnpm compile`, then start a **new** Bob Agent session.

### 8.1 — C1: Golden demo fixture + reset path

```text
Read @AGENTS.md completely before making any changes.

I am Member C of Repo2Prod.

This is Task C1: create the golden demo fixture (Django + PostgreSQL) and its
reset script.

IMPORTANT CONTEXT

The team has chosen Django + PostgreSQL as the only demo stack. Do not add
Node or any other framework.

Member B's deterministic analyzer is already merged and will scan this fixture.
It detects:
- framework "django" via manage.py or a django line in requirements.txt
- env var NAMES in .py files via os.environ["X"], os.environ.get("X"),
  os.getenv("X"), env("X")
- PostgreSQL when it sees DATABASE_URL, PG*, or POSTGRES_* names
- ports only from Dockerfile EXPOSE, compose container ports, or Procfile

Member A's extension installs .bob/skills/ into the TARGET repository and
drives the workflow. The fixture will be opened in Bob as its OWN workspace
(its own git repo), not as a subfolder of the Repo2Prod extension repo.

This task creates files only under:
  test-fixtures/golden-demo/
  scripts/

Do NOT modify anything under src/, templates/, schemas/, or package.json.

==================================================
OWNERSHIP / SCOPE
==================================================

I own: test-fixtures/, scripts/, src/execution/.
This task touches only test-fixtures/golden-demo/ and scripts/.

Member A owns orchestration/state/Bob skills. Member B owns analyzers.
Do not change their files.

==================================================
GOAL
==================================================

A small but realistic Django + PostgreSQL application that:

1. has a real, deterministic runtime configuration defect:
   the application container connects to PostgreSQL at "localhost"
   while Compose exposes PostgreSQL as service "db";
2. becomes fully healthy with one small, obvious, targeted fix;
3. has a health endpoint that PROVES database connectivity;
4. has fast tests that need the database;
5. contains no real secrets;
6. can be reset to an identical baseline with one command.

The failure must be REAL. Do not add demo flags, conditional failures,
sleep hacks, or anything that fails only "for the demo".

==================================================
APPLICATION
==================================================

Location: test-fixtures/golden-demo/

Keep it small. Suggested layout:

  manage.py
  requirements.txt          (pinned: Django 5.x, psycopg[binary] 3.x, gunicorn)
  config/                   (settings.py, urls.py, wsgi.py, __init__.py)
  items/                    (a tiny app: model Item(name, created_at),
                             views, urls, tests.py, migrations/)
  Dockerfile
  compose.yaml
  .dockerignore
  .env.example              (placeholder values only, clearly fake)
  .gitignore
  README.md

Endpoints:
- GET /health/  -> runs `SELECT 1` via django.db.connection.
                   200 {"status":"ok","database":"ok"} on success,
                   503 {"status":"error","database":"unavailable",
                        "error":"<exception class name only>"} on failure.
                   Never include credentials or connection strings in the response.
- GET /api/items/ -> JSON list of items.
- POST /api/items/ -> create item (CSRF-exempt is fine for this tiny API),
  or skip POST if it adds complexity. Keep it simple.

Settings (config/settings.py) must read configuration from environment
variables using os.environ.get / os.environ[...] so Member B's analyzer
detects them:

  SECRET_KEY            (required; no hard-coded real key)
  DEBUG                 (default "0")
  ALLOWED_HOSTS         (default "localhost,127.0.0.1")
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_PASSWORD
  POSTGRES_HOST         (default "localhost")   <-- the realistic defect source
  POSTGRES_PORT         (default "5432")

DATABASES uses django.db.backends.postgresql with those values.

Tests (items/tests.py): 2–4 fast tests using django.test.TestCase:
- health endpoint returns 200 and database "ok"
- creating an Item and listing it via /api/items/
Tests must hit the real database (no SQLite fallback).

==================================================
CONTAINER CONFIGURATION (THE DEFECT)
==================================================

Ship an EXISTING but broken local container configuration, like a real
"works on my laptop" repo:

Dockerfile:
- python:3.12-slim, install requirements, copy source
- EXPOSE 8000
- CMD runs migrations and then gunicorn on 0.0.0.0:8000
  (e.g. sh -c "python manage.py migrate --noinput && gunicorn config.wsgi -b 0.0.0.0:8000")

compose.yaml:
- service "db": image postgres:16-alpine, POSTGRES_DB/USER/PASSWORD set to
  obviously local dev placeholder values (e.g. repo2prod / repo2prod / repo2prod-local-dev),
  a healthcheck using pg_isready, a named volume.
- service "app": build ., ports "8000:8000", depends_on db,
  environment: SECRET_KEY (clearly fake local value), DEBUG, ALLOWED_HOSTS,
  POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_PORT.
  It must NOT set POSTGRES_HOST.

Result: inside the app container, settings fall back to POSTGRES_HOST=localhost,
PostgreSQL is not there, and `migrate` fails with a real
"connection ... localhost ... port 5432 failed: Connection refused" error.

The known correct fix: add `POSTGRES_HOST: db` to the app service environment
(and optionally depends_on condition: service_healthy).
Do NOT apply the fix in the baseline. Document it only in
test-fixtures/golden-demo/FIXTURE_NOTES.md (see below).

Avoid file names containing "secret", "password", "token" or starting with
".env" other than .env.example, because .bobignore hides them from Bob.

==================================================
FIXTURE_NOTES.md (for the team, not the app)
==================================================

Create test-fixtures/golden-demo/FIXTURE_NOTES.md describing:
- the exact defect and why it is realistic
- the exact expected failure output
- the known fix (for manual verification only)
- the expected healthy output
- a note that Repo2Prod demo must never apply this fix automatically

NOTE: the reset script must NOT copy FIXTURE_NOTES.md into the demo workspace,
so Bob cannot read the answer during the demo.

==================================================
RESET SCRIPT
==================================================

Create scripts/reset-demo-fixture.sh (bash, `set -euo pipefail`).

Behaviour:
1. DEMO_DIR="${REPO2PROD_DEMO_DIR:-$HOME/repo2prod-demo}"
2. Compose project name: derive exactly as
   "repo2prod-" + lowercase(basename(DEMO_DIR)) with non [a-z0-9-] chars replaced by "-".
   Print it.
3. If DEMO_DIR exists:
   - it MUST contain the marker file .repo2prod-demo-fixture, otherwise
     abort with a clear error (never delete an arbitrary directory);
   - run `docker compose -p <project> down -v --remove-orphans` inside it
     (ignore "no such project" style errors, but do not use any global prune);
   - remove DEMO_DIR.
4. Copy test-fixtures/golden-demo/ to DEMO_DIR, excluding FIXTURE_NOTES.md.
5. Create the marker file .repo2prod-demo-fixture.
6. git init, add all, commit "baseline: golden demo fixture"
   (use -c user.name/user.email locals so it works on any machine).
7. Print next steps: "Open $DEMO_DIR in IBM Bob".

The script must be resolvable from any cwd (use the script's own directory to
find the repo root).

Never run: docker system prune, docker volume prune, docker image prune,
or any command without the -p project scope.

Update scripts/README.md and test-fixtures/golden-demo/README.md
(the README inside the fixture should read like a normal app README:
how to run locally, the endpoints, the env vars — no mention of the defect).

==================================================
NO SCOPE EXPANSION
==================================================

Do NOT add:
- Django REST Framework, Celery, Redis, nginx, or other services
- a second framework
- CI workflows (.github/) — Bob generates those later via /repo2prod-ci
- TypeScript changes
- fake failure flags
- real credentials

==================================================
MANUAL DEVELOPMENT TEST
==================================================

Run and report the actual output of:

1. scripts/reset-demo-fixture.sh
2. cd ~/repo2prod-demo && docker compose -p <project> up --build -d
3. docker compose -p <project> ps     -> app exited / restarting
4. docker compose -p <project> logs app --tail 40   -> localhost:5432 refused
5. Apply the known fix in the DEMO copy only, then:
   docker compose -p <project> up --build -d
6. curl -s -o - -w "%{http_code}" http://localhost:8000/health/   -> 200
7. docker compose -p <project> run --rm app python manage.py test -> OK
8. docker compose -p <project> down -v
9. scripts/reset-demo-fixture.sh again -> defect is back (baseline restored)

Do not run pnpm test (it does not exist).

==================================================
FINAL REPORT
==================================================

1. Files created (full tree)
2. Env var names referenced in settings.py
3. Exact defect and exact observed failure log lines
4. Exact known fix
5. Health endpoint behaviour (200/503 bodies)
6. Test list and observed test result
7. Compose project name derivation
8. Reset script safety checks
9. Results of each manual test step
10. Any assumptions or risks (especially: could Bob's /repo2prod
    proactively fix the defect?)

Do not implement anything outside this task.
```

**After C1, do this yourself (costs about 1 Bob run):** open `~/repo2prod-demo` in Bob, run Repo2Prod Start Productionization, approve the plan, run `/repo2prod`, and check whether the defect survives (gap 3). Record the result in §12.

---

### 8.2 — C2: Process runner + Docker/Compose execution

```text
Read @AGENTS.md completely before making any changes.

I am Member C of Repo2Prod.

This is Task C2: implement safe process execution and Docker/Compose
wrappers.

IMPORTANT CONTEXT

REAL TEST TARGET (use this, not an imaginary app):
~/Desktop/sandbox-sarmad-work  (a copy of ~/Desktop/sandbox-sarmad; never
modify the baseline copy ~/Desktop/sandbox-sarmad-failing-baseline).
It is a Django 6.1 + SQLite app that Bob already productionized. Docker build
succeeds, but the app container exits during `migrate` with
  sqlite3.OperationalError: unable to open database file
because compose.yaml mounts the named volume db_data onto the FILE path
/app/db.sqlite3 (a named volume is always a directory).
DO NOT FIX THIS FAILURE — it is the input my code must observe and report.
Facts: single service "app", no db service, port 8000 published, no health
endpoint (only /admin/), no tests, a real .env exists (NEVER read it and
NEVER run `docker compose config`, which would print interpolated secrets).

Note: `docker compose up -d` exits 0 for this sandbox even though the app
container dies seconds later. The wrappers must make that visible:
composePs must return state "exited" and the container exit code.

The following files are stubs owned by me:
  src/execution/processRunner.ts   (types only — KEEP these types)
  src/execution/docker.ts          (dockerBuild stub)
  src/execution/compose.ts         (composeUp/composeDown stubs)

No other module calls these stubs yet, so their signatures may change.
Nothing outside src/execution/ should be modified in this task.

Member A's orchestrator owns workflow state. This task must NOT import
vscode and must NOT change state. It only runs commands and returns results.

==================================================
OWNERSHIP / SCOPE
==================================================

Modify only:
  src/execution/processRunner.ts
  src/execution/docker.ts
  src/execution/compose.ts
(optionally a new src/execution/executionTypes.ts if it keeps things clean)

Do NOT modify src/core/*, src/commands/*, src/analyzers/*, schemas/, templates/.
Do NOT implement verifier.ts or diagnostics.ts (those are C3/C4).

==================================================
GOAL
==================================================

Deterministic, bounded, cancellable command execution that accurately reports
real outcomes, and thin Docker/Compose wrappers scoped to a Repo2Prod-owned
Compose project.

==================================================
processRunner.ts
==================================================

Keep existing exported types: ProcessRunOptions, ProcessRunResult,
ProcessHandle, ProcessRunner.

You may extend them with optional fields, e.g.:
- ProcessRunOptions.signal?: AbortSignal       (cancellation)
- ProcessRunOptions.maxOutputBytes?: number    (default 64 KiB per stream)
- ProcessRunResult.stdoutTruncated / stderrTruncated: boolean
- ProcessRunResult.spawnError: string | null   (e.g. ENOENT)
- ProcessRunResult.cancelled: boolean

Implement:
  export const runProcess: ProcessRunner

Requirements:
- child_process.spawn with shell: false (never build shell strings)
- env = { ...process.env, ...options.env }
- timeout: on expiry send SIGTERM, then SIGKILL after a short grace period;
  timedOut = true
- cancellation via AbortSignal: same kill sequence; cancelled = true
- bounded output: keep only the LAST maxOutputBytes of each stream
  (tail is what matters for diagnostics); set *Truncated flags
- never reject on non-zero exit; resolve with exitCode
- ENOENT (command missing) resolves with exitCode null and a clear spawnError,
  e.g. "Command not found: docker"
- durationMs measured
- no global mutable state

Also export a small helper to format a command for display/logs:
  formatCommand(command, args): string

==================================================
docker.ts
==================================================

All functions take a ProcessRunner (dependency injection) so they can be
unit tested without Docker.

Implement:
- checkDocker(runner, cwd): Promise<DockerAvailability>
    run `docker version --format {{.Server.Version}}`
    distinguish:
      CLI missing       -> "Docker CLI not found. Install Docker Desktop and retry."
      daemon not running -> "Docker is not running. Start Docker and retry."
      ok                -> server version
Remove the old dockerBuild stub (builds go through Compose).

==================================================
compose.ts
==================================================

All functions take a ComposeContext:
  { runner, cwd, projectName, composeFile?: string, timeoutMs? }

Every command MUST include `-p <projectName>` (and `-f <file>` if given).

Implement:
- deriveComposeProjectName(workspaceRoot): string
    "repo2prod-" + lowercased basename, non [a-z0-9-] -> "-"
    (must match scripts/reset-demo-fixture.sh exactly)
- findComposeFile(workspaceRoot): string | null
    compose.yaml, compose.yml, docker-compose.yml, docker-compose.yaml
- checkCompose(ctx)            -> `docker compose version`
- composeBuild(ctx)            -> `docker compose -p X build`
- composeUp(ctx)               -> `docker compose -p X up -d`
- composePs(ctx)               -> `docker compose -p X ps -a --format json`
    parse BOTH output shapes (JSON array, or one JSON object per line);
    return [{ service, state, health, exitCode }]
- composePort(ctx, service, containerPort) -> host port number | null
    (`docker compose -p X port <service> <port>`)
- composeLogs(ctx, service, tailLines) -> `logs --no-color --tail N <service>`
- composeRun(ctx, service, command[]) -> `run --rm <service> ...`
- composeDown(ctx, { removeVolumes }) -> `down --remove-orphans [-v]`

Each returns a typed result including the ProcessRunResult and the
formatted command string, so C3/C4 can put the exact command in diagnostics.

==================================================
DOCKER SAFETY
==================================================

Never run, anywhere:
  docker system prune, docker volume prune, docker image prune,
  docker rm -f $(docker ps ...), or any compose command without -p.

==================================================
ERROR HANDLING
==================================================

Good: "Docker is not running. Start Docker and retry."
Good: "docker compose build timed out after 300s."
Good: "No Compose file found in <root> (looked for compose.yaml, ...)."
Bad:  "Something went wrong."

Do not use broad catch blocks that hide failures.

==================================================
NO SCOPE EXPANSION
==================================================

Do NOT add: npm dependencies (use node:child_process), vscode imports,
state transitions, verification logic, diagnostics files, retries loops,
Kubernetes, cloud, image registries.

==================================================
COMPILATION / VALIDATION
==================================================

1. pnpm compile — must pass under strict mode.
2. There is no pnpm test. Do not invent it.
3. Confirm no destructive Docker commands exist:
   grep -rn "prune" src/  -> nothing
4. Confirm every compose invocation includes -p.

==================================================
MANUAL DEVELOPMENT TEST
==================================================

Write a throwaway script OUTSIDE src/ (e.g. scripts/dev-exec-smoke.mjs)
that imports the compiled out/execution/*.js and, against
~/Desktop/sandbox-sarmad-work:
1. checkDocker, checkCompose
2. composeBuild -> exit 0
3. composeUp -> exit 0 (!), wait ~5s, then composePs -> app state "exited",
   exit code 1
4. composeLogs app 60 -> contains "unable to open database file"
5. composeDown({ removeVolumes: true }) -> only project repo2prod-sandbox-sarmad-work
   resources removed
Also show a timeout case (e.g. `sleep 5` with timeoutMs 500) and an ENOENT
case (a non-existent command).
Do not fix the sandbox. Report actual outputs.

==================================================
FINAL REPORT
==================================================

1. Files created/modified
2. Final exported API of each file
3. How timeout and cancellation work
4. Output bounding strategy
5. Compose ps JSON parsing (both shapes)
6. Project-name derivation (and that it will match the C1 reset script)
7. pnpm compile result
8. Manual smoke-test outputs
9. Risks/assumptions

Do not implement anything outside this task.
```

---

### 8.3 — C3: Verification engine

```text
Read @AGENTS.md completely before making any changes.

I am Member C of Repo2Prod.

This is Task C3: implement the verification engine in
src/execution/verifier.ts.

IMPORTANT CONTEXT

REAL TEST TARGET (use this, not an imaginary app):
~/Desktop/sandbox-sarmad-work  (a copy of ~/Desktop/sandbox-sarmad; never
modify the baseline copy ~/Desktop/sandbox-sarmad-failing-baseline).
It is a Django 6.1 + SQLite app that Bob already productionized. Docker build
succeeds, but the app container exits during `migrate` with
  sqlite3.OperationalError: unable to open database file
because compose.yaml mounts the named volume db_data onto the FILE path
/app/db.sqlite3 (a named volume is always a directory).
DO NOT FIX THIS FAILURE — it is the input my code must observe and report.
Facts: single service "app", no db service, port 8000 published, no health
endpoint (only /admin/), no tests, a real .env exists (NEVER read it and
NEVER run `docker compose config`, which would print interpolated secrets).

Expected result for this sandbox: docker/compose/build PASS, database
NOT_RUN (no infra service), app FAIL at STARTING, health/tests NOT_RUN.

C2 is complete: src/execution/processRunner.ts, docker.ts, compose.ts provide
runProcess, checkDocker, checkCompose, composeBuild, composeUp, composePs,
composePort, composeLogs, composeRun, composeDown, deriveComposeProjectName,
findComposeFile.

Shared types in src/core/types.ts (DO NOT MODIFY):
  RunStatus = 'PASS'|'FAIL'|'WARN'|'NOT_RUN'|'UNKNOWN'
  CheckResult { id, status, observed, detail }
  VerificationResult { checks: CheckResult[] }

Member A's orchestrator (src/core/orchestrator.ts) owns state and has hooks:
  beginStarting()      BUILDING -> STARTING
  beginVerification()  STARTING -> VERIFYING_HEALTH
  beginTests()         VERIFYING_HEALTH -> RUNNING_TESTS
  markVerified()       RUNNING_TESTS -> VERIFIED
  recordFailure(bundle)  -> DIAGNOSTIC_READY
The verifier must NOT import the orchestrator or vscode. It reports phases
through a callback so Member A's command layer can call those hooks.

Member B's RuntimeManifest has commands all null, so the verifier must not
depend on manifest.commands.

==================================================
OWNERSHIP / SCOPE
==================================================

Modify only src/execution/verifier.ts (and a small
src/execution/verifyDefaults.ts for stack defaults if useful).
Do NOT modify src/core/*, src/commands/*, analyzers, schemas.
Do NOT write diagnostics files (C4).

==================================================
GOAL
==================================================

Run verification in a fixed order and return real, observed evidence.
Stop at the first failing phase and report which phase failed plus the raw
(unredacted, bounded) output needed for diagnostics.

==================================================
API
==================================================

export type ExecutionPhase = 'BUILDING' | 'STARTING' | 'VERIFYING_HEALTH' | 'RUNNING_TESTS';

export interface VerifyOptions {
  workspaceRoot: string;
  projectName?: string;          // default deriveComposeProjectName(root)
  composeFile?: string;          // default findComposeFile(root)
  appService: string;            // default 'app'
  infraServices: string[];       // manifest services whose id !== 'app' ([] for sandbox-sarmad)
  appContainerPort: number | null; // manifest app port; null -> use the port Compose publishes for app
  healthPath: string | null;     // from .repo2prod/health-endpoint.json (C6) if valid; null -> smoke probe of "/"
  testCommand: string[] | null;  // Django default ['python','manage.py','test'] (null -> NOT_RUN)
  timeouts: { buildMs, upMs, readinessMs, healthMs, testsMs };
}

export interface VerificationOutcome {
  result: VerificationResult;
  failedPhase: ExecutionPhase | null;
  failure: {
    command: string | null;
    exitCode: number | null;
    failedService: string | null;
    rawOutputTail: string;   // bounded, NOT yet redacted (C4 redacts)
    truncated: boolean;
  } | null;
}

export async function runVerification(
  options: VerifyOptions,
  runner: ProcessRunner,
  onPhase: (phase: ExecutionPhase) => void,
  signal?: AbortSignal,
): Promise<VerificationOutcome>

Provide buildVerifyOptions(workspaceRoot, manifest) that is MANIFEST-DRIVEN:
- infraServices = manifest.services ids other than 'app' (do NOT assume 'db'
  or PostgreSQL exist — sandbox-sarmad has neither)
- appContainerPort from the 'app' service ports, else null
- framework defaults only where the manifest says django, in ONE clearly
  named object (e.g. DJANGO_DEFAULTS = { testCommand: ['python','manage.py','test'],
  healthPath: null })
- healthPath: read .repo2prod/health-endpoint.json if it exists (written by
  Bob via the /repo2prod skill — task C6). Validate it strictly:
  { "path": string starting with "/", "method": "GET", "expectStatus": 200,
    "checks": string[], "source": "existing" | "created-by-bob",
    "files": string[] }
  Invalid/missing file -> healthPath null (smoke probe). The file is only a
  HINT about where to look — it is never evidence; PASS needs an observed 200.
workspaceRoot must be the currently opened folder passed by the caller —
never evidence.workspaceRoot (sandbox-sarmad's evidence points at another
machine). Keep runVerification framework-agnostic.

Replace the old verifyRuntime(manifest) stub (nothing calls it).

==================================================
VERIFICATION ORDER
==================================================

onPhase('BUILDING')
  check 'docker'   : checkDocker      PASS/FAIL, observed true
  check 'compose'  : checkCompose + compose file exists
  check 'build'    : composeBuild exit 0
onPhase('STARTING')
  composeUp
  (composeUp exit 0 is NOT evidence the app is running.)
  check 'database' : for each infraServices entry, poll composePs until
                     health == healthy (or running if no healthcheck) within
                     readinessMs. If infraServices is empty -> NOT_RUN,
                     observed false, detail "No infrastructure service in manifest".
  check 'app'      : app container state == running (not exited/restarting)
                     for a stability window (still running after ~5s, re-check ps).
                     If exited: FAIL, failedService 'app', exitCode = container
                     exit code from ps, command = the `up -d` command,
                     rawOutputTail = composeLogs app tail (~120 lines).
onPhase('VERIFYING_HEALTH')
  hostPort = composePort(app, appContainerPort)
  check 'health'   : if healthPath set: GET http://127.0.0.1:<hostPort><healthPath>
                       retry with backoff until healthMs;
                       200 -> PASS; 404 on the explicit path -> FAIL;
                       5xx / refused / timeout -> FAIL.
                     if healthPath null (sandbox-sarmad: only /admin/ exists):
                       smoke probe GET "/" with the same retry;
                       any HTTP status < 500 (including 404) -> WARN, observed true,
                       detail "Server responds (HTTP <code>); no explicit health endpoint";
                       5xx / refused / timeout -> FAIL.
                       Never PASS without an explicit health endpoint.
                     On failure include last status/body snippet + app logs tail.
onPhase('RUNNING_TESTS')
  check 'tests'    : composeRun(app, testCommand)
                     exit 0 -> PASS; non-zero -> FAIL;
                     testCommand null -> NOT_RUN (observed false)
                     If output contains "Ran 0 tests" or "NO TESTS RAN" -> NOT_RUN
                     (observed true, detail "No tests found") regardless of exit
                     code — never PASS. sandbox-sarmad has no tests.

After the first FAIL: every remaining check is NOT_RUN, observed false,
detail "Skipped: earlier phase failed".

Leave containers RUNNING on success (the demo shows a live app).
On failure also leave them (useful for inspection); cleanup is a separate
explicit call — do not auto-prune.

Use Node's built-in fetch with AbortSignal.timeout; no new dependencies.

==================================================
RULES
==================================================

- observed=true only for checks whose command/HTTP call actually executed.
- Never PASS because a file exists or config looks right.
- Never retry the whole pipeline. Polling for readiness inside a phase is fine.
- Honour the AbortSignal between and within phases.

==================================================
NO SCOPE EXPANSION
==================================================

No vscode import, no state transitions, no diagnostics file writing,
no redaction (C4), no new dependencies, no readiness percentages.

==================================================
COMPILATION / VALIDATION
==================================================

1. pnpm compile passes.
2. No pnpm test.
3. Inspect: every PASS path is preceded by a real command/HTTP result.

==================================================
MANUAL DEVELOPMENT TEST
==================================================

Using a throwaway script outside src/ against ~/Desktop/sandbox-sarmad-work:
1. Expect: docker/compose/build PASS, database NOT_RUN, app FAIL at STARTING
   with exit code 1 and "unable to open database file" in rawOutputTail,
   health/tests NOT_RUN. Report the actual VerificationOutcome JSON.
2. In a SEPARATE scratch copy only (never the baseline), remove the volume
   line to confirm the healthy path: expect app PASS, health WARN (HTTP 404
   on "/", no explicit endpoint), tests NOT_RUN ("NO TESTS RAN").
   Delete that scratch copy afterwards. Do not commit any sandbox change.
3. composeDown each project afterwards (scoped -p only).

==================================================
FINAL REPORT
==================================================

1. Files created/modified
2. Final API
3. Check ids and their PASS/FAIL/NOT_RUN semantics
4. Where Django defaults live
5. Timeouts chosen
6. Observed VerificationOutcome for the failing sandbox and the scratch healthy copy
7. pnpm compile result
8. Risks (e.g. port conflicts on 8000, slow first build)

Do not implement anything outside this task.
```

---

### 8.4 — C4: Redaction + diagnostics / FailureBundle

> **Before running:** agree gap 1 with the team. If the shared-type change is **not** approved, delete the "OPTIONAL SHARED-TYPE EXTENSION" section from the prompt.

```text
Read @AGENTS.md completely before making any changes.

I am Member C of Repo2Prod.

This is Task C4: implement secret redaction and bounded FailureBundle
diagnostics persisted to .repo2prod/diagnostics/latest.json.

IMPORTANT CONTEXT

C2 (process/docker/compose) and C3 (runVerification in
src/execution/verifier.ts) are complete. runVerification returns a
VerificationOutcome with failedPhase and a failure object containing
command, exitCode, failedService, rawOutputTail (bounded, NOT redacted),
truncated.

Bob's /repo2prod-repair skill (templates/bob-skills/repo2prod-repair/SKILL.md)
reads:
  .repo2prod/runtime-manifest.json
  .repo2prod/diagnostics/latest.json
and treats the diagnostic as ground truth. So latest.json must be SMALL,
SAFE, and USEFUL.

Real target: ~/Desktop/sandbox-sarmad-work (Django + SQLite; app exits at
STARTING with "sqlite3.OperationalError: unable to open database file"
because compose mounts named volume db_data onto the file /app/db.sqlite3).
Do NOT fix it. The bundle for it should name phase STARTING, failed service
app (exited, code 1), relevant files compose.yaml, Dockerfile, .dockerignore,
config/settings.py, and keep the Django traceback tail.
A real .env exists there: never read it, never run `docker compose config`.

Shared type (src/core/types.ts):
  FailureBundle { attempt, phase, command, exitCode, redactedExcerpt, truncated }
Schema: schemas/diagnostics.schema.json (additionalProperties: false).

Member A's orchestrator.recordFailure(bundle) stores the bundle in
run-state and moves to DIAGNOSTIC_READY. The attempt number comes from
orchestrator.repairAttemptsUsed().

==================================================
OWNERSHIP / SCOPE
==================================================

Modify:
  src/core/redaction.ts        (stub assigned to Member C)
  src/execution/diagnostics.ts
Do NOT modify orchestrator/state/commands/analyzers.

==================================================
GOAL
==================================================

Turn a real observed failure into a bounded, redacted FailureBundle and
persist it for Bob.

==================================================
redaction.ts
==================================================

export function redactText(input: string, extraSecrets?: readonly string[]): string

Replace with "[REDACTED]":
- any literal in extraSecrets (length >= 4), longest first
- URL credentials: scheme://user:pass@host  -> scheme://user:[REDACTED]@host
- KEY=VALUE / KEY: VALUE where KEY matches
  /(SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY|CREDENTIAL|AUTH)/i
  (keep the key name, redact the value)
- Authorization: Bearer <token> / Basic <b64>
- PEM private key blocks
- common token shapes: ghp_/gho_/github_pat_, sk-..., AKIA[0-9A-Z]{16},
  xox[bap]-..., long base64/hex strings (>= 32 chars) that follow
  "key", "secret" or "token" words
Keep env var NAMES visible (they are safe and useful to Bob).
Pure function, no I/O.

Also export:
export function boundText(input: string, maxLines: number, maxBytes: number)
  : { text: string; truncated: boolean }
  keeps the TAIL; defaults 120 lines / 12 KiB.

==================================================
diagnostics.ts
==================================================

export function createFailureBundle(input: {
  attempt: number;
  phase: Repo2ProdState;
  command: string | null;
  exitCode: number | null;
  rawOutput: string;
  extraSecrets?: readonly string[];
}): FailureBundle
  - redact FIRST, then bound (so a secret split by truncation is still caught
    — or bound generously, redact, then bound again; explain choice)
  - redact the command string too

export async function writeFailureBundle(workspaceRoot, bundle): Promise<string>
  - validates shape against the FailureBundle contract before writing
  - writes .repo2prod/diagnostics/latest.json (UTF-8, pretty)
  - also writes .repo2prod/diagnostics/attempt-<n>.json so attempt 2 can
    reference attempt 1
  - creates the directory if missing
  - clear error: "Repo2Prod: failed to write .repo2prod/diagnostics/latest.json: <reason>"

export async function clearDiagnostics(workspaceRoot): Promise<void>
  - deletes only files inside .repo2prod/diagnostics/ (for a new run)

redactedExcerpt should begin with a short header block that helps Bob
without adding schema fields, e.g.:
  Phase: STARTING
  Failed service: app
  Command: docker compose -p repo2prod-demo up -d
  Relevant files: compose.yaml, Dockerfile, config/settings.py
  Manifest: .repo2prod/runtime-manifest.json
  --- log tail ---
  ...

==================================================
OPTIONAL SHARED-TYPE EXTENSION (only if the team approved it)
==================================================

Add OPTIONAL fields to FailureBundle in src/core/types.ts AND
schemas/diagnostics.schema.json in the same change:
  failedService?: string | null
  relevantFiles?: string[]
  manifestRef?: string
  previousOutcome?: string | null
Keep existing required fields unchanged. Update every consumer.
If not approved, skip this section and use the header block above.

==================================================
SECRET RULES (non-negotiable)
==================================================

- Never read .env files.
- Never include env VALUES; names are fine.
- No full logs; bounded tails only.
- Nothing in latest.json may contain the fixture's local DB password or
  SECRET_KEY value — test this explicitly.

==================================================
NO SCOPE EXPANSION
==================================================

No LLM calls, no vscode import, no state transitions, no new dependencies,
no log shipping, no full log archives.

==================================================
COMPILATION / VALIDATION
==================================================

1. pnpm compile passes.
2. No pnpm test.
3. Self-check examples (in the report) showing redactText on:
   postgres://repo2prod:repo2prod-local-dev@db:5432/repo2prod
   SECRET_KEY=abc123...  |  Authorization: Bearer xyz  |  a PEM block
   and that "POSTGRES_HOST" / "connection refused" /
   "sqlite3.OperationalError: unable to open database file" text survives.

==================================================
MANUAL DEVELOPMENT TEST
==================================================

Against ~/Desktop/sandbox-sarmad-work: run runVerification, build the
bundle (extraSecrets empty — Repo2Prod does not know .env values), write it,
then:
  cat ~/Desktop/sandbox-sarmad-work/.repo2prod/diagnostics/latest.json
Confirm: under ~12 KiB, phase STARTING, contains "unable to open database
file", contains no SECRET_KEY value. Also append a fake line
"SECRET_KEY=abcd1234efgh5678" to a test string and show it is redacted.
(If the C1 Postgres fixture exists later, repeat there with extraSecrets =
its local DB password.)

==================================================
FINAL REPORT
==================================================

1. Files modified
2. Redaction patterns list
3. Bounding limits and order (redact vs bound)
4. Example latest.json from the real failure
5. Proof no secrets present
6. Whether the shared type was extended
7. pnpm compile result
8. Risks

Do not implement anything outside this task.
```

---

### 8.5 — C5: Execution integration with Member A (A's Task 7)

> Pair with Member A. Their file `src/commands/verifyRuntime.ts` is being edited, so agree on it first.

```text
Read @AGENTS.md completely before making any changes.

I am Member C of Repo2Prod, pairing with Member A on Task 7.

This is Task C5: wire real execution/verification into the
"Repo2Prod: Verify Runtime" command.

IMPORTANT CONTEXT

Complete:
- src/execution/processRunner.ts, docker.ts, compose.ts (C2)
- src/execution/verifier.ts: runVerification(options, runner, onPhase, signal)
  + buildVerifyOptions(workspaceRoot, manifest) (C3)
- src/core/redaction.ts, src/execution/diagnostics.ts:
  createFailureBundle, writeFailureBundle, clearDiagnostics (C4)
- Member A orchestrator hooks: markBobProductionizationComplete,
  markBobRepairComplete, beginStarting, beginVerification, beginTests,
  markVerified, recordFailure, repairAttemptsUsed, runState.

src/commands/verifyRuntime.ts currently moves to BUILDING and stops with
"verification implementation pending". Member A owns this file; we are
editing it together with the smallest possible change.

==================================================
OWNERSHIP / SCOPE
==================================================

Modify:
  src/commands/verifyRuntime.ts   (paired with Member A)
  src/execution/*                 (small fixes only if integration needs them)
Only if strictly necessary, add a tiny method to the orchestrator for storing
the VerificationResult (e.g. recordVerification(result)) — agree with
Member A; do not rewrite the orchestrator.

Do NOT change state.ts transition map or MAX_REPAIR_ATTEMPTS.
Do NOT change analyzers or Bob skills.

==================================================
GOAL
==================================================

WAITING_FOR_BOB_PRODUCTIONIZATION / WAITING_FOR_BOB_REPAIR
  -> Verify Runtime
  -> BUILDING -> STARTING -> VERIFYING_HEALTH -> RUNNING_TESTS -> VERIFIED
On failure:
  -> FailureBundle -> .repo2prod/diagnostics/latest.json -> DIAGNOSTIC_READY
  -> message: "Verification failed at <phase>. Run 'Repo2Prod: Prepare Repair'
     then /repo2prod-repair in Bob Agent mode." (A handles budget)

==================================================
WIRING
==================================================

In verifyRuntime:
1. Existing state guard + mark*Complete() -> BUILDING (keep as is).
2. Load manifest from orchestrator.runState().manifest; if null, fail
   clearly ("Runtime manifest missing — run Start Productionization").
3. options = buildVerifyOptions(workspaceRoot, manifest)
4. vscode.window.withProgress (Notification, cancellable) and pass an
   AbortSignal wired to the cancellation token.
5. onPhase mapping:
     'BUILDING'          -> (already BUILDING, no-op)
     'STARTING'          -> orchestrator.beginStarting()
     'VERIFYING_HEALTH'  -> orchestrator.beginVerification()
     'RUNNING_TESTS'     -> orchestrator.beginTests()
   Update the progress message on each phase.
6. On success -> store the VerificationResult (agreed method) ->
   orchestrator.markVerified() -> info message listing check statuses.
7. On failure ->
     bundle = createFailureBundle({ attempt: orchestrator.repairAttemptsUsed(),
       phase: <current state>, command, exitCode, rawOutput, extraSecrets })
     await writeFailureBundle(root, bundle)
     orchestrator.recordFailure(bundle)
     error message with phase + next step.
   If attempts used == MAX_REPAIR_ATTEMPTS, say the limit is reached and
   that the run will stop (Member A decides FAILED transition).
8. Unexpected exceptions (e.g. Docker not running before BUILDING checks
   complete) must still produce a FailureBundle at the current phase, not a
   silent crash.
9. Output channel "Repo2Prod" with bounded, REDACTED summaries only.

extraSecrets: only values Repo2Prod itself generated/knows (e.g. from
.repo2prod/resolved-config.json if Member A writes generated local secrets
there). Never read .env.

==================================================
FAILURE-MODE MATRIX (test each, report outcome)
==================================================

1. Docker Desktop stopped            -> FAIL at BUILDING, "Docker is not running…"
2. Dockerfile syntax broken          -> FAIL at BUILDING (build)
3. db never healthy (bad image tag)  -> FAIL at STARTING (database)
4. sandbox-sarmad (SQLite volume bug) -> FAIL at STARTING (app exited 1,
                                       "unable to open database file"), latest.json written
4b. C1 fixture defect (if built)     -> FAIL at STARTING (app exits, localhost:5432)
5. health returns 503/404            -> FAIL at VERIFYING_HEALTH
6. a test deliberately failing       -> FAIL at RUNNING_TESTS
7. After Bob's /repo2prod-repair      -> VERIFIED (sandbox: app PASS, health WARN
                                       no endpoint, tests NOT_RUN; fixture: all PASS)
8. Cancel during build               -> clean cancellation message, no hang
9. Reset Run + reset script          -> only Repo2Prod project resources removed

Revert every deliberate breakage after testing; reset the fixture.

==================================================
NO SCOPE EXPANSION
==================================================

No automatic repair, no automatic retry, no Bob invocation, no CI generation,
no readiness report UI (Member A/B), no new dependencies.

==================================================
COMPILATION / VALIDATION
==================================================

1. pnpm compile
2. pnpm run package (or pnpm exec vsce package) and install the VSIX in Bob
3. No pnpm test

==================================================
MANUAL DEVELOPMENT TEST (in IBM Bob)
==================================================

First target: a fresh copy of ~/Desktop/sandbox-sarmad-failing-baseline
opened in Bob (Bob's runtime files already exist, so /repo2prod can be
skipped to save Bobcoins if the run state is already
WAITING_FOR_BOB_PRODUCTIONIZATION for this folder; otherwise
Start Productionization -> approve -> /repo2prod).
1. Open the sandbox copy in Bob
2. Ensure state WAITING_FOR_BOB_PRODUCTIONIZATION (re-run Start + approve
   if the copied run-state points at another machine)
3. (only if needed) /repo2prod in Bob Agent mode
4. Repo2Prod: Verify Runtime -> app FAIL at STARTING -> DIAGNOSTIC_READY,
   latest.json contains "unable to open database file"
5. Repo2Prod: Prepare Repair -> /repo2prod-repair in Bob Agent
6. Repo2Prod: Verify Runtime -> VERIFIED
7. Check .repo2prod/run-state.json phases and repairAttempts

==================================================
FINAL REPORT
==================================================

1. Files modified (and which lines in Member A's files)
2. Phase -> orchestrator hook mapping
3. Failure-mode matrix results (actual)
4. Example latest.json
5. Final run-state.json after success
6. pnpm compile / package result
7. Integration risks for demo day

Do not implement anything outside this task.
```

---

### 8.7 — C6: Health endpoint in the /repo2prod skill (paired with Member A)

> **Why:** "the container is running" doesn't prove the deployment worked, and most repos (e.g. sandbox-sarmad, which only has `/admin/`) have nothing to probe. This task makes Bob find or create a real health endpoint during `/repo2prod`, so Repo2Prod can **observe** success. **Skill files belong to Member A.** Get their OK, or let them run this prompt.
> **Guardrails:** the endpoint must genuinely check the app's dependencies. An always-200 endpoint would be a fake PASS. Bob may **not** add tests in this task, so no test PASS gets inflated.

```text
Read @AGENTS.md completely before making any changes.

I am Member C of Repo2Prod, pairing with Member A (owner of Bob skills).

This is Task C6: extend the /repo2prod Bob skill so Bob ensures the target
application exposes a real health endpoint and declares it for Repo2Prod's
verifier.

IMPORTANT CONTEXT

Repo2Prod installs static Bob skills into the TARGET repository:
  .bob/skills/repo2prod/SKILL.md
  .bob/skills/repo2prod-repair/SKILL.md
Their content lives in TWO places that must stay identical:
  templates/bob-skills/<name>/SKILL.md
  src/core/bobSkills.ts  (inline SkillDefinition strings, "must stay in sync
                          with templates/bob-skills/*/SKILL.md")
The installer overwrites existing skill files on install.

Latest main (821338d) made .repo2prod/resolved-config.json optional in the
/repo2prod skill. Keep that behaviour.

Problem observed: in the real sandbox (Django + SQLite, only /admin/ route)
there is no health endpoint, so Repo2Prod's verifier can only do a smoke
probe of "/" (404 -> WARN) and can never prove the deployment succeeded.

Repo2Prod rule (AGENTS.md §12): PASS requires observed execution. The
declaration file Bob writes is only a hint of WHERE to probe; the verifier
must still observe HTTP 200 itself.

==================================================
OWNERSHIP / SCOPE
==================================================

Modify only:
  templates/bob-skills/repo2prod/SKILL.md
  templates/bob-skills/repo2prod-repair/SKILL.md   (one guard paragraph)
  src/core/bobSkills.ts                            (mirror the same text)
Do NOT change skill names, the installer logic, state machine,
orchestrator, analyzers, or execution code in this task.
Do NOT modify any target/sandbox repository.

==================================================
GOAL
==================================================

Add a new numbered step to the /repo2prod skill, placed after "Create or
minimally repair the local Docker runtime" and before the final summary:

  **Ensure a health endpoint exists**
  1. Search the repository for an existing health/readiness endpoint
     (e.g. routes/views named health, healthz, ready, status, ping).
  2. If one exists and it returns HTTP 200 only when the app can serve
     requests, reuse it. Do not duplicate it.
  3. If none exists, create the smallest possible one using the project's
     existing framework conventions:
     - GET /health/ (Django: a small view + one urls.py entry; no new
       dependencies, no new app unless unavoidable)
     - returns 200 with JSON {"status":"ok", ...} when healthy
     - if the app uses a database, it must actually check it
       (e.g. a trivial SELECT 1 / connection check) and return 503 with
       {"status":"error"} when the check fails
     - must not require authentication, must not be blocked by CSRF for GET,
       must work with the ALLOWED_HOSTS / host settings used in the local
       container (requests will come from the host to 127.0.0.1/localhost)
     - must never expose secrets, env values, connection strings, stack
       traces, or version details
     - must NOT be hard-coded to always return 200
  4. Do not add or modify tests in this step.
  5. Write .repo2prod/health-endpoint.json exactly in this shape:
     {
       "path": "/health/",
       "method": "GET",
       "expectStatus": 200,
       "checks": ["database"],          // [] if no dependency is checked
       "source": "existing" | "created-by-bob",
       "files": ["<repo-relative files that define the endpoint>"]
     }
  6. In the final summary, state the health path, whether it was existing
     or created, and what it checks. Do not claim it works — Repo2Prod will
     verify it.

Also update step 4 ("Do not refactor unrelated application code") so it
explicitly allows the minimal health-endpoint change above and nothing else.

In the /repo2prod-repair skill add one paragraph:
  "Do not remove, bypass, or weaken the health endpoint declared in
   .repo2prod/health-endpoint.json. If the health check failed, fix the
   underlying cause, not the check. Only change the endpoint if the
   diagnostic shows the endpoint itself is broken, and keep
   .repo2prod/health-endpoint.json accurate."

Keep both skills short and phase-specific (AGENTS.md §19).

==================================================
NO SCOPE EXPANSION
==================================================

Do NOT add: metrics/monitoring endpoints, auth changes, new packages,
readiness percentages, tests, CI, cloud config, a generic multi-framework
health library, or verifier/execution code.

==================================================
COMPILATION / VALIDATION
==================================================

1. pnpm compile
2. No pnpm test (does not exist).
3. Diff the template SKILL.md files against the inline strings in
   src/core/bobSkills.ts — they must match exactly (report how you checked).
4. Confirm skill frontmatter (name, description, user-invocable) unchanged.

==================================================
MANUAL DEVELOPMENT TEST
==================================================

1. pnpm compile && package/install the VSIX in Bob.
2. Open a COPY of the sandbox (never the failing baseline):
   run "Repo2Prod: Install Bob Skills" and confirm
   .bob/skills/repo2prod/SKILL.md contains the new health step
   (reload Bob if the skill text is stale).
3. Only if the team agrees to spend the Bobcoin: run /repo2prod on a
   fresh copy and confirm Bob creates /health/ + writes
   .repo2prod/health-endpoint.json, without fixing unrelated code.
4. Record whether Bob ALSO fixed the SQLite volume bug while doing this
   (important for the demo story — see member-c-reference §2A).

==================================================
FINAL REPORT
==================================================

1. Files modified
2. Final text of the new /repo2prod step
3. Final text of the repair-skill guard paragraph
4. How template/inline sync was verified
5. health-endpoint.json contract
6. pnpm compile result
7. Manual test results (if run)
8. Risks (e.g. Bob touching more app code than intended, skill reload)

Do not implement anything outside this task.
```

**Verifier side of C6** (already built into the C3 prompt, §8.3):
| Situation | `health` result |
|---|---|
| Valid `.repo2prod/health-endpoint.json`, GET returns 200 | **PASS**, observed. Deployment proven. |
| Declared path returns 503 / 5xx / 404 / 400 (e.g. ALLOWED_HOSTS) / refused / timeout | **FAIL**, observed, which goes into the FailureBundle so `/repo2prod-repair` can fix it |
| No declaration file, or it's invalid | fall back to a smoke probe of `/`: status < 500 gives **WARN**, otherwise FAIL |
| Earlier phase failed | NOT_RUN |

**Effect on sandbox-sarmad (§2A):** Bob already ran `/repo2prod` there with the old skill, so there's no `/health/` yet. For now the sandbox keeps the expectation "health WARN after repair". Once C6 lands and `/repo2prod` runs again on a fresh copy, the expected end state becomes **health PASS** (observed 200 with a DB check).

### 8.6 — Support prompts

**S1 — Unit tests (only after a team OK to add Vitest as a devDependency)**
```text
Read @AGENTS.md completely before making any changes.

I am Member C of Repo2Prod. Task: add Vitest and unit tests for Member C
modules only, using a mocked ProcessRunner (no real Docker, no Bob calls).

Add: vitest devDependency via pnpm, "test": "vitest run" script,
tests co-located as src/**/*.test.ts, and exclude *.test.ts from tsc output
(adjust tsconfig "exclude" only for test files).

Cover (AGENTS.md §17): redaction patterns, boundText truncation,
createFailureBundle shape vs schemas/diagnostics.schema.json,
compose ps JSON parsing (both shapes), project-name derivation,
processRunner timeout/cancel (using real `node -e` short scripts),
verifier: first failure -> remaining NOT_RUN, no tests -> NOT_RUN,
"Ran 0 tests" -> NOT_RUN, health 404 -> FAIL, observed flags.

Do not modify production behaviour. Report: files, test count, pnpm test output.
```

**S2 — Debug a failing step (reuse whenever something breaks)**
```text
Read @AGENTS.md. I am Member C. Something in my execution layer is failing.

Observed: <paste the exact error/command/output — redact secrets first>
Expected: <what should happen>
Files involved: <paths>

Find the root cause from this evidence only, inspect only the relevant files,
make the smallest fix, run pnpm compile, and report root cause, change, and
how you verified it. Do not refactor unrelated code.
```

**S3 — Demo hardening (before recording)**
```text
Read @AGENTS.md. I am Member C. Task: demo hardening for the golden path.
Do NOT add features. Run the full path 3 times from scripts/reset-demo-fixture.sh
and report per run: timings per phase, first-build vs cached build time,
any flakiness (port 8000 busy, db readiness race, Docker Desktop cold start),
and propose minimal fixes (timeouts, pre-pull images script
scripts/prepull-demo-images.sh using only docker pull of the fixture's images).
Never add global prune commands.
```

---

## 9. Bob session evidence and Bobcoin budget

- **Budget:** 40 Bobcoins per builder. Repo2Prod itself allows at most 1 `/repo2prod` + 2 `/repo2prod-repair` + 1 `/repo2prod-ci` per demo run.
- **Naming (PDF §13):** `bob_sessions/necromancers_taskNN_short_description_summary.png`. Numbers are **global** across the team. Existing files include task01–task11, and Sarmad's later `task06_bob_repo2prod_skill_update` (so numbering has already collided), so **agree on the next number with the team** before saving.
- Take the screenshot **immediately** after each task, and make sure it shows no secrets.

| Task | Suggested filename (replace NN) |
|---|---|
| C1 | `necromancers_taskNN_golden_fixture_and_reset.png` |
| C1 dry run | `necromancers_taskNN_fixture_bob_productionize_dryrun.png` |
| C2 | `necromancers_taskNN_process_docker_compose.png` |
| C3 | `necromancers_taskNN_verification_engine.png` |
| C4 | `necromancers_taskNN_redaction_diagnostics.png` |
| C5 | `necromancers_taskNN_execution_integration.png` |

Cost savers: one focused session per task; paste bounded logs only; use S2 for small bugs instead of re-running a big prompt; use mocks in tests.

---

## 10. Manual verification checklists

**sandbox-sarmad acceptance (current top priority, done before the PR)**
- [ ] Baseline copy saved (`~/Desktop/sandbox-sarmad-failing-baseline`); all work happens in a copy
- [ ] Failure reproduced with scoped `-p` commands, and **not** fixed by hand
- [ ] `compose up -d` exit 0 is **not** reported as app PASS; `ps -a` shows `exited (1)`
- [ ] Checks: docker/compose/build PASS, database NOT_RUN, app FAIL @ STARTING, health/tests NOT_RUN
- [ ] `latest.json` contains `unable to open database file`, is < ~12 KiB, and contains no `.env` values
- [ ] No `.env` read and no `docker compose config` anywhere in code or scripts
- [ ] Run state ends in `DIAGNOSTIC_READY` (after C5), ready for `/repo2prod-repair`
- [ ] Only then send the PR to Sarmad for review against this exact failure

**C1**
- [ ] `scripts/reset-demo-fixture.sh` creates `~/repo2prod-demo` with a marker file and a clean git baseline
- [ ] It refuses to delete a directory without the marker
- [ ] `FIXTURE_NOTES.md` is **not** copied into the demo dir
- [ ] `up --build` → app fails with `localhost ... 5432 ... refused`
- [ ] Known fix → `/health/` 200, and tests pass with the real DB
- [ ] Reset again → defect is back
- [ ] Repo2Prod analysis on the demo dir detects django, postgres `db`, and `SECRET_KEY` / `POSTGRES_*` names
- [ ] One real `/repo2prod` dry run: does the defect survive? (record in §12)

**C2**
- [ ] `pnpm compile` green; `grep -rn prune src/` is empty
- [ ] Every compose call has `-p`
- [ ] Timeout, cancel, and ENOENT all give clear results
- [ ] Output is bounded (truncated flag set on huge output)

**C3**
- [ ] Broken fixture → real FAIL at the correct phase; later checks are NOT_RUN
- [ ] Fixed fixture → all PASS with `observed: true`
- [ ] No tests / `Ran 0 tests` → NOT_RUN

**C4**
- [ ] `latest.json` < ~12 KiB, contains the root-cause line
- [ ] No DB password or SECRET_KEY value anywhere under `.repo2prod/`
- [ ] Attempt files kept (`attempt-1.json`, `attempt-2.json`)

**C5**
- [ ] All 9 failure-mode matrix rows tested
- [ ] VSIX installs in Bob, and the full golden path works from a reset

---

## 11. Golden-path demo from Member C's side

```text
reset-demo-fixture.sh → open ~/repo2prod-demo in Bob
→ Start Productionization (B's analysis, plan view) → Approve (A)
→ /repo2prod in Bob Agent (visible)
→ Verify Runtime  ── C: docker PASS, compose PASS, build PASS, database PASS,
                       app FAIL (migrate → localhost:5432 refused)  ← REAL failure
                       → latest.json (redacted, bounded) → DIAGNOSTIC_READY
→ Prepare Repair (A, attempt 1/2) → /repo2prod-repair (Bob adds POSTGRES_HOST: db)
→ Verify Runtime  ── C: all PASS, health 200 {"database":"ok"}, tests PASS → VERIFIED
→ Prepare CI (A) → /repo2prod-ci → final report (A/B, from C's observed checks)
```
Demo reliability: pre-pull `python:3.12-slim` and `postgres:16-alpine`; warm the build cache once before recording; make sure port 8000 is free; start Docker Desktop early.

---

## 12. Decision log

Append new entries here as decisions are made (date — decision — why).

- 2026-09-26 — Stack is **Django + PostgreSQL** — Member B's analyzer is Django-only; the spec forbids reopening it.
- 2026-09-26 — Defect = settings default `POSTGRES_HOST=localhost`, not set in compose — most realistic "works on my laptop" version of the preferred defect, and it survives "preserve working config". *To confirm with a real `/repo2prod` dry run.*
- 2026-09-26 — Health endpoint `/health/` does `SELECT 1` — "container running" must not count as healthy.
- 2026-09-26 — Compose project `repo2prod-<sanitized basename>` — scoped cleanup, never global prune.
- 2026-09-26 — Demo workspace lives outside the extension repo (`~/repo2prod-demo`), created by the reset script.
- *(pending)* FailureBundle optional fields (gap 1) — awaiting team decision.
- 2026-09-26 — `resolved-config.json` is optional in `/repo2prod` (main `821338d`). Gap 7 closed.
- 2026-09-26 — First real end-to-end failure: `sandbox-sarmad`, `sqlite3.OperationalError: unable to open database file` during `migrate`. Root cause is Bob's compose mounting named volume `db_data` onto the file path `/app/db.sqlite3`. **Not fixed manually**; it's the C2–C4 acceptance target. C work is reprioritized to C2 → C3 → C4 → C5, then C1.
- 2026-09-26 — Verifier is manifest-driven (no hardcoded Postgres). No health endpoint gives health WARN via smoke probe, and no tests gives NOT_RUN.
- *(pending)* Final demo target: SQLite sandbox failure vs Postgres `localhost` fixture (C1).
- 2026-09-26 — **New task C6:** the `/repo2prod` skill makes Bob find or create a real health endpoint (`GET /health/`, checks the DB, never always-200, no secrets) and declare it in `.repo2prod/health-endpoint.json`. The verifier probes the declared path, and PASS only comes from an observed 200. The repair skill must not weaken the endpoint. *Pending Member A's approval (skill owner).*
- *(pending)* Next global Bob task number for Member C.

---

## Appendix A — Original SAMPLE PROMPT (Member A, Task 5)

This is reproduced from the Team Execution Plan v0.4 as the style reference. **It is Member A's task. Don't run it.**

```text
Read @AGENTS.md completely before making any changes.

I am Member A of Repo2Prod.

This is Task 5: implement the Repo2Prod workflow state machine and the minimal
orchestration layer.

IMPORTANT CONTEXT

Task 4 is complete.

We now have a production Bob Skill integration layer that installs:

.bob/skills/repo2prod/SKILL.md
.bob/skills/repo2prod-repair/SKILL.md
.bob/skills/repo2prod-ci/SKILL.md

The Bob Skills are the AI handoff mechanism.

Do NOT reimplement Bob skill installation in this task.

The purpose of this task is to build the workflow spine that coordinates
future Member B analysis functionality and Member C execution/verification
functionality.

==================================================
OWNERSHIP / SCOPE
==================================================

I own:
- VS Code extension orchestration
- workflow state machine
- Repo2Prod command handlers
- transitions between deterministic analysis, Bob handoff, verification,
  repair, and completion
- repair-attempt budget enforcement
- run-state persistence
- minimal user-facing status/error messages

Do NOT implement functionality owned by other members:

Member B owns:
- repository/framework analysis
- evidence extraction
- runtime manifest construction
- env classification
- runtime graph/UI

Member C owns:
- Docker/Compose execution
- health checks
- tests
- bounded runtime diagnostics
- process execution

For this task, use existing stubs/interfaces for those modules.
Do NOT implement their internals.

==================================================
GOAL
==================================================

Implement a small, explicit, deterministic workflow state machine.

The orchestrator must make Repo2Prod's current state obvious and prevent
invalid transitions.

The workflow should support:

IDLE → PREFLIGHT → ANALYZING_LOCAL → AWAITING_RUNTIME_PLAN_APPROVAL
→ BOB_PRODUCTIONIZE_SKILL_READY → WAITING_FOR_BOB_PRODUCTIONIZATION
→ BUILDING → STARTING → VERIFYING_HEALTH → RUNNING_TESTS → VERIFIED
→ BOB_CI_SKILL_READY → FINAL_REPORT → COMPLETE

Failure/repair flow:

BUILDING / STARTING / VERIFYING_HEALTH / RUNNING_TESTS
      ↓ failure
DIAGNOSTIC_READY → BOB_REPAIR_SKILL_READY → WAITING_FOR_BOB_REPAIR
      ↓
retry relevant execution phase

Terminal failure: FAILED

==================================================
STATE DEFINITIONS
==================================================

Use the existing Repo2ProdState definition in src/core/state.ts.
If the scaffold already contains equivalent state names, preserve them
unless a change is necessary.

The enum/type should contain at minimum:
IDLE, PREFLIGHT, ANALYZING_LOCAL, AWAITING_RUNTIME_PLAN_APPROVAL,
BOB_PRODUCTIONIZE_SKILL_READY, WAITING_FOR_BOB_PRODUCTIONIZATION, BUILDING,
STARTING, DIAGNOSTIC_READY, BOB_REPAIR_SKILL_READY, WAITING_FOR_BOB_REPAIR,
VERIFYING_HEALTH, RUNNING_TESTS, VERIFIED, BOB_CI_SKILL_READY, FINAL_REPORT,
COMPLETE, FAILED

If legacy names still say COMMAND instead of SKILL, update only those
state names/references to reflect the current Bob Skills architecture.
Do not leave duplicate COMMAND/SKILL variants.

==================================================
REPAIR BUDGET
==================================================

The hackathon has a strict Bobcoin budget.
The product hard limit is: MAX_REPAIR_ATTEMPTS = 2
This is not a generic arbitrary retry count.
It is a product-level budget/safety constraint.

Rules:
- repairAttemptsUsed starts at 0
- preparing/running a Bob repair consumes one attempt
- attempt 1 may proceed normally
- attempt 2 requires explicit user confirmation from the command/UI layer
- after 2 attempts, transition to FAILED
- never silently reset the counter during the same run
- reset only when starting a completely new Repo2Prod run

Keep the constant in a clear shared location.

==================================================
RUN STATE MODEL
==================================================

Use or extend the existing RunState type. It should minimally track:
- currentState
- repairAttemptsUsed
- workspaceRoot
- lastFailurePhase if applicable
- startedAt if already part of scaffold
- updatedAt if useful

Do not over-engineer timestamps. Do not persist secrets.

==================================================
PERSISTENCE
==================================================

Persist lightweight state to: .repo2prod/run-state.json

Requirements:
- UTF-8 JSON
- create .repo2prod/ if needed
- no secrets
- no logs
- only workflow metadata
- failure to persist state should produce a clear warning/error

Implement small helpers such as:
loadRunState(workspaceRoot)
saveRunState(workspaceRoot, state)
resetRunState(workspaceRoot)

Exact naming can follow project conventions. Do not add a database.

==================================================
TRANSITION VALIDATION
==================================================

Define allowed transitions explicitly.
Do NOT allow arbitrary setState(anything) without validation.
A small map such as Record<Repo2ProdState, Repo2ProdState[]> is acceptable.

Examples:
IDLE → PREFLIGHT
PREFLIGHT → ANALYZING_LOCAL | FAILED
ANALYZING_LOCAL → AWAITING_RUNTIME_PLAN_APPROVAL | FAILED
AWAITING_RUNTIME_PLAN_APPROVAL → BOB_PRODUCTIONIZE_SKILL_READY | FAILED
BOB_PRODUCTIONIZE_SKILL_READY → WAITING_FOR_BOB_PRODUCTIONIZATION
WAITING_FOR_BOB_PRODUCTIONIZATION → BUILDING | FAILED
BUILDING → STARTING | DIAGNOSTIC_READY
STARTING → VERIFYING_HEALTH | DIAGNOSTIC_READY
VERIFYING_HEALTH → RUNNING_TESTS | DIAGNOSTIC_READY
RUNNING_TESTS → VERIFIED | DIAGNOSTIC_READY
DIAGNOSTIC_READY → BOB_REPAIR_SKILL_READY | FAILED
BOB_REPAIR_SKILL_READY → WAITING_FOR_BOB_REPAIR
WAITING_FOR_BOB_REPAIR → BUILDING | FAILED
VERIFIED → BOB_CI_SKILL_READY | FINAL_REPORT
BOB_CI_SKILL_READY → FINAL_REPORT
FINAL_REPORT → COMPLETE

Any invalid transition should fail explicitly with a useful error.

==================================================
ORCHESTRATOR
==================================================

Implement the minimal orchestration layer in src/core/orchestrator.ts.
A class such as Repo2ProdOrchestrator is appropriate.
It should NOT implement Docker or analysis.
It should coordinate dependencies/interfaces.

A reasonable public API may include:
start(workspaceRoot), approveRuntimePlan(), markBobProductionizationComplete(),
beginVerification(), recordFailure(phase), prepareRepair(),
markBobRepairComplete(), markVerified(), prepareCI(), complete(), reset()

Use existing project naming where possible.
Do not implement methods merely because they sound nice.
Keep the public API small.

==================================================
DEPENDENCY BOUNDARIES
==================================================

The orchestrator should depend on interfaces/callbacks rather than
implement Member B/C work.

For example, it may eventually call something like AnalyzerService,
VerificationService, BobSkillManager — but this task should only wire
what already exists.

If Member B/C modules are still scaffold stubs:
- preserve those stubs
- do not fill them in
- do not fake results inside their modules

For temporary orchestration testing, use explicit placeholder/mock values
inside the command layer only if absolutely necessary.
Prefer not to fabricate application results.

==================================================
COMMAND HANDLERS
==================================================

Wire the existing command files minimally:
src/commands/startProductionization.ts
src/commands/verifyRuntime.ts
src/commands/prepareRepair.ts
src/commands/prepareCI.ts
src/commands/resetRun.ts

startProductionization — For now:
- require an open workspace
- initialize/reset run state
- transition: IDLE → PREFLIGHT → ANALYZING_LOCAL
If the real Member B analyzer is still a stub, stop cleanly at
ANALYZING_LOCAL, or transition to AWAITING_RUNTIME_PLAN_APPROVAL only if
existing scaffold data makes that safe.
Do NOT fake a successful analysis.
Show a user-facing status message explaining the current development state.

verifyRuntime — This should only be callable from a valid state such as
WAITING_FOR_BOB_PRODUCTIONIZATION or WAITING_FOR_BOB_REPAIR.
For now:
- transition into BUILDING
- call existing verification abstraction only if it is already usable
- otherwise stop with a clear "verification implementation pending"
  development message
Do not fabricate PASS results.

prepareRepair — Requirements:
- valid only after DIAGNOSTIC_READY
- enforce MAX_REPAIR_ATTEMPTS
- if attempt 2 is about to be used, request explicit confirmation
  through VS Code UI
- increment repairAttemptsUsed only when the repair is actually prepared
- ensure Repo2Prod repair skill is installed/available using the existing
  BobSkillManager if appropriate
- transition: DIAGNOSTIC_READY → BOB_REPAIR_SKILL_READY → WAITING_FOR_BOB_REPAIR
Show: "Run /repo2prod-repair in Bob Agent mode."
Do NOT invoke Bob programmatically.

prepareCI — Valid only after VERIFIED. Ensure the CI skill exists.
Transition: VERIFIED → BOB_CI_SKILL_READY
Show: "Run /repo2prod-ci in Bob Agent mode."
Do not create CI itself.

resetRun — Reset:
- workflow state to IDLE
- repairAttemptsUsed to 0
- lightweight run-state metadata
Do NOT:
- delete user's Docker files
- delete user's application changes
- delete all .bob skills
- delete Git changes
- run Docker prune

==================================================
BOB PRODUCTIONIZATION HANDOFF
==================================================

The orchestrator needs a clean handoff point. After runtime-plan approval:
1. ensure Repo2Prod skills are installed
2. transition to: BOB_PRODUCTIONIZE_SKILL_READY
3. show: "Run /repo2prod in Bob Agent mode."
4. transition to: WAITING_FOR_BOB_PRODUCTIONIZATION

Do not programmatically invoke Bob.

We need a later command/action such as "I've Finished in Bob" or reuse
"Repo2Prod: Verify Runtime" to indicate the developer is returning control
to Repo2Prod. For this task, prefer the simplest design.

==================================================
ERROR HANDLING
==================================================

Errors must be clear. Examples:
Good: "Repo2Prod cannot verify runtime while state is ANALYZING_LOCAL."
Good: "Repair limit reached (2/2). Start a new Repo2Prod run to continue."
Good: "Repo2Prod run state is invalid or corrupted."
Bad:  "Something went wrong."
Do not silently swallow invalid transitions.

==================================================
NO SCOPE EXPANSION
==================================================

Do NOT add: React, Docker logic, process execution, framework analyzers,
runtime graph logic, MCP, Bob Shell, cloud deployment, security scanners,
additional frameworks, additional retry mechanisms, autonomous Bob invocation.
No new dependencies unless absolutely necessary.

==================================================
COMPILATION / VALIDATION
==================================================

After implementation:
1. run: pnpm compile
2. There is no test script unless the repository has changed.
   Do not invent `pnpm test`.
3. Manually inspect transition definitions.
4. Confirm legacy COMMAND state names are gone if they were replaced by
   SKILL state names.
5. Confirm MAX_REPAIR_ATTEMPTS is exactly 2.
6. Confirm reset does not remove application files.
7. Confirm no Member B/C internals were implemented.

==================================================
MANUAL DEVELOPMENT TEST
==================================================

After packaging/installing the VSIX in Bob IDE, I should be able to use
Command Palette to exercise the workflow skeleton.

At minimum, "Repo2Prod: Start Productionization" should:
- create .repo2prod/run-state.json
- initialize the state correctly
- show a useful status

"Repo2Prod: Reset Run" should return the state to IDLE.

If the current implementation exposes a safe way to test Bob handoff,
verify the appropriate state transitions and user-facing instruction.

Do not require a real Docker application for Task 5.

==================================================
FINAL REPORT
==================================================

At the end report:
1. Files created
2. Files modified
3. Any files renamed
4. Final Repo2ProdState values
5. Allowed transition map
6. Repo2ProdOrchestrator public API
7. Where MAX_REPAIR_ATTEMPTS lives
8. How run-state persistence works
9. Command handlers wired
10. What remains intentionally stubbed for Members B and C
11. pnpm compile result
12. Exact manual verification steps in Bob IDE
13. Any assumptions or integration risks discovered

Do not implement anything outside this task.
```
