// TODO(Member B): detect existing Dockerfile, Compose, and CI files.

import type { Evidence } from '../core/types';

export function analyzeExistingOps(
  root: string,
): Promise<Pick<Evidence, 'dockerfilePresent' | 'composePresent' | 'ciPresent'>> {
  void root;
  throw new Error('Not implemented');
}
