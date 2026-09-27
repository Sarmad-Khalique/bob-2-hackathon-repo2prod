// completeRun command handler.
//
// The developer runs this after /repo2prod-ci has produced .github/workflows/ci.yml.
// It is the final step in the Repo2Prod workflow.
//
// Valid from: BOB_CI_SKILL_READY
//
// Requirements:
//   1. Open workspace required.
//   2. If orchestrator is IDLE after a Bob window reload, restore persisted state.
//   3. Require phase === BOB_CI_SKILL_READY.
//   4. Verify that .github/workflows/ci.yml exists and is non-empty.
//      (We do NOT claim CI executed — only that Bob generated the artifact.)
//   5. Require persisted readiness report with overall === PASS.
//   6. Transition: BOB_CI_SKILL_READY → FINAL_REPORT → COMPLETE.
//   7. Show a concise final summary distinguishing local VERIFIED from CI GENERATED.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { orchestrator } from '../core/orchestrator';
import { Repo2ProdState } from '../core/state';

// Output channel shared with verifyRuntime — created lazily.
let outputChannel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Repo2Prod');
  }
  return outputChannel;
}

export function registerCompleteRun(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.completeRun', async () => {
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

      // ── Step 3: require BOB_CI_SKILL_READY ───────────────────────────────
      const current = orchestrator.currentState();
      if (current !== Repo2ProdState.BOB_CI_SKILL_READY) {
        void vscode.window.showErrorMessage(
          `Repo2Prod: Complete Run requires state BOB_CI_SKILL_READY. ` +
            `Current state: ${current}. Run 'Repo2Prod: Prepare CI' first, ` +
            `then run /repo2prod-ci in Bob Agent mode.`,
        );
        return;
      }

      // ── Step 4: verify .github/workflows/ci.yml exists and is non-empty ─
      const ciPath = path.join(root, '.github', 'workflows', 'ci.yml');
      if (!fs.existsSync(ciPath)) {
        void vscode.window.showErrorMessage(
          'Repo2Prod: .github/workflows/ci.yml not found. ' +
            'Run /repo2prod-ci in Bob Agent mode to generate it first.',
        );
        return;
      }
      const ciStat = fs.statSync(ciPath);
      if (ciStat.size === 0) {
        void vscode.window.showErrorMessage(
          'Repo2Prod: .github/workflows/ci.yml is empty. ' +
            'Run /repo2prod-ci in Bob Agent mode to regenerate it.',
        );
        return;
      }

      // ── Step 5: require a PASS readiness report ───────────────────────────
      const rs = orchestrator.runState();
      if (rs.report === null) {
        void vscode.window.showErrorMessage(
          'Repo2Prod: No readiness report found in run state. ' +
            'This is unexpected — the run may have been corrupted. ' +
            'Run Reset Run and start over.',
        );
        return;
      }
      if (rs.report.overall !== 'PASS') {
        void vscode.window.showErrorMessage(
          `Repo2Prod: Complete Run requires overall readiness PASS. ` +
            `Current readiness: ${rs.report.overall}. ` +
            `A non-passing run cannot be completed.`,
        );
        return;
      }

      // ── Step 6: FINAL_REPORT → COMPLETE ──────────────────────────────────
      try {
        orchestrator.beginFinalReport();
        orchestrator.complete();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Repo2Prod: ${message}`);
        return;
      }

      // ── Step 7: show final summary ────────────────────────────────────────
      const report = rs.report;
      const channel = getChannel();
      channel.show(true);

      channel.appendLine('');
      channel.appendLine('══════════════════════════════════════════════');
      channel.appendLine('  Repo2Prod — RUN COMPLETE');
      channel.appendLine('══════════════════════════════════════════════');
      channel.appendLine(`  Local runtime:   VERIFIED`);
      channel.appendLine(`  Overall status:  ${report.overall}`);
      channel.appendLine(`  Repair attempts: ${report.repairAttemptsUsed}/2`);
      channel.appendLine('');
      channel.appendLine('  Check results:');
      for (const check of report.checks) {
        const obs = check.observed ? '' : ' (not observed)';
        channel.appendLine(`    ${check.id.padEnd(12)} ${check.status}${obs}`);
      }
      channel.appendLine('');
      channel.appendLine(`  CI artifact:     .github/workflows/ci.yml`);
      channel.appendLine(`  CI execution:    NOT_RUN by Repo2Prod`);
      channel.appendLine('');
      channel.appendLine('  Summary:');
      channel.appendLine(`  ${report.summary}`);
      channel.appendLine('══════════════════════════════════════════════');
      channel.appendLine('');

      void vscode.window.showInformationMessage(
        `Repo2Prod COMPLETE. ` +
          `Local runtime: VERIFIED. ` +
          `Repair attempts: ${report.repairAttemptsUsed}/2. ` +
          `CI artifact: .github/workflows/ci.yml (generated by Bob — NOT executed by Repo2Prod). ` +
          `See Repo2Prod output for full details.`,
        'Open readiness report',
        'Open CI workflow',
      ).then(selection => {
        if (selection === 'Open readiness report') {
          void vscode.commands.executeCommand(
            'vscode.open',
            vscode.Uri.file(path.join(root, '.repo2prod', 'readiness-report.json')),
          );
        } else if (selection === 'Open CI workflow') {
          void vscode.commands.executeCommand(
            'vscode.open',
            vscode.Uri.file(ciPath),
          );
        }
      });
    }),
  );
}
