// Development/manual-test command — install all three Repo2Prod Bob skills into the
// currently open workspace. Used to verify skill installation before the orchestrator
// is wired up.

import * as vscode from 'vscode';
import { bobSkillManager } from '../core/bobSkills';

export function registerInstallBobSkills(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.installBobSkills', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        void vscode.window.showErrorMessage(
          'Repo2Prod: No workspace is open. Open a folder or workspace and try again.',
        );
        return;
      }

      const workspaceRoot = folders[0].uri;
      const result = await bobSkillManager.installSkills(workspaceRoot);

      if (result.errors.length > 0) {
        const detail = result.errors.join('\n');
        void vscode.window.showErrorMessage(
          `Repo2Prod: Skill installation failed:\n${detail}`,
        );
        return;
      }

      const list = result.installed.map((p) => `  • ${p}`).join('\n');
      void vscode.window.showInformationMessage(
        `Repo2Prod: Bob skills installed in ${workspaceRoot.fsPath}:\n${list}`,
      );
    }),
  );
}
