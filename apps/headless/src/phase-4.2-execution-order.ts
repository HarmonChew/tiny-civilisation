/**
 * Small orchestration seams keep the irreversible ordering testable without
 * exposing an injectable production calibration runner.
 */
export function runAfterPhase42CalibrationAuthentication<T>(
  authenticate: () => void,
  execute: () => T,
): T {
  authenticate();
  return execute();
}

export function acquirePhase42HoldoutAfterCalibrationAuthentication<T>(
  authenticateDiscovery: () => void,
  authenticateVerification: () => void,
  acquireAttempt: () => T,
): T {
  authenticateDiscovery();
  authenticateVerification();
  return acquireAttempt();
}
