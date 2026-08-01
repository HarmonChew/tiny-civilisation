export const MAX_EXPERIMENT_FILE_BYTES = 8 * 1024 * 1024;

const DATABASE_NAME = "tiny-civilisation";
const DATABASE_VERSION = 1;
const STORE_NAME = "experiment-saves";
const ACTIVE_EXPERIMENT_KEY = "active-experiment";
const FALLBACK_STORAGE_KEY = "tiny-civilisation/active-experiment/v1";
const FALLBACK_AUTHORITY_KEY =
  "tiny-civilisation/active-experiment/fallback-authoritative/v1";
const INDEXED_DB_OPEN_TIMEOUT_MS = 1_500;

export interface ExperimentStorage {
  load(): Promise<string | null>;
  save(serialized: string): Promise<void>;
  clear(): Promise<void>;
}

function assertWithinStorageLimit(serialized: string): void {
  const size = new Blob([serialized]).size;
  if (size > MAX_EXPERIMENT_FILE_BYTES) {
    throw new Error(
      `The experiment is ${(size / (1024 * 1024)).toFixed(1)} MB; the current limit is ${MAX_EXPERIMENT_FILE_BYTES / (1024 * 1024)} MB.`,
    );
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("Browser storage request failed.")),
      { once: true },
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener(
      "abort",
      () => reject(transaction.error ?? new Error("Browser storage transaction aborted.")),
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () => reject(transaction.error ?? new Error("Browser storage transaction failed.")),
      { once: true },
    );
  });
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  let request: IDBOpenDBRequest;
  try {
    request = factory.open(DATABASE_NAME, DATABASE_VERSION);
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Browser storage did not open in time."));
    }, INDEXED_DB_OPEN_TIMEOUT_MS);

    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      reject(error);
    };

    request.addEventListener(
      "upgradeneeded",
      () => {
        try {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME);
          }
        } catch (error) {
          try {
            request.transaction?.abort();
          } catch {
            // The upgrade may already have aborted. The original error is more useful.
          }
          rejectOnce(error);
        }
      },
      { once: true },
    );
    request.addEventListener(
      "success",
      () => {
        if (settled) {
          request.result.close();
          return;
        }
        settled = true;
        globalThis.clearTimeout(timeout);
        resolve(request.result);
      },
      { once: true },
    );
    request.addEventListener(
      "error",
      () => rejectOnce(request.error ?? new Error("Browser storage could not be opened.")),
      { once: true },
    );
    request.addEventListener(
      "blocked",
      () => rejectOnce(new Error("Browser storage opening was blocked.")),
      { once: true },
    );
  });
}

function createIndexedDbStorage(factory: IDBFactory): ExperimentStorage {
  return {
    async load() {
      const database = await openDatabase(factory);
      try {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(ACTIVE_EXPERIMENT_KEY);
        const [value] = await Promise.all([
          requestResult(request),
          transactionComplete(transaction),
        ]);
        return typeof value === "string" ? value : null;
      } finally {
        database.close();
      }
    },
    async save(serialized) {
      assertWithinStorageLimit(serialized);
      const database = await openDatabase(factory);
      try {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const request = transaction
          .objectStore(STORE_NAME)
          .put(serialized, ACTIVE_EXPERIMENT_KEY);
        await Promise.all([requestResult(request), transactionComplete(transaction)]);
      } finally {
        database.close();
      }
    },
    async clear() {
      const database = await openDatabase(factory);
      try {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const request = transaction.objectStore(STORE_NAME).delete(ACTIVE_EXPERIMENT_KEY);
        await Promise.all([requestResult(request), transactionComplete(transaction)]);
      } finally {
        database.close();
      }
    },
  };
}

interface LocalStorageFallback extends ExperimentStorage {
  isAuthoritative(): boolean;
  releaseAuthority(): void;
}

function createLocalStorageFallback(): LocalStorageFallback {
  return {
    async load() {
      return localStorage.getItem(FALLBACK_STORAGE_KEY);
    },
    async save(serialized) {
      assertWithinStorageLimit(serialized);
      localStorage.setItem(FALLBACK_STORAGE_KEY, serialized);
      localStorage.setItem(FALLBACK_AUTHORITY_KEY, "true");
    },
    async clear() {
      localStorage.removeItem(FALLBACK_STORAGE_KEY);
      localStorage.setItem(FALLBACK_AUTHORITY_KEY, "true");
    },
    isAuthoritative() {
      return localStorage.getItem(FALLBACK_AUTHORITY_KEY) === "true";
    },
    releaseAuthority() {
      localStorage.removeItem(FALLBACK_AUTHORITY_KEY);
    },
  };
}

function createResilientStorage(
  indexedDbStorage: ExperimentStorage,
  fallback: LocalStorageFallback,
): ExperimentStorage {
  let indexedDbFailed = false;

  const loadFallback = async (): Promise<string | null> => fallback.load();

  return {
    async load() {
      try {
        const fallbackValue = await loadFallback();
        if (fallback.isAuthoritative() || fallbackValue !== null) {
          return fallbackValue;
        }
      } catch {
        // IndexedDB may still be available when localStorage is denied.
      }

      if (indexedDbFailed) return loadFallback();

      try {
        return await indexedDbStorage.load();
      } catch {
        indexedDbFailed = true;
        return loadFallback();
      }
    },
    async save(serialized) {
      assertWithinStorageLimit(serialized);
      if (indexedDbFailed) {
        await fallback.save(serialized);
        return;
      }

      try {
        await indexedDbStorage.save(serialized);
        await fallback.clear();
        fallback.releaseAuthority();
      } catch {
        indexedDbFailed = true;
        await fallback.save(serialized);
      }
    },
    async clear() {
      if (indexedDbFailed) {
        await fallback.clear();
        return;
      }

      try {
        await indexedDbStorage.clear();
        await fallback.clear();
        fallback.releaseAuthority();
      } catch {
        indexedDbFailed = true;
        await fallback.clear();
      }
    },
  };
}

export function createExperimentStorage(): ExperimentStorage {
  const fallback = createLocalStorageFallback();
  const factory = globalThis.indexedDB;
  return factory === undefined
    ? fallback
    : createResilientStorage(createIndexedDbStorage(factory), fallback);
}

export async function readExperimentFile(file: File): Promise<string> {
  if (file.size > MAX_EXPERIMENT_FILE_BYTES) {
    throw new Error(
      `That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB; experiment files must be ${MAX_EXPERIMENT_FILE_BYTES / (1024 * 1024)} MB or smaller.`,
    );
  }
  return file.text();
}

export function downloadExperimentFile(serialized: string, filename: string): void {
  assertWithinStorageLimit(serialized);
  const url = URL.createObjectURL(
    new Blob([serialized], { type: "application/json;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
