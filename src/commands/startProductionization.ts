// TODO(Member A): start productionization command.

import * as vscode from 'vscode';

export function registerStartProductionization(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('repo2prod.startProductionization', () => {
      void vscode.window.showInformationMessage(
        'Repo2Prod: Start Productionization — not implemented yet',
      );
    }),
  );
}
