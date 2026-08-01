import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_EXPERIMENT_FILE_BYTES,
  createExperimentStorage,
  downloadExperimentFile,
  readExperimentFile,
} from "./experiment-storage";

const originalIndexedDbDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "indexedDB",
);

function setIndexedDb(factory: IDBFactory | undefined): void {
  Object.defineProperty(globalThis, "indexedDB", {
    value: factory,
    configurable: true,
  });
}

function createRequest<T>(result: T, error: DOMException | null = null): IDBRequest<T> {
  const request = new EventTarget();
  Object.defineProperties(request, {
    result: { get: () => result },
    error: { get: () => error },
  });
  return request as IDBRequest<T>;
}

function createOpenRequest(
  database: IDBDatabase | undefined,
  error: DOMException | null = null,
): IDBOpenDBRequest {
  const request = createRequest(database, error);
  Object.defineProperty(request, "transaction", { get: () => null });
  return request as IDBOpenDBRequest;
}

function installOpenEvent(
  type: "success" | "error" | "blocked",
  database?: IDBDatabase,
): ReturnType<typeof vi.fn> {
  const error =
    type === "error" ? new DOMException("Storage access denied.", "SecurityError") : null;
  const request = createOpenRequest(database, error);
  const open = vi.fn(() => {
    queueMicrotask(() => request.dispatchEvent(new Event(type)));
    return request;
  });
  setIndexedDb({ open } as unknown as IDBFactory);
  return open;
}

describe("experiment browser storage", () => {
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalIndexedDbDescriptor) {
      Object.defineProperty(globalThis, "indexedDB", originalIndexedDbDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "indexedDB");
    }
  });

  it("round trips and clears the active experiment through the fallback", async () => {
    setIndexedDb(undefined);
    const storage = createExperimentStorage();
    await storage.save('{"kind":"tiny-civilisation/experiment"}');
    await expect(storage.load()).resolves.toContain("tiny-civilisation/experiment");
    await storage.clear();
    await expect(storage.load()).resolves.toBeNull();
  });

  it("recovers through localStorage when opening IndexedDB errors", async () => {
    const open = installOpenEvent("error");
    const serialized = '{"name":"open-error recovery"}';
    const storage = createExperimentStorage();

    await storage.save(serialized);
    await expect(storage.load()).resolves.toBe(serialized);

    const storageAfterReload = createExperimentStorage();
    await expect(storageAfterReload.load()).resolves.toBe(serialized);
    expect(open).toHaveBeenCalledOnce();
  });

  it("falls back immediately when opening IndexedDB is blocked", async () => {
    const open = installOpenEvent("blocked");
    const storage = createExperimentStorage();

    await storage.save('{"name":"blocked recovery"}');

    await expect(storage.load()).resolves.toContain("blocked recovery");
    expect(open).toHaveBeenCalledOnce();
  });

  it("times out a silent IndexedDB open instead of hanging", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const request = createOpenRequest(undefined);
    const open = vi.fn(() => request);
    setIndexedDb({ open } as unknown as IDBFactory);
    const storage = createExperimentStorage();

    const save = expect(
      storage.save('{"name":"timeout recovery"}'),
    ).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(1_500);

    await save;
    await expect(storage.load()).resolves.toContain("timeout recovery");
    expect(open).toHaveBeenCalledOnce();
  });

  it("falls back when an IndexedDB write transaction aborts", async () => {
    const writeRequest = createRequest(undefined);
    const transactionError = new DOMException("Write aborted.", "AbortError");
    const transaction = new EventTarget();
    Object.defineProperties(transaction, {
      error: { get: () => transactionError },
      objectStore: {
        value: () => ({
          put: () => {
            queueMicrotask(() => {
              writeRequest.dispatchEvent(new Event("success"));
              transaction.dispatchEvent(new Event("abort"));
            });
            return writeRequest;
          },
        }),
      },
    });
    const close = vi.fn();
    const database = {
      objectStoreNames: { contains: () => true },
      transaction: () => transaction as IDBTransaction,
      close,
    } as unknown as IDBDatabase;
    const open = installOpenEvent("success", database);
    const storage = createExperimentStorage();

    await storage.save('{"name":"transaction recovery"}');

    await expect(storage.load()).resolves.toContain("transaction recovery");
    expect(open).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects oversized imports before reading them", async () => {
    const file = new File([new Uint8Array(MAX_EXPERIMENT_FILE_BYTES + 1)], "large.json");
    await expect(readExperimentFile(file)).rejects.toThrow("must be 8 MB or smaller");
  });

  it("downloads a JSON file with a stable filename", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    downloadExperimentFile("{}", "experiment.tinyciv.json");

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
});
