import { closeSync, fsyncSync, openSync } from "node:fs";
import { dirname } from "node:path";

export interface DirectorySyncOperations {
  readonly openDirectory: (path: string) => number;
  readonly sync: (descriptor: number) => void;
  readonly close: (descriptor: number) => void;
}

export type DirectorySyncResult = "SYNCED" | "UNSUPPORTED_ON_WINDOWS";

const NODE_DIRECTORY_SYNC: DirectorySyncOperations = {
  openDirectory: (path) => openSync(path, "r"),
  sync: (descriptor) => fsyncSync(descriptor),
  close: (descriptor) => closeSync(descriptor),
};

const WINDOWS_UNSUPPORTED_DIRECTORY_SYNC_CODES = new Set([
  "EACCES",
  "EINVAL",
  "EISDIR",
  "ENOSYS",
  "EPERM",
]);

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

/**
 * Flushes the directory entry that makes a previously fsynced file durable.
 * POSIX failures are fatal. Windows does not consistently support opening or
 * fsyncing directory handles through Node, so only its documented filesystem
 * rejection codes are treated as an explicit, testable unsupported result.
 */
export function syncParentDirectoryForDurability(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
  operations: DirectorySyncOperations = NODE_DIRECTORY_SYNC,
): DirectorySyncResult {
  let descriptor: number | undefined;
  let operationError: unknown;
  try {
    descriptor = operations.openDirectory(dirname(filePath));
    operations.sync(descriptor);
  } catch (error) {
    operationError = error;
  }

  let closeError: unknown;
  if (descriptor !== undefined) {
    try {
      operations.close(descriptor);
    } catch (error) {
      closeError = error;
    }
  }

  const failures = [operationError, closeError].filter(
    (failure): failure is NonNullable<unknown> => failure !== undefined,
  );
  if (failures.length === 0) return "SYNCED";
  if (
    platform === "win32" &&
    failures.every((failure) =>
      WINDOWS_UNSUPPORTED_DIRECTORY_SYNC_CODES.has(errorCode(failure) ?? ""),
    )
  ) {
    return "UNSUPPORTED_ON_WINDOWS";
  }
  const failure =
    failures.find(
      (candidate) =>
        !WINDOWS_UNSUPPORTED_DIRECTORY_SYNC_CODES.has(errorCode(candidate) ?? ""),
    ) ?? failures[0];
  throw new Error(
    `Could not sync parent directory for durable file creation: ${failure instanceof Error ? failure.message : String(failure)}`,
    { cause: failure },
  );
}
