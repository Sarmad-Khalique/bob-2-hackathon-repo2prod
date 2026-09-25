// TODO(Member A): extension activation, command registration, and webview host.

import * as vscode from 'vscode';
import { registerCreateBobCommandSmokeTest } from './commands/createBobCommandSmokeTest';
import { registerPrepareCI } from './commands/prepareCI';
import { registerPrepareRepair } from './commands/prepareRepair';
import { registerResetRun } from './commands/resetRun';
import { registerStartProductionization } from './commands/startProductionization';
import { registerVerifyRuntime } from './commands/verifyRuntime';

export function activate(context: vscode.ExtensionContext): void {
  registerStartProductionization(context);
  registerVerifyRuntime(context);
  registerPrepareRepair(context);
  registerPrepareCI(context);
  registerResetRun(context);
  registerCreateBobCommandSmokeTest(context);
}

export function deactivate(): void {}
