// TODO(Member A): prepare CI command.

import * as vscode from 'vscode';

export function registerPrepareCI(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.prepareCI', () => {
      void vscode.window.showInformationMessage('Repo2Prod: Prepare CI — not implemented yet');
    }),
  );
}
