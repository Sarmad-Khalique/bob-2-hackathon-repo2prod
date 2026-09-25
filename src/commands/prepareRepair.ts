// prepareRepair command handler.
//
// Valid only from DIAGNOSTIC_READY (set by Member C after an observed failure).
// Enforces MAX_REPAIR_ATTEMPTS (hard cap = 2).
// Attempt 2 requires explicit user confirmation via VS Code modal.
//
// On success:
//   DIAGNOSTIC_READY → BOB_REPAIR_SKILL_READY → WAITING_FOR_BOB_REPAIR
//   Shows: "Run /repo2prod-repair in Bob Agent mode."

import * as vscode from 'vscode';
import { orchestrator } from '../core/orchestrator';
import { Repo2ProdState, MAX_REPAIR_ATTEMPTS } from '../core/state';

export function registerPrepareRepair(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.prepareRepair', async () => {
      const current = orchestrator.currentState();

      if (current !== Repo2ProdState.DIAGNOSTIC_READY) {
        void vscode.window.showErrorMessage(
          `Repo2Prod: Prepare Repair is only available after a failure has been diagnosed. ` +
            `Current state: ${current}. Expected: DIAGNOSTIC_READY.`,
        );
        return;
      }

      // Guard: repair limit already exhausted?
      if (orchestrator.repairAttemptsUsed() >= MAX_REPAIR_ATTEMPTS) {
        void vscode.window.showErrorMessage(
          `Repair limit reached (${orchestrator.repairAttemptsUsed()}/${MAX_REPAIR_ATTEMPTS}). ` +
            'Start a new Repo2Prod run to continue.',
        );
        return;
      }

      let proceeded: boolean;
      try {
        proceeded = await orchestrator.prepareRepair();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Repo2Prod: ${message}`);
        return;
      }

      if (!proceeded) {
        // User declined the attempt-2 confirmation modal.
        void vscode.window.showInformationMessage(
          'Repo2Prod: Repair cancelled. The run remains in DIAGNOSTIC_READY.',
        );
        return;
      }

      const used = orchestrator.repairAttemptsUsed();
      const remaining = orchestrator.repairAttemptsRemaining();

      void vscode.window.showInformationMessage(
        `Repo2Prod: Repair skill ready (attempt ${used}/${MAX_REPAIR_ATTEMPTS}, ${remaining} remaining). ` +
          'Run /repo2prod-repair in Bob Agent mode. ' +
          'When Bob has finished, run "Repo2Prod: Verify Runtime".',
      );
    }),
  );
}
