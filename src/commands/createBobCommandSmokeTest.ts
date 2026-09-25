// Member A: Integration smoke test — proves the extension can create a project-specific Bob slash command.

import * as vscode from 'vscode';

const SMOKE_FILE_CONTENT = `---
description: Verify Repo2Prod integration with IBM Bob
---

Read AGENTS.md.

Do not modify files.
Do not execute commands.

Reply exactly with:

Repo2Prod Bob command integration is working.
`;

export function registerCreateBobCommandSmokeTest(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.createBobCommandSmokeTest', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        void vscode.window.showErrorMessage(
          'Repo2Prod: No workspace is open. Open a folder or workspace and try again.',
        );
        return;
      }

      const workspaceRoot = folders[0].uri;
      const bobCommandsDir = vscode.Uri.joinPath(workspaceRoot, '.bob', 'commands');
      const smokeFileUri = vscode.Uri.joinPath(bobCommandsDir, 'repo2prod-smoke.md');

      try {
        await vscode.workspace.fs.createDirectory(bobCommandsDir);
        const encoded = Buffer.from(SMOKE_FILE_CONTENT, 'utf8');
        await vscode.workspace.fs.writeFile(smokeFileUri, encoded);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(
          `Repo2Prod: Failed to write smoke command file: ${message}`,
        );
        return;
      }

      void vscode.window.showInformationMessage(
        `Repo2Prod: Created .bob/commands/repo2prod-smoke.md in ${workspaceRoot.fsPath}`,
      );
    }),
  );
}
