// verifyRuntime command handler.
//
// Signals that the user has finished in Bob Agent mode (ran /repo2prod or /repo2prod-repair)
// and Repo2Prod should now proceed with Docker execution and verification.
//
// Valid only from:
//   WAITING_FOR_BOB_PRODUCTIONIZATION  →  BUILDING
//   WAITING_FOR_BOB_REPAIR             →  BUILDING
//
// Member C Docker/verification internals are not implemented yet.
// The command transitions to BUILDING and shows a clear status message.

import * as vscode from 'vscode';
import { orchestrator } from '../core/orchestrator';
import { Repo2ProdState } from '../core/state';

export function registerVerifyRuntime(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.verifyRuntime', () => {
      const current = orchestrator.currentState();

      const validFrom: Repo2ProdState[] = [
        Repo2ProdState.WAITING_FOR_BOB_PRODUCTIONIZATION,
        Repo2ProdState.WAITING_FOR_BOB_REPAIR,
      ];

      if (!validFrom.includes(current)) {
        void vscode.window.showErrorMessage(
          `Repo2Prod: cannot verify runtime while state is ${current}. ` +
            `Run this command after Bob has finished (state must be ` +
            `WAITING_FOR_BOB_PRODUCTIONIZATION or WAITING_FOR_BOB_REPAIR).`,
        );
        return;
      }

      try {
        if (current === Repo2ProdState.WAITING_FOR_BOB_PRODUCTIONIZATION) {
          orchestrator.markBobProductionizationComplete();
        } else {
          orchestrator.markBobRepairComplete();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Repo2Prod: ${message}`);
        return;
      }

      // State is now BUILDING.
      // Member C Docker execution is not yet implemented.
      void vscode.window.showInformationMessage(
        'Repo2Prod: State advanced to BUILDING. ' +
          'Docker build and verification (Member C) is not yet implemented — ' +
          'verification implementation pending.',
      );
    }),
  );
}
