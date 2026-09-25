// Member A: Integration smoke test — proves the extension can create a project-specific Bob skill.

import * as vscode from 'vscode';

const SKILL_FILE_CONTENT = `---
name: repo2prod-smoke
description: Verify Repo2Prod integration with IBM Bob
user-invocable: true
---

Read AGENTS.md.

Do not modify files.
Do not execute commands.

Reply exactly with:

Repo2Prod Bob skill integration is working.
`;

export function registerCreateBobSkillSmokeTest(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.createBobSkillSmokeTest', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        void vscode.window.showErrorMessage(
          'Repo2Prod: No workspace is open. Open a folder or workspace and try again.',
        );
        return;
      }

      const workspaceRoot = folders[0].uri;
      const bobSkillDir = vscode.Uri.joinPath(workspaceRoot, '.bob', 'skills', 'repo2prod-smoke');
      const skillFileUri = vscode.Uri.joinPath(bobSkillDir, 'SKILL.md');

      try {
        await vscode.workspace.fs.createDirectory(bobSkillDir);
        const encoded = Buffer.from(SKILL_FILE_CONTENT, 'utf8');
        await vscode.workspace.fs.writeFile(skillFileUri, encoded);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(
          `Repo2Prod: Failed to write smoke skill file: ${message}`,
        );
        return;
      }

      void vscode.window.showInformationMessage(
        `Repo2Prod: Created .bob/skills/repo2prod-smoke/SKILL.md in ${workspaceRoot.fsPath}`,
      );
    }),
  );
}
