// TODO(Member A): verify runtime command.

import * as vscode from 'vscode';

export function registerVerifyRuntime(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.verifyRuntime', () => {
      void vscode.window.showInformationMessage('Repo2Prod: Verify Runtime — not implemented yet');
    }),
  );
}
