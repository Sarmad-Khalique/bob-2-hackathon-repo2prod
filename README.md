# Repo2Prod

> **Bob understands your code. Repo2Prod proves it runs.**

Repo2Prod is a VS Code-compatible extension built for **IBM Bob IDE** that turns an unfamiliar or broken repository into a **verified, reproducible local runtime**.

IBM Bob provides the code reasoning and targeted repair. Repo2Prod provides deterministic repository analysis, runtime orchestration, Docker execution, observed verification, bounded diagnostics, repair retries, readiness reporting, and CI generation.

---

## Why Repo2Prod?

Getting an unfamiliar repository to run is rarely just a matter of generating a `Dockerfile`.

A repository may have:

- incomplete setup documentation,
- missing runtime configuration,
- broken container assumptions,
- environment requirements that are unclear,
- health checks that do not reflect real application readiness,
- CI that has drifted away from the actual local runtime.

Repo2Prod closes that gap by combining **IBM Bob's code intelligence** with deterministic execution and verification.

It does not stop when configuration files are generated.

It executes the runtime, observes what actually happens, captures bounded and redacted evidence when something fails, gives that evidence back to Bob for a targeted repair, and verifies the result again.

---

## End-to-End Workflow

```text
Repository
   ↓
Deterministic repository analysis
   ↓
Runtime plan + user approval
   ↓
/repo2prod in IBM Bob Agent mode
   ↓
Docker / Compose build and startup
   ↓
Observed health and test verification
   ↓
Failure?
   ├─ No  → VERIFIED
   └─ Yes → bounded diagnostics
             ↓
          /repo2prod-repair
             ↓
          deterministic retry
             ↓
          VERIFIED
   ↓
Readiness report
   ↓
/repo2prod-ci
   ↓
GitHub Actions workflow
   ↓
Repo2Prod: Complete Run
   ↓
COMPLETE
```

---

## What Makes Repo2Prod Different?

Many AI coding workflows stop after suggesting or generating configuration.

Repo2Prod adds the missing execution-and-proof loop:

- analyzes the repository deterministically before asking Bob to change code,
- keeps IBM Bob visible as the reasoning and coding agent,
- executes the generated runtime for real,
- distinguishes observed results from inferred configuration,
- captures real build/runtime/test failures,
- redacts and bounds diagnostics before repair,
- limits repair attempts to prevent open-ended retry loops,
- verifies health before declaring the runtime ready,
- preserves `NOT_RUN` honestly when a check was not applicable or unavailable,
- generates CI only after local verification succeeds.

> **Repo2Prod orchestrates. Bob reasons and codes. Repo2Prod verifies.**

---

## IBM Bob + Repo2Prod

### IBM Bob

IBM Bob is responsible for semantic/code intelligence:

- understanding the repository,
- creating or minimally repairing runtime configuration,
- adding or declaring a health endpoint,
- reasoning over observed failure evidence,
- making targeted runtime repairs,
- generating GitHub Actions CI after verification.

Repo2Prod installs project-local Bob Skills that the developer invokes intentionally in **Bob Agent mode**:

```text
/repo2prod
/repo2prod-repair
/repo2prod-ci
```

Repo2Prod does **not** invoke Bob programmatically.

### Repo2Prod

Repo2Prod is responsible for deterministic orchestration and proof:

- repository analysis,
- runtime-plan generation,
- workflow state management,
- Docker / Compose execution,
- build/start/health/test verification,
- diagnostic capture and redaction,
- bounded repair attempts,
- readiness reporting,
- CI handoff,
- final completion reporting.

---

## Core Features

### Deterministic repository analysis

Repo2Prod inspects the workspace without using an LLM for basic detection and produces:

- repository evidence,
- runtime manifest,
- detected framework/package manager,
- services and dependencies,
- environment variable classifications,
- runtime-plan data for user approval.

### Environment classification

Repo2Prod classifies environment requirements without storing secret values:

- `safe-inferred`
- `generated-local-secret`
- `generated-local-infrastructure`
- `user-secret-required`
- `optional-external`

### Real runtime verification

Repo2Prod verifies the runtime through observed execution.

Current verification checks include:

```text
docker
compose
build
database
app
health
tests
```

A result is only marked `observed: true` when Repo2Prod actually executed or probed that check.

### Evidence-backed repair loop

When verification fails, Repo2Prod creates bounded diagnostics from real execution output and prepares `/repo2prod-repair`.

Bob is instructed to:

- use the diagnostic evidence as ground truth,
- inspect only relevant repository files,
- identify the most likely root cause,
- make the smallest targeted repair,
- avoid unrelated refactors,
- never weaken a valid health check merely to make verification pass.

Repo2Prod allows a maximum of **two Bob repair attempts per run**.

The second attempt requires explicit user confirmation.

### Health verification

Repo2Prod uses a declared health endpoint when available.

Example:

```json
{
  "path": "/health/",
  "method": "GET",
  "expectStatus": 200,
  "checks": ["database"],
  "source": "created-by-bob",
  "files": ["config/urls.py"]
}
```

A generated health endpoint must represent real application readiness. It must not be hard-coded to always return HTTP 200.

### Readiness report

After successful verification, Repo2Prod writes:

```text
.repo2prod/readiness-report.json
```

The report is derived deterministically from actual verification results.

A `NOT_RUN` result is not silently converted into `PASS`.

For example:

- an embedded SQLite database may legitimately produce `database: NOT_RUN`,
- a repository with no tests may legitimately produce `tests: NOT_RUN`.

The core runtime can still be ready when required observed checks have passed.

### Verified CI generation

CI is generated only after the local readiness report is `PASS`.

The `/repo2prod-ci` Skill creates:

```text
.github/workflows/ci.yml
```

The workflow reproduces the verified runtime path as closely as possible.

Important rules:

- GitHub Actions only,
- no cloud deployment,
- no invented test command,
- tests are added only when tests were actually observed and passed,
- `generated-local-secret` values are generated ephemerally in CI,
- `user-secret-required` values remain real GitHub Actions secrets,
- no `.env` file is copied into CI,
- no secret values are exposed.

---

## Example Final Output

A successful Repo2Prod run can finish like this:

```text
══════════════════════════════════════════════
  Repo2Prod — RUN COMPLETE
══════════════════════════════════════════════
  Local runtime:   VERIFIED
  Overall status:  PASS
  Repair attempts: 0/2

  Check results:
    docker       PASS
    compose      PASS
    build        PASS
    database     NOT_RUN (not observed)
    app          PASS
    health       PASS
    tests        NOT_RUN

  CI artifact:     .github/workflows/ci.yml
  CI execution:    NOT_RUN by Repo2Prod
══════════════════════════════════════════════
```

The distinction between **CI generated** and **CI executed** is intentional.

Repo2Prod does not claim a GitHub Actions workflow passed unless that workflow was actually executed by GitHub.

---

## Installation

### Prerequisites

For extension development:

- Node.js 20 or newer
- pnpm 9 or newer
- IBM Bob IDE or compatible VS Code environment

For end-to-end Repo2Prod usage:

- IBM Bob IDE
- Docker Desktop or Docker Engine
- Docker Compose
- Git

### Install dependencies

```bash
pnpm install
```

### Compile

```bash
pnpm run compile
```

### Package the extension

```bash
pnpm run package
```

This produces a `.vsix` package using `@vscode/vsce`.

Install the generated VSIX in IBM Bob IDE using the normal **Install from VSIX** flow.

---

## Usage

### 1. Start productionization

Open the target repository in IBM Bob IDE and run:

```text
Repo2Prod: Start Productionization
```

Repo2Prod performs deterministic analysis and presents a runtime plan.

Review the plan and approve it.

### 2. Run Bob productionization

Repo2Prod prepares the Bob Skill and instructs you to run:

```text
/repo2prod
```

Run it in **IBM Bob Agent mode**.

Bob creates or minimally repairs the local Docker runtime and ensures a usable health endpoint exists.

### 3. Verify the runtime

Run:

```text
Repo2Prod: Verify Runtime
```

Repo2Prod then performs real Docker/Compose execution and verification.

If verification succeeds, the run advances to `VERIFIED`.

### 4. Repair a real failure

If verification fails, run:

```text
Repo2Prod: Prepare Repair
```

Then run in Bob Agent mode:

```text
/repo2prod-repair
```

Bob reads the bounded Repo2Prod diagnostics and performs a targeted repair.

Run verification again:

```text
Repo2Prod: Verify Runtime
```

### 5. Prepare CI

After the runtime reaches `VERIFIED`, run:

```text
Repo2Prod: Prepare CI
```

Then run in Bob Agent mode:

```text
/repo2prod-ci
```

Bob creates:

```text
.github/workflows/ci.yml
```

### 6. Complete the run

Finally run:

```text
Repo2Prod: Complete Run
```

Repo2Prod validates that the CI artifact exists and transitions the workflow to `COMPLETE`.

---

## Workflow States

Repo2Prod uses an explicit state machine:

```text
IDLE
PREFLIGHT
ANALYZING_LOCAL
AWAITING_RUNTIME_PLAN_APPROVAL
BOB_PRODUCTIONIZE_SKILL_READY
WAITING_FOR_BOB_PRODUCTIONIZATION
BUILDING
STARTING
VERIFYING_HEALTH
RUNNING_TESTS
DIAGNOSTIC_READY
BOB_REPAIR_SKILL_READY
WAITING_FOR_BOB_REPAIR
VERIFIED
BOB_CI_SKILL_READY
FINAL_REPORT
COMPLETE
FAILED
```

Invalid transitions are rejected.

Run state is persisted under:

```text
.repo2prod/run-state.json
```

This allows important workflow stages to survive extension/Bob window reloads.

---

## Local State and Repository Hygiene

Repo2Prod keeps its runtime state local to the target repository.

Repo2Prod adds Git-ignore rules for:

```text
/.repo2prod/
/.bob/skills/repo2prod/
/.bob/skills/repo2prod-repair/
/.bob/skills/repo2prod-ci/
```

Repo2Prod intentionally does **not** ignore the entire `.bob/` directory because a project may already contain its own intentionally committed Bob configuration.

The productionization Skill also ensures `.dockerignore` excludes:

```text
.repo2prod/
.bob/
.git/
```

so Repo2Prod/Bob metadata does not enter the Docker build context.

---

## Generated Artifacts

Depending on the repository and run, Repo2Prod may create or update:

```text
Dockerfile
.dockerignore
compose.yaml
.env.example
.github/workflows/ci.yml
```

Repo2Prod local state is stored under:

```text
.repo2prod/
```

Bob Skills installed into the target workspace live under:

```text
.bob/skills/repo2prod/
.bob/skills/repo2prod-repair/
.bob/skills/repo2prod-ci/
```

---

## Project Structure

```text
repo2prod/
├── src/
│   ├── commands/
│   ├── core/
│   ├── execution/
│   └── webview/
├── templates/
│   └── bob-skills/
├── schemas/
├── scripts/
├── test-fixtures/
├── bob_sessions/
├── package.json
├── tsconfig.json
└── README.md
```

---

## Development

### Compile

```bash
pnpm run compile
```

### Watch

```bash
pnpm run watch
```

### Package VSIX

```bash
pnpm run package
```

### Verify Bob Skill synchronization

```bash
node scripts/check-skill-sync.cjs
```

The Bob Skill templates and inline extension copies must remain synchronized.

---

## Hackathon Evidence

Repo2Prod was built for the **IBM Bob 2.0 Hackathon** by team **necromancers**.

The repository contains Bob task-session evidence under:

```text
bob_sessions/
```

These screenshots document meaningful IBM Bob usage during development.

The product is deliberately designed so Bob remains visible in the judged workflow rather than being hidden behind an opaque automated API call.

---

## Current Scope

Repo2Prod is a hackathon prototype focused on a reliable golden path.

Current scope:

- VS Code-compatible extension for IBM Bob IDE
- local Docker / Compose productionization
- deterministic repository analysis
- observed runtime verification
- bounded Bob repair loop
- health verification
- test verification when tests exist
- readiness reporting
- GitHub Actions CI generation
- maximum two Bob repair attempts per run

Not currently in scope:

- cloud deployment
- multi-provider CI generation
- unlimited autonomous repair loops
- vulnerability scanning
- dependency upgrade automation
- production secret provisioning
- generalized cross-developer handoff bundles

---

## Design Principle

The project follows one core principle:

> **Bob is the coding intelligence. Repo2Prod is the execution-and-verification loop that takes Bob's changes all the way to a proven local runtime.**

If a step is not observed, Repo2Prod does not pretend it passed.

---

## Testing Sandbox

The repository contains a zip file named `testing-sandbox.zip`. It is the same sandbox repo we used for the demo.
Feel free to use that for testing the repo2prod functionality.

---

## Repository

GitHub:

https://github.com/Sarmad-Khalique/bob-2-hackathon-repo2prod

---

## License

Repo2Prod is released under the **MIT License**.

See [LICENSE](LICENSE) for details.
