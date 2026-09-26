// Bob Skills manager — installs project-local Bob skills into the target workspace.
// Skills are static SKILL.md files written to .bob/skills/<name>/SKILL.md.
// Dynamic state lives under .repo2prod/ and is read by the skills at invocation time.

import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillInstallResult {
  installed: string[];
  errors: string[];
}

// Skill definitions bundled with the extension.
interface SkillDefinition {
  name: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Skill content — kept inline so the extension ships as a single VSIX without
// needing runtime file-system access to the extension's own source tree.
// These must stay in sync with templates/bob-skills/*/SKILL.md.
// ---------------------------------------------------------------------------

const SKILL_REPO2PROD: SkillDefinition = {
  name: 'repo2prod',
  content: `---
name: repo2prod
description: Productionize the current repository using Repo2Prod runtime evidence
user-invocable: true
---

Read the following Repo2Prod state files before doing any work:

**Required:**

- \`.repo2prod/evidence.json\`
- \`.repo2prod/runtime-manifest.json\`

If either required file does not exist, stop immediately and clearly report
which file is missing. Do not invent data to substitute for a missing required
state file.

**Optional:**

- \`.repo2prod/resolved-config.json\`

If \`.repo2prod/resolved-config.json\` exists, read it and use it as supplemental
runtime configuration context. If it does not exist, continue normally — do not
treat its absence as an error.

Once you have read the available state files, perform the following:

1. **Validate runtime assumptions** — confirm that the evidence in
   \`.repo2prod/evidence.json\` matches the actual repository structure.
   Note any discrepancies. Do not assume optional missing configuration is
   already resolved.

2. **Create or minimally repair the local Docker runtime** — create or update
   only what is needed to make the application run locally in Docker/Compose.
   Candidates include:
   - \`Dockerfile\`
   - \`.dockerignore\`
   - \`compose.yaml\`
   - \`.env.example\`

3. **Preserve working configuration** — if a file already exists and is
   largely correct, make the smallest targeted change rather than rewriting it.

4. **Do not refactor unrelated application code.** Only touch runtime
   configuration files unless a direct source-level fix is required for the
   container to start.

5. **Never invent real external credentials.** Use placeholder values in
   \`.env.example\` and reference them in \`compose.yaml\` via environment
   variable substitution.

6. **Never deploy to cloud.** This task is for local reproducible execution
   only.

7. When finished, summarize:
   - files changed and why
   - runtime assumptions corrected
   - any unresolved requirements that Repo2Prod must verify

Repo2Prod will execute and verify the runtime immediately after you finish.
`,
};

const SKILL_REPO2PROD_REPAIR: SkillDefinition = {
  name: 'repo2prod-repair',
  content: `---
name: repo2prod-repair
description: Repair the latest Repo2Prod-observed build or runtime failure
user-invocable: true
---

Read the following Repo2Prod state files before doing any work:

- \`.repo2prod/runtime-manifest.json\`
- \`.repo2prod/diagnostics/latest.json\`

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
`,
};

const SKILL_REPO2PROD_CI: SkillDefinition = {
  name: 'repo2prod-ci',
  content: `---
name: repo2prod-ci
description: Generate GitHub Actions CI from the Repo2Prod verified local workflow
user-invocable: true
---

Read the following Repo2Prod state files before doing any work:

- \`.repo2prod/runtime-manifest.json\`
- \`.repo2prod/readiness-report.json\`

Before generating any CI configuration, confirm that \`.repo2prod/readiness-report.json\`
shows that the local build and test path was **actually verified** (status \`PASS\`).
If the readiness report does not indicate a successful verified run, stop and report
that CI generation requires a passing local verification first.

Once verification is confirmed, create only:

\`.github/workflows/ci.yml\`

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
`,
};

// ---------------------------------------------------------------------------
// BobSkillManager
// ---------------------------------------------------------------------------

export class BobSkillManager {
  /**
   * Install all three production Repo2Prod skills into the target workspace.
   * Returns a summary of installed paths and any errors encountered.
   */
  async installSkills(workspaceRoot: vscode.Uri): Promise<SkillInstallResult> {
    const installed: string[] = [];
    const errors: string[] = [];

    for (const skill of [SKILL_REPO2PROD, SKILL_REPO2PROD_REPAIR, SKILL_REPO2PROD_CI]) {
      try {
        await this.writeSkill(workspaceRoot, skill);
        installed.push(`.bob/skills/${skill.name}/SKILL.md`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${skill.name}: ${message}`);
      }
    }

    return { installed, errors };
  }

  /** Install only the /repo2prod productionization skill. */
  async installProductionizeSkill(workspaceRoot: vscode.Uri): Promise<void> {
    await this.writeSkill(workspaceRoot, SKILL_REPO2PROD);
  }

  /** Install only the /repo2prod-repair skill. */
  async installRepairSkill(workspaceRoot: vscode.Uri): Promise<void> {
    await this.writeSkill(workspaceRoot, SKILL_REPO2PROD_REPAIR);
  }

  /** Install only the /repo2prod-ci skill. */
  async installCISkill(workspaceRoot: vscode.Uri): Promise<void> {
    await this.writeSkill(workspaceRoot, SKILL_REPO2PROD_CI);
  }

  /**
   * Return true only when all three production skills are present on disk.
   * Does not validate file contents.
   */
  async skillsInstalled(workspaceRoot: vscode.Uri): Promise<boolean> {
    for (const skill of [SKILL_REPO2PROD, SKILL_REPO2PROD_REPAIR, SKILL_REPO2PROD_CI]) {
      const fileUri = this.skillFileUri(workspaceRoot, skill.name);
      try {
        await vscode.workspace.fs.stat(fileUri);
      } catch {
        return false;
      }
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async writeSkill(workspaceRoot: vscode.Uri, skill: SkillDefinition): Promise<void> {
    const dirUri = this.skillDirUri(workspaceRoot, skill.name);
    const fileUri = this.skillFileUri(workspaceRoot, skill.name);
    await vscode.workspace.fs.createDirectory(dirUri);
    const encoded = Buffer.from(skill.content, 'utf8');
    await vscode.workspace.fs.writeFile(fileUri, encoded);
  }

  private skillDirUri(workspaceRoot: vscode.Uri, skillName: string): vscode.Uri {
    return vscode.Uri.joinPath(workspaceRoot, '.bob', 'skills', skillName);
  }

  private skillFileUri(workspaceRoot: vscode.Uri, skillName: string): vscode.Uri {
    return vscode.Uri.joinPath(workspaceRoot, '.bob', 'skills', skillName, 'SKILL.md');
  }
}

// Shared singleton — callers may import and use this directly.
export const bobSkillManager = new BobSkillManager();
