// TODO(Member A): extension activation, command registration, and webview host.

import * as vscode from 'vscode';
import { registerCompleteRun } from './commands/completeRun';
import { registerCreateBobSkillSmokeTest } from './commands/createBobSkillSmokeTest';
import { registerInstallBobSkills } from './commands/installBobSkills';
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
  registerCompleteRun(context);
  registerResetRun(context);
  registerCreateBobSkillSmokeTest(context);
  registerInstallBobSkills(context);
}

export function deactivate(): void {}
