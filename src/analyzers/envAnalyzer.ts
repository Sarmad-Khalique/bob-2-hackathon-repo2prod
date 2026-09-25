// TODO(Member B): detect environment variable names and classifications. Never read secret values into Bob context.

import type { EnvRequirement } from '../core/types';

export function analyzeEnv(root: string): Promise<EnvRequirement[]> {
  void root;
  throw new Error('Not implemented');
}
