// TODO(Member A): reset run command.

import * as vscode from 'vscode';

export function registerResetRun(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.resetRun', () => {
      void vscode.window.showInformationMessage('Repo2Prod: Reset Run — not implemented yet');
    }),
  );
}
