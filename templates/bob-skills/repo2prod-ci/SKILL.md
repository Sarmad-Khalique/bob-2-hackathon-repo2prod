---
name: repo2prod-ci
description: Generate GitHub Actions CI from the Repo2Prod verified local workflow
user-invocable: true
---

Read the following Repo2Prod state files before doing any work:

- `.repo2prod/runtime-manifest.json`
- `.repo2prod/readiness-report.json`

Before generating any CI configuration, confirm that `.repo2prod/readiness-report.json`
shows that the local build and test path was **actually verified** (status `PASS`).
If the readiness report does not indicate a successful verified run, stop and report
that CI generation requires a passing local verification first.

Once verification is confirmed, create only:

`.github/workflows/ci.yml`

Requirements:

1. **GitHub Actions only.** Do not generate CI for any other provider.

2. **Reproduce the verified path.** Use only the install, build, and test
   commands that are represented in the verified runtime manifest state.
   Do not invent commands that were not part of the verified run.

3. **No cloud deployment.** The workflow should build and test only — not
   deploy to any cloud provider.

4. **No unnecessary secrets.** Reference only environment variables that are
   genuinely required for the build/test steps. Do not add placeholder secrets
   that serve no verified purpose.

5. **Keep it minimal.** A short, readable workflow that exactly reproduces the
   verified path is better than a comprehensive but unverified one.

6. When finished, summarize:
   - the generated workflow structure
   - which verified commands it reproduces
   - any manual steps required (e.g., configuring repository secrets)
