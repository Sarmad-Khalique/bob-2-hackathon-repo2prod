# AGENTS.md — Repo2Prod

## Project overview

Repo2Prod is a VS Code-compatible extension designed primarily for **IBM Bob IDE**.

Its purpose is to take an unfamiliar or poorly documented application repository and help turn it into a **verified, reproducible local runtime**.

The core product idea is:

> **Bob understands and modifies the codebase. Repo2Prod orchestrates execution, observes real failures, and proves the result works.**

Repo2Prod is **not** a generic AI coding assistant, Dockerfile generator, CI/CD platform, cloud deployment platform, or replacement for IBM Bob.

---

# 1. Hackathon constraints

This project is being built for the IBM Bob 2.0 Hackathon.

Optimize every implementation decision for a reliable 48-hour hackathon submission.

The judging criteria are:

- Application of Technology
- Business Value
- Originality
- Presentation

Important event constraints:

- IBM Bob must remain visibly involved in the judged workflow.
- Bob IDE Agent mode should be shown during the demo.
- Every team member must use Bob IDE meaningfully during development.
- Each team member must capture the required Bob task/session consumption evidence under `bob_sessions/`.
- Bob usage is constrained by a 40-Bobcoin-per-builder budget.
- Repo2Prod must therefore avoid wasteful or repeated Bob calls.
- The repair loop must be bounded to a maximum of **2 Bob repair attempts per run**.
- The demo should prioritize one stable golden path over breadth.
- Cloud deployment is not required for the MVP.
- Vulnerability scanning and dependency upgrades are deferred.
- A minimal GitHub Actions CI artifact may be generated only after the local runtime has already been verified.

---

# 2. Product responsibilities

## IBM Bob is responsible for

Bob is the semantic/code intelligence layer.

Use Bob for:

- understanding repository structure and intent;
- interpreting runtime relationships;
- reasoning about application entrypoints;
- creating or repairing Docker/runtime configuration;
- diagnosing observed build/runtime failures;
- making focused repository changes;
- generating a minimal CI workflow after local verification;
- using Bob-native subagents when Bob decides they are useful.

Do not claim these as Repo2Prod inventions.

## Repo2Prod is responsible for

Repo2Prod is the orchestration and verification layer.

Repo2Prod owns:

- workspace preflight;
- deterministic evidence extraction;
- runtime-plan data structures;
- environment-variable classification;
- project-specific Bob slash-command generation;
- local Docker/Compose execution;
- process control;
- bounded log capture;
- secret redaction;
- failure-bundle generation;
- max-two-repair enforcement;
- health/smoke verification;
- test execution;
- evidence-backed readiness reporting;
- workflow state management;
- user approval boundaries.

---

# 3. Core product flow

The MVP workflow is:

```text
Open target repository in IBM Bob IDE
        ↓
Repo2Prod preflight
        ↓
Deterministic workspace analysis
        ↓
Runtime/dependency plan
        ↓
User reviews configuration
        ↓
Repo2Prod generates .bob/commands/repo2prod.md
        ↓
User switches to Bob Agent mode
        ↓
/repo2prod
        ↓
Bob creates/repairs runtime files
        ↓
Repo2Prod executes Docker/Compose
        ↓
Observed success or failure
        ↓
If failure:
Repo2Prod writes bounded diagnostics
        ↓
Repo2Prod updates .bob/commands/repo2prod-repair.md
        ↓
User runs /repo2prod-repair in Bob Agent mode
        ↓
Bob makes the smallest targeted fix
        ↓
Repo2Prod retries
        ↓
Health checks + tests pass
        ↓
Repo2Prod prepares .bob/commands/repo2prod-ci.md
        ↓
/repo2prod-ci
        ↓
Bob creates minimal GitHub Actions workflow
        ↓
Repo2Prod shows final readiness report
```

Do not redesign this flow unless a verified platform limitation blocks it.

---

# 4. Bob integration rules

Repo2Prod uses **Bob-native project slash commands** under:

```text
.bob/commands/
```

The MVP commands are:

```text
/repo2prod
/repo2prod-repair
/repo2prod-ci
```

The extension generates or updates the corresponding Markdown files:

```text
.bob/commands/repo2prod.md
.bob/commands/repo2prod-repair.md
.bob/commands/repo2prod-ci.md
```

Important:

- Do not depend on undocumented Bob chat APIs.
- Do not attempt to simulate typing into Bob.
- Do not hide Bob behind a black-box extension UI.
- The user should visibly run slash commands in Bob Agent mode.
- Repo2Prod may expose buttons to open the generated command file or continue after Bob finishes.
- If command refresh behavior is uncertain, prefer a documented/manual refresh over an undocumented API.
- Do not add a generic model/provider picker to the hackathon product.
- The judged product always uses IBM Bob.

MCP and Bob Shell are future integrations, not MVP requirements.

---

# 5. Scope rules

## Required MVP

The MVP must support:

- extension installation in IBM Bob;
- one selected demo framework;
- PostgreSQL as the primary infrastructure dependency unless the selected fixture genuinely needs something else;
- workspace preflight;
- deterministic repository evidence scan;
- runtime/dependency model;
- environment-variable classification;
- `.bob/commands/` generation;
- visible Bob Agent productionization;
- real Docker build;
- real Docker/Compose startup;
- real observed failure;
- bounded diagnostic capture;
- visible Bob Agent repair;
- retry;
- real health/smoke verification;
- real tests;
- max 2 repair attempts;
- minimal GitHub Actions generation after success;
- evidence-backed final report.

## Explicitly out of MVP

Do not implement unless the golden path is already fully stable and submission-ready:

- vulnerability scanning;
- `npm audit` UI;
- `pip-audit`;
- Trivy;
- SBOM generation;
- dependency auto-upgrades;
- cloud deployment;
- Kubernetes;
- OpenShift;
- AWS/GCP/Azure deployment;
- multiple CI providers;
- hosted backend;
- multi-user dashboard;
- generic model selection;
- support for many frameworks;
- production monitoring;
- autonomous background retries;
- complex MCP architecture;
- Bob lifecycle hooks.

If time is limited, always protect the golden path.

---

# 6. Demo-stack rule

Choose **one** primary demo stack.

Preferred options:

```text
Django + PostgreSQL
```

or:

```text
Node/Express + PostgreSQL
```

The team should choose whichever stack it can implement and debug fastest.

Once chosen:

- do not reopen the framework debate during the sprint;
- do not promise both stacks in the submission;
- keep the architecture extensible, but support only one verified golden path.

The core Repo2Prod code should remain framework-adapter-friendly.

Do not hardcode Django- or Node-specific assumptions into shared orchestration modules.

---

# 7. Architecture boundaries

The source repository should follow approximately:

```text
repo2prod/
├─ src/
│  ├─ extension.ts
│  ├─ commands/
│  ├─ core/
│  ├─ analyzers/
│  ├─ execution/
│  └─ webview/
├─ templates/
│  └─ bob-commands/
├─ schemas/
├─ test-fixtures/
├─ scripts/
├─ docs/
└─ bob_sessions/
```

## `src/core/`

Owns:

- shared types;
- workflow state;
- manifest validation;
- evidence model;
- Bob command generation;
- redaction utilities.

Keep this framework-agnostic.

## `src/analyzers/`

Owns deterministic repository evidence extraction.

Examples:

- framework evidence;
- package/manifests;
- env variable names;
- existing Docker/Compose/CI files;
- candidate commands/ports.

Do not turn this into a full semantic code-intelligence engine.

Bob handles semantic reasoning.

## `src/execution/`

Owns:

- child processes;
- Docker;
- Compose;
- health verification;
- tests;
- diagnostics;
- cleanup.

This layer must be deterministic and must never rely on an LLM claim to mark something as successful.

## `src/webview/`

Owns:

- runtime graph;
- workflow status;
- configuration review;
- verification results;
- final readiness report.

Keep UI simple and demo-focused.

---

# 8. Shared interface discipline

Before making broad changes, preserve shared contracts.

Core concepts include:

```ts
type RunStatus =
  | 'PASS'
  | 'FAIL'
  | 'WARN'
  | 'NOT_RUN'
  | 'UNKNOWN';
```

Expected shared models:

- `Evidence`
- `RuntimeManifest`
- `EnvRequirement`
- `FailureBundle`
- `VerificationResult`
- `ReadinessReport`
- `RunState`

If an implementation requires changing a shared type:

1. make the change explicit;
2. update all affected consumers;
3. avoid silently changing interfaces owned by another module;
4. keep changes minimal.

Do not introduce duplicate competing data models.

---

# 9. Team ownership boundaries

The team has 3 members.

## Member A — Extension + orchestration + Bob command integration

Primary ownership:

```text
src/extension.ts
src/commands/
src/core/orchestrator.ts
src/core/state.ts
src/core/bobCommands.ts
```

Responsibilities:

- extension activation;
- commands;
- webview host/bridge;
- workflow states;
- `.repo2prod/` file lifecycle;
- `.bob/commands/` generation;
- Bob handoff flow;
- Git guard;
- VSIX packaging.

Avoid modifying Docker/analyzer internals unless integration requires it.

## Member B — Analysis + manifest + graph/UI

Primary ownership:

```text
src/analyzers/
src/core/manifest.ts
src/core/evidence.ts
schemas/
src/webview/
```

Responsibilities:

- deterministic evidence scanning;
- env-name detection/classification;
- manifest construction/validation;
- runtime graph;
- configuration UI;
- readiness/report UI.

Avoid modifying Docker execution unless integration requires it.

## Member C — Docker + verification + diagnostics + demo fixture

Primary ownership:

```text
src/execution/
test-fixtures/
scripts/
```

Responsibilities:

- process execution;
- Docker/Compose;
- health checks;
- tests;
- diagnostics;
- log redaction;
- golden fixture;
- reset tooling;
- repair-loop verification;
- demo reliability.

Avoid modifying analyzer/orchestrator architecture unless necessary.

When crossing ownership boundaries:

> prefer a small interface change over rewriting another member's module.

---

# 10. Deterministic analysis vs Bob reasoning

Follow this principle:

> **Local code collects facts. Bob interprets and modifies. Local code verifies.**

## Deterministic local code should handle

Examples:

- file exists;
- package exists;
- script exists;
- env variable name appears in source;
- Dockerfile exists;
- Compose exists;
- CI exists;
- Git dirty state;
- Docker availability;
- candidate port;
- exit code;
- health response;
- test result.

## Bob should handle

Examples:

- what is the real application entrypoint?
- which service is required?
- how should Docker be structured?
- why did this observed runtime failure happen?
- what is the smallest relevant fix?
- how should the verified local path become CI?

Do not spend Bobcoins on facts that ordinary code can extract reliably.

---

# 11. Secret-handling rules

Secret safety is non-negotiable.

Never:

- send real `.env` values to Bob;
- persist real secret values in `.repo2prod/`;
- include secrets in diagnostics;
- put secrets in `.env.example`;
- show secrets in screenshots/demo;
- commit secrets.

Environment variables should be classified.

Allowed categories:

```text
safe-inferred
generated-local-secret
generated-local-infrastructure
user-secret-required
optional-external
```

Locally generated development secrets must use secure local randomness.

Do not ask the LLM to invent credentials.

All logs stored in `.repo2prod/diagnostics/` must be bounded and redacted.

---

# 12. Verification rules

Repo2Prod must only report success based on observed evidence.

Never mark something `PASS` because:

- Bob says it should work;
- a Dockerfile looks correct;
- a config file was generated.

A `PASS` requires observed execution.

Examples:

```text
Docker build       PASS
PostgreSQL         PASS
Application        PASS
Health endpoint    PASS
Tests              PASS
```

Statuses are:

```text
PASS
FAIL
WARN
NOT_RUN
UNKNOWN
```

Do not invent arbitrary readiness percentages unless the scoring formula is explicit.

---

# 13. Repair-loop rules

Repair is deliberately bounded.

```text
maximum repair attempts per run = 2
```

On failure:

1. capture only relevant logs;
2. redact secrets;
3. write structured diagnostics;
4. update `/repo2prod-repair`;
5. ask Bob for the smallest targeted fix;
6. retry deterministic verification.

Attempt 2 requires explicit user confirmation.

After attempt 2:

- stop;
- show failure report;
- do not automatically start a new Bob repair cycle.

Avoid repository-wide refactoring during repair.

---

# 14. Git safety

Before edits:

- detect Git;
- detect dirty workspace;
- warn if dirty.

Do not automatically:

- commit;
- push;
- force-reset;
- discard existing changes.

After Bob modifies the repository:

- show changed files;
- allow normal diff review.

---

# 15. Docker safety

Never run global destructive Docker cleanup.

Do not use commands such as:

```bash
docker system prune -a
docker volume prune
```

against the user's entire machine.

Use a known Compose project name.

Cleanup only Repo2Prod-owned resources.

---

# 16. UI philosophy

The UI exists to make the workflow understandable in seconds.

Prioritize:

- current workflow step;
- runtime graph;
- configuration requirements;
- PASS/FAIL states;
- repair attempts remaining;
- generated Bob command;
- final evidence report.

Do not spend hackathon time on:

- elaborate animations;
- editable graph canvases;
- dashboards;
- complex settings;
- excessive branding.

Presentation reliability matters more than visual complexity.

---

# 17. Testing priorities

Write tests that protect the judged golden path.

High-priority tests:

- manifest validation;
- env-name extraction;
- secret redaction;
- Bob command generation;
- state transitions;
- repair-attempt cap;
- process timeout/cancellation;
- diagnostics truncation;
- readiness-status semantics.

Use stored/mock Bob outputs for automated tests.

Do not spend Bobcoins during ordinary unit tests.

---

# 18. Golden demo fixture rules

Use a controlled fixture repository.

It must:

- represent a realistic application;
- include PostgreSQL;
- include tests;
- include a verifiable health endpoint;
- contain no real secrets;
- have a real deterministic runtime/configuration defect;
- be resettable to an identical baseline.

Preferred deterministic defect:

```text
application container tries PostgreSQL at localhost
while PostgreSQL is actually the Compose service "db"
```

The failure should be real.

Do not insert fake conditional demo failures.

---

# 19. Bob command behavior

Generated Bob commands should be:

- short;
- phase-specific;
- grounded in structured Repo2Prod files;
- explicit about scope;
- explicit about avoiding unrelated refactors.

## `/repo2prod`

Goal:

> create or minimally repair a reproducible local runtime.

Constraints:

- no cloud deployment;
- no unrelated refactor;
- no fabricated credentials;
- preserve existing working config when possible.

## `/repo2prod-repair`

Goal:

> fix the latest observed Repo2Prod build/runtime failure.

Constraints:

- read bounded diagnostics;
- find root cause;
- make smallest relevant change;
- stop after targeted repair.

## `/repo2prod-ci`

Goal:

> generate a minimal GitHub Actions workflow from the already verified local path.

Constraints:

- GitHub Actions only;
- no deployment;
- no unnecessary secrets;
- reproduce verified commands.

---

# 20. Bob usage discipline

All team members should use Bob for meaningful initial work.

Use focused sessions.

Avoid one giant conversation for the whole hackathon.

Conserve Bobcoins by:

- using deterministic analysis;
- using mocks in tests;
- sending bounded logs;
- using one productionization task;
- using at most two repair tasks;
- generating CI only after success.

If later development needs additional assistance and Bobcoins are scarce, other coding assistants may be used only if allowed by event rules.

However:

> **The Repo2Prod product and judged demo remain IBM Bob-powered.**

Do not implement runtime fallback to another model.

---

# 21. `bob_sessions/` evidence

Every team member must maintain their own folder:

```text
bob_sessions/member-1/
bob_sessions/member-2/
bob_sessions/member-3/
```

After a meaningful Bob task:

1. capture the required task/session consumption screenshot;
2. save it immediately;
3. use a descriptive filename;
4. update the member README.

Do not postpone this until submission time.

Do not expose secrets/private information in screenshots.

---

# 22. Coding style

Use:

- TypeScript;
- explicit types for cross-module contracts;
- small functions;
- clear error messages;
- dependency injection where it helps testing;
- async/await rather than nested callbacks;
- narrow modules with obvious ownership.

Avoid:

- over-engineering;
- new frameworks without need;
- excessive abstraction;
- duplicate state systems;
- magic global mutable state;
- long unbounded subprocess output;
- broad catch blocks that hide failures.

Prefer readable hackathon code over clever architecture.

---

# 23. Error-handling philosophy

Fail explicitly.

Examples:

Good:

```text
Docker is not running. Start Docker and retry.
```

Good:

```text
Runtime manifest is invalid: services[0].ports must be an array.
```

Good:

```text
Repair limit reached (2/2). Repo2Prod stopped to avoid further Bobcoin usage.
```

Bad:

```text
Something went wrong.
```

Do not silently continue after invalid state.

---

# 24. Definition of success

The hackathon MVP is successful when this works repeatedly:

```text
open fixture in Bob
        ↓
Repo2Prod analyzes
        ↓
runtime plan appears
        ↓
/repo2prod in Bob Agent
        ↓
Bob edits runtime config
        ↓
Repo2Prod builds/runs
        ↓
real failure appears
        ↓
/repo2prod-repair
        ↓
Bob fixes it
        ↓
Repo2Prod retries
        ↓
health PASS
        ↓
tests PASS
        ↓
/repo2prod-ci
        ↓
GitHub Actions created
        ↓
final report
```

Everything else is secondary.

---

# 25. Do not do these things

Do not:

- build cloud deployment before the golden path;
- add vulnerability scanning before the golden path;
- support several frameworks before the golden path;
- hide Bob;
- reimplement Bob's codebase intelligence;
- build an "agent swarm" UI;
- add a generic AI provider selector;
- add unlimited retries;
- trust generated YAML without executing it;
- send secrets to Bob;
- report fake PASS states;
- rewrite other team members' modules unnecessarily;
- optimize architecture beyond what the demo requires.

---

# 26. Final project principle

Every implementation decision should reinforce this:

> **Bob is the coding intelligence. Repo2Prod is the execution-and-verification loop that takes Bob's changes all the way to a proven local runtime.**

If a proposed feature does not strengthen that statement, treat it as a stretch feature.
