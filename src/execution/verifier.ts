// TODO(Member C): health and test verification from observed execution only.

import type { RuntimeManifest, VerificationResult } from '../core/types';

export function verifyRuntime(manifest: RuntimeManifest): Promise<VerificationResult> {
  void manifest;
  throw new Error('Not implemented');
}
