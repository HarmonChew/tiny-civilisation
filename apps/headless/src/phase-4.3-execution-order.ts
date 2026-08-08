/** Testable seams preserve authentication-before-attempt ordering. */
export function runAfterPhase43CalibrationAuthentication<T>(
  authenticate: () => void,
  execute: () => T,
): T {
  authenticate();
  return execute();
}

export function acquirePhase43HoldoutAfterReleaseAuthentication<T>(
  authenticateDiscovery: () => void,
  authenticateVerification: () => void,
  authenticateAutomatedReleaseCheck: () => void,
  authenticateDeploymentSmoke: () => void,
  authenticateNvdaRecord: () => void,
  acquireAttempt: () => T,
): T {
  authenticateDiscovery();
  authenticateVerification();
  authenticateAutomatedReleaseCheck();
  authenticateDeploymentSmoke();
  authenticateNvdaRecord();
  return acquireAttempt();
}
