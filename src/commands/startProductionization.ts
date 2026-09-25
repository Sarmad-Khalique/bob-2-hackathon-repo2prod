// startProductionization command handler.
//
// Requires an open workspace. Resets run state and starts the workflow:
//   IDLE → PREFLIGHT → ANALYZING_LOCAL
//
// If Member B analysis is not yet implemented, the run stops at ANALYZING_LOCAL
// with a clear development-status message. No fake results are produced.

import * as vscode from 'vscode';
import { orchestrator } from '../core/orchestrator';
import { Repo2ProdState } from '../core/state';

export function registerStartProductionization(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.startProductionization', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        void vscode.window.showErrorMessage(
          'Repo2Prod: No workspace is open. Open a folder and try again.',
        );
        return;
      }

      const workspaceRoot = folders[0].uri.fsPath;

      try {
        orchestrator.start(workspaceRoot);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Repo2Prod: Failed to start — ${message}`);
        return;
      }

      // State is now ANALYZING_LOCAL.
      // Member B analysis stub is not yet implemented; stop here cleanly.
      const current = orchestrator.currentState();

      if (current === Repo2ProdState.ANALYZING_LOCAL) {
        void vscode.window.showInformationMessage(
          'Repo2Prod: Run started. State: ANALYZING_LOCAL. ' +
            'Workspace analysis (Member B) is not yet implemented — ' +
            'run state has been initialized in .repo2prod/run-state.json.',
        );
      }
    }),
  );
}
