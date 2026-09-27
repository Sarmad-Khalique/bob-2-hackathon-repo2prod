// prepareCI command handler.
//
// Valid only after VERIFIED with a PASS readiness report.
// Installs the CI skill and transitions to BOB_CI_SKILL_READY.
// Shows: "Run /repo2prod-ci in Bob Agent mode."
//
// Requirements:
//   1. Open workspace required.
//   2. If orchestrator is IDLE after a Bob window reload, restore persisted state.
//   3. Require phase === VERIFIED.
//   4. Require runState.report !== null and report.overall === PASS.
//   5. Require .repo2prod/readiness-report.json to exist on disk.
//   6. Install CI skill and transition to BOB_CI_SKILL_READY.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { orchestrator } from '../core/orchestrator';
import { Repo2ProdState } from '../core/state';

export function registerPrepareCI(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.prepareCI', async () => {
      // ── Step 1: resolve workspace root ──────────────────────────────────
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        void vscode.window.showErrorMessage(
          'Repo2Prod: No workspace is open. Open a folder and try again.',
        );
        return;
      }
      const root = folders[0].uri.fsPath;

      // ── Step 2: restore state after Bob window reload if needed ─────────
      if (orchestrator.currentState() === Repo2ProdState.IDLE) {
        orchestrator.loadPersistedState(root);
      }

      // ── Step 3: require VERIFIED ─────────────────────────────────────────
      const current = orchestrator.currentState();
      if (current !== Repo2ProdState.VERIFIED) {
        void vscode.window.showErrorMessage(
          `Repo2Prod: Prepare CI requires a fully verified runtime. ` +
            `Current state: ${current}. Expected: VERIFIED.`,
        );
        return;
      }

      // ── Step 4: require a PASS readiness report in memory ────────────────
      const rs = orchestrator.runState();
      if (rs.report === null) {
        void vscode.window.showErrorMessage(
          'Repo2Prod: No readiness report found. ' +
            'Run Repo2Prod: Verify Runtime to generate one.',
        );
        return;
      }
      if (rs.report.overall !== 'PASS') {
        void vscode.window.showErrorMessage(
          `Repo2Prod: CI generation requires overall readiness PASS. ` +
            `Current readiness: ${rs.report.overall}. ` +
            `Review the report and run verification again.`,
        );
        return;
      }

      // ── Step 5: require readiness-report.json on disk ────────────────────
      const reportPath = path.join(root, '.repo2prod', 'readiness-report.json');
      if (!fs.existsSync(reportPath)) {
        void vscode.window.showErrorMessage(
          'Repo2Prod: .repo2prod/readiness-report.json not found. ' +
            'Run Repo2Prod: Verify Runtime to generate it.',
        );
        return;
      }

      // ── Step 6: install CI skill and transition ───────────────────────────
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
