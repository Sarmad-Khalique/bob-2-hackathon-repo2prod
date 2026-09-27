---
name: repo2prod-ci
description: Generate GitHub Actions CI from the Repo2Prod verified local workflow
user-invocable: true
---

Read the following Repo2Prod state files before doing any work:

**Required:**

- `.repo2prod/runtime-manifest.json`
- `.repo2prod/readiness-report.json`

**Optional (read if present):**

- `.repo2prod/health-endpoint.json`

Also inspect the actual verified runtime files that exist in the repository,
such as:

- `Dockerfile`
- `compose.yaml`
- `docker-compose.yml`
- `docker-compose.yaml`
- `compose.yml`

Before generating any CI configuration, confirm that
`.repo2prod/readiness-report.json` shows `"overall": "PASS"`.
If the readiness report `overall` is not `PASS`, stop immediately and report
that CI generation requires a passing local verification first. Do not
attempt to generate CI for a failed or partial verification.

**Important:** `runtime-manifest.json` contains the pre-execution runtime
plan. Its `commands` fields may be `null` even after a successful run because
command values are populated by Bob, not by Repo2Prod. Do **not** treat null
`commands` as a reason to stop. Use the readiness report and the actual
runtime files (Dockerfile, compose file) as the source of truth for what was
verified and how to reproduce it in CI.

The readiness report is the source of truth for WHAT was actually verified:

- `checks` array shows each check id, status, and whether it was observed.
- `"status": "PASS"` with `"observed": true` means that step was genuinely
  executed and passed.
- `"status": "NOT_RUN"` means that step was not applicable or not present
  (e.g., `database` for a SQLite app, or `tests` when no tests exist).
- Do **not** treat `NOT_RUN` as `PASS`.

Once verification is confirmed, create only:

`.github/workflows/ci.yml`

Requirements:

1. **GitHub Actions only.** Do not generate CI for any other provider.

2. **Reproduce the verified path from the actual runtime files.** Inspect
   the Dockerfile and Compose file to understand the verified build and
   startup commands. Use those commands in CI. Do not invent commands.

3. **If `docker` and `build` checks are PASS and observed:**
   CI may reproduce the Docker/Compose build step.

4. **If `app` and `health` checks are PASS and observed:**
   CI may start the Compose runtime and verify the health endpoint.
   If `.repo2prod/health-endpoint.json` exists and `health` was PASS,
   use the declared path from that file for the CI health probe.

5. **Test step rules:**
   - Only add a test step if `tests` check is `"status": "PASS"` and
     `"observed": true` in the readiness report.
   - If `tests` is `NOT_RUN`, do **not** invent a test command. Omit the
     test step entirely.
   - If an exact test command cannot be established from the verified
     runtime configuration, omit the test step and note that limitation
     in the summary.

6. **No cloud deployment.** The workflow must build and verify only.

7. **Environment variable handling in CI — follow RuntimeManifest categories
   exactly for every env var that is genuinely required by the verified
   build/startup steps:**

   - **`generated-local-secret`** — do **not** use a GitHub repository secret.
     Generate an ephemeral, CI-local value during the workflow job using a
     standard tool already available on the GitHub-hosted runner (e.g.
     `openssl rand -hex 40` for a Django SECRET_KEY).  Export it for
     subsequent steps via `$GITHUB_ENV`.  Do not print the value, do not
     commit it, and do not persist it outside the runner job.

   - **`user-secret-required`** — use a GitHub Actions repository/environment
     secret: `${{ secrets.NAME }}`.  Never fabricate a value.  List each
     required secret in the final summary so the operator knows what to
     configure before the workflow can run.

   - **`safe-inferred`** — use a safe, explicit CI-local value only when
     the verified runtime genuinely requires it.  Do not turn it into a
     repository secret unnecessarily.

   - **`generated-local-infrastructure`** — derive or use values from the
     generated Compose/local CI runtime where possible.  Do not turn them
     into external repository secrets unless the verified runtime requires it.

   - **`optional-external`** — omit the variable entirely unless it is
     genuinely required to reproduce the verified path.  Do not invent
     configuration merely because the variable was detected.

   Do not copy `.env` into the workflow.  Do not expose secret values.

8. **No vulnerability scanner, dependency upgrades, or SBOM generation.**

9. **Keep it minimal.** A short, readable workflow that exactly reproduces
   the verified path is better than a comprehensive but unverified one.

10. When finished, summarize:
    - the generated workflow structure
    - which verified stages were reproduced
    - which stages were omitted because they were NOT_RUN
    - any repository secrets or manual configuration required before
      the workflow can run
