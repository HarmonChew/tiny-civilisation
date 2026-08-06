import { describe, expect, it, vi } from "vitest";

import {
  syncParentDirectoryForDurability,
  type DirectorySyncOperations,
} from "./durable-file.js";

function codedError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe("durable file creation", () => {
  it("opens, syncs, and closes the parent directory on POSIX", () => {
    const operations: DirectorySyncOperations = {
      openDirectory: vi.fn(() => 17),
      sync: vi.fn(),
      close: vi.fn(),
    };

    expect(
      syncParentDirectoryForDurability(
        "/evidence/holdout.attempt.json",
        "linux",
        operations,
      ),
    ).toBe("SYNCED");
    expect(operations.openDirectory).toHaveBeenCalledWith("/evidence");
    expect(operations.sync).toHaveBeenCalledWith(17);
    expect(operations.close).toHaveBeenCalledWith(17);
  });

  it("reports unsupported Windows directory fsync while still closing an opened handle", () => {
    const operations: DirectorySyncOperations = {
      openDirectory: vi.fn(() => 23),
      sync: vi.fn(() => {
        throw codedError("EINVAL");
      }),
      close: vi.fn(),
    };

    expect(
      syncParentDirectoryForDurability(
        "C:\\evidence\\holdout.attempt.json",
        "win32",
        operations,
      ),
    ).toBe("UNSUPPORTED_ON_WINDOWS");
    expect(operations.close).toHaveBeenCalledWith(23);
  });

  it("treats a Windows directory-open rejection as explicitly unsupported", () => {
    const operations: DirectorySyncOperations = {
      openDirectory: vi.fn(() => {
        throw codedError("EACCES");
      }),
      sync: vi.fn(),
      close: vi.fn(),
    };

    expect(
      syncParentDirectoryForDurability(
        "C:\\evidence\\holdout.attempt.json",
        "win32",
        operations,
      ),
    ).toBe("UNSUPPORTED_ON_WINDOWS");
    expect(operations.sync).not.toHaveBeenCalled();
    expect(operations.close).not.toHaveBeenCalled();
  });

  it("fails closed for POSIX errors and unexpected Windows errors", () => {
    const posixOperations: DirectorySyncOperations = {
      openDirectory: vi.fn(() => 31),
      sync: vi.fn(() => {
        throw codedError("EIO");
      }),
      close: vi.fn(),
    };
    expect(() =>
      syncParentDirectoryForDurability(
        "/evidence/holdout.attempt.json",
        "linux",
        posixOperations,
      ),
    ).toThrow("Could not sync parent directory");
    expect(posixOperations.close).toHaveBeenCalledWith(31);

    const windowsOperations: DirectorySyncOperations = {
      openDirectory: vi.fn(() => 37),
      sync: vi.fn(() => {
        throw codedError("EIO");
      }),
      close: vi.fn(),
    };
    expect(() =>
      syncParentDirectoryForDurability(
        "C:\\evidence\\holdout.attempt.json",
        "win32",
        windowsOperations,
      ),
    ).toThrow("Could not sync parent directory");
  });

  it("does not hide a close failure after a successful directory sync", () => {
    const operations: DirectorySyncOperations = {
      openDirectory: vi.fn(() => 41),
      sync: vi.fn(),
      close: vi.fn(() => {
        throw codedError("EIO");
      }),
    };

    expect(() =>
      syncParentDirectoryForDurability(
        "/evidence/holdout.attempt.json",
        "linux",
        operations,
      ),
    ).toThrow("Could not sync parent directory");
  });

  it("does not hide an unexpected Windows close failure behind an unsupported sync code", () => {
    const operations: DirectorySyncOperations = {
      openDirectory: vi.fn(() => 43),
      sync: vi.fn(() => {
        throw codedError("EINVAL");
      }),
      close: vi.fn(() => {
        throw codedError("EIO");
      }),
    };

    expect(() =>
      syncParentDirectoryForDurability(
        "C:\\evidence\\holdout.attempt.json",
        "win32",
        operations,
      ),
    ).toThrow("EIO");
  });
});
