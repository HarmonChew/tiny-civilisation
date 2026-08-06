export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJson[]
  | { readonly [key: string]: CanonicalJson };

function canonicalValue(value: unknown, path: string): CanonicalJson {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error(
        `Phase 4.2 definition contract contains a non-canonical number at ${path}.`,
      );
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalValue(item, `${path}[${index}]`));
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(
        `Phase 4.2 definition contract contains a non-plain object at ${path}.`,
      );
    }
    const normalized: Record<string, CanonicalJson> = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) {
        throw new Error(
          `Phase 4.2 definition contract contains undefined at ${path}.${key}.`,
        );
      }
      normalized[key] = canonicalValue(item, `${path}.${key}`);
    }
    return normalized;
  }
  throw new Error(
    `Phase 4.2 definition contract contains unsupported ${typeof value} at ${path}.`,
  );
}

/** Stable canonical bytes: object keys sort recursively; array order is semantic. */
export function canonicalPhase42DefinitionJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value, "$"));
}
