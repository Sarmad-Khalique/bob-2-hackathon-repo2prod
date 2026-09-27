---
name: repo2prod
description: Productionize the current repository using Repo2Prod runtime evidence
user-invocable: true
---

Read the following Repo2Prod state files before doing any work:

**Required:**

- `.repo2prod/evidence.json`
- `.repo2prod/runtime-manifest.json`

If either required file does not exist, stop immediately and clearly report
which file is missing. Do not invent data to substitute for a missing required
state file.

**Optional:**

- `.repo2prod/resolved-config.json`

If `.repo2prod/resolved-config.json` exists, read it and use it as supplemental
runtime configuration context. If it does not exist, continue normally — do not
treat its absence as an error.

Once you have read the available state files, perform the following:

1. **Validate runtime assumptions** — confirm that the evidence in
   `.repo2prod/evidence.json` matches the actual repository structure.
   Note any discrepancies. Do not assume optional missing configuration is
   already resolved.

2. **Create or minimally repair the local Docker runtime** — create or update
   only what is needed to make the application run locally in Docker/Compose.
   Candidates include:
   - `Dockerfile`
   - `.dockerignore`
   - `compose.yaml`
   - `.env.example`

   When creating or updating `.dockerignore`, ensure it contains at least
   these three entries (preserve all existing rules, add only what is missing):

   ```
   .repo2prod/
   .bob/
   .git/
   ```

   These paths must never enter the Docker build context.

3. **Ensure a health endpoint exists**
   1. Look for an existing health/readiness endpoint in the application
      (e.g. routes or views named health, healthz, ready, status, ping).
   2. If one exists and it returns HTTP 200 only when the app can serve
      requests, reuse it. Do not create a duplicate.
   3. If none exists, add the smallest possible one using the project's own
      framework conventions (for Django: one small view and one URL entry;
      no new dependencies, no new app unless unavoidable):
      - GET /health/ returns 200 with JSON `{"status": "ok"}` when healthy.
      - If the app uses a database, the endpoint must really check it
        (e.g. a trivial SELECT 1) and return 503 with `{"status": "error"}`
        when that check fails.
      - No authentication, and it must work for plain GET requests (no CSRF
        token needed).
      - It must work with the host settings used by the local container;
        Repo2Prod probes it from the host at 127.0.0.1.
      - It must never expose secrets, env values, connection strings, stack
        traces, or version details.
      - It must NOT be hard-coded to always return 200.
   4. This step only adds or declares the endpoint. Do not change other
      application code in this step, and do not add or modify tests.
   5. Write `.repo2prod/health-endpoint.json` in exactly this shape
      (`expectStatus` is a number):
      ```json
      {
        "path": "/health/",
        "method": "GET",
        "expectStatus": 200,
        "checks": ["database"],
        "source": "existing",
        "files": ["<repo-relative files that define the endpoint>"]
      }
      ```
      Use `"checks": []` if no dependency is checked, and `"source":
      "created-by-bob"` if you created the endpoint.

4. **Preserve working configuration** — if a file already exists and is
   largely correct, make the smallest targeted change rather than rewriting it.

5. **Do not refactor unrelated application code.** Only touch runtime
   configuration files unless a direct source-level fix is required for the
   container to start. The minimal health-endpoint addition in step 3 is the
   only permitted source-level change in this task.

6. **Never invent real external credentials.** Use placeholder values in
   `.env.example` and reference them in `compose.yaml` via environment
   variable substitution.

7. **Never deploy to cloud.** This task is for local reproducible execution
   only.

8. When finished, summarize:
   - files changed and why
   - runtime assumptions corrected
   - the health endpoint path, whether it already existed or was created by
     this task, and what dependencies it checks
   - any unresolved requirements that Repo2Prod must verify

Repo2Prod will execute and verify the runtime immediately after you finish.
