// resetRun command handler.
//
// Resets the Repo2Prod run back to IDLE.
// Clears workflow metadata only.
//
// Does NOT:
//   - delete Docker files or application changes
//   - delete .bob skills
//   - delete Git changes
//   - run any Docker cleanup/prune

import * as vscode from 'vscode';
import { orchestrator } from '../core/orchestrator';

export function registerResetRun(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.resetRun', () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        void vscode.window.showErrorMessage(
          'Repo2Prod: No workspace is open. Open a folder and try again.',
        );
        return;
      }

      try {
        orchestrator.reset();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Repo2Prod: Reset failed — ${message}`);
        return;
      }

      void vscode.window.showInformationMessage(
        'Repo2Prod: Run reset to IDLE. ' +
          'No application files, Docker config, or Git changes were modified.',
      );
    }),
  );
}
