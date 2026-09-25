// TODO(Member A): prepare repair command.

import * as vscode from 'vscode';

export function registerPrepareRepair(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.prepareRepair', () => {
      void vscode.window.showInformationMessage('Repo2Prod: Prepare Repair — not implemented yet');
    }),
  );
}
