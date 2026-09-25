// prepareCI command handler.
//
// Valid only after VERIFIED (all health checks and tests passed).
// Installs the CI skill and transitions to BOB_CI_SKILL_READY.
// Shows: "Run /repo2prod-ci in Bob Agent mode."

import * as vscode from 'vscode';
import { orchestrator } from '../core/orchestrator';
import { Repo2ProdState } from '../core/state';

export function registerPrepareCI(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.prepareCI', async () => {
      const current = orchestrator.currentState();

      if (current !== Repo2ProdState.VERIFIED) {
        void vscode.window.showErrorMessage(
          `Repo2Prod: Prepare CI requires a fully verified runtime. ` +
            `Current state: ${current}. Expected: VERIFIED.`,
        );
        return;
      }

      try {
        await orchestrator.prepareCI();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Repo2Prod: ${message}`);
        return;
      }

      void vscode.window.showInformationMessage(
        'Repo2Prod: CI skill ready. ' +
          'Run /repo2prod-ci in Bob Agent mode to generate a minimal GitHub Actions workflow.',
      );
    }),
  );
}
