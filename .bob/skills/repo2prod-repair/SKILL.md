---
name: repo2prod-repair
description: Repair the latest Repo2Prod-observed build or runtime failure
user-invocable: true
---

Read the following Repo2Prod state files before doing any work:

- `.repo2prod/runtime-manifest.json`
- `.repo2prod/diagnostics/latest.json`

The diagnostic file contains evidence from a **real Repo2Prod execution** —
real build output, real container logs, or real test output. Treat it as
ground truth.

Perform the following:

1. **Identify the most likely root cause** based on the diagnostic evidence.
   Do not guess — anchor your analysis to specific log lines or error messages
   present in the diagnostic file.

2. **Inspect only the relevant repository files** needed to confirm the root
   cause. Do not read the entire repository.

3. **Make the smallest targeted change** that directly addresses the observed
   failure. A one-line fix that solves the problem is better than a broad
   refactor.

4. **Do not refactor unrelated code.** Touch only what is required to fix the
   specific observed failure.

5. **Never fabricate credentials.** If a missing or wrong credential caused
   the failure, note it explicitly — do not invent real values.

6. When finished, summarize:
   - the identified root cause
   - files changed
   - why this specific change should resolve the exact observed failure

Repo2Prod will rerun verification immediately after you finish.

Note: Repo2Prod controls the repair-attempt limit. You do not need to track
attempt counts.
