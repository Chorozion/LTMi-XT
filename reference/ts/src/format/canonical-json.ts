// Minimal canonical JSON serialization (RFC 8785 subset) used for
// content-addressed identifier derivation in §4.4 of the format spec.
//
// We only need enough determinism to make hash-derived ids stable:
//   - keys sorted lexicographically at every object level
//   - no whitespace
//   - numbers written in their shortest round-tripped form
//   - strings JSON-escaped per ECMA-404
//
// Full RFC 8785 has additional rules around number normalization that
// aren't necessary for our use case. We document this restriction.

export function canonicalJson(value: unknown): string {
  return stringify(value);
}

function stringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Canonical JSON does not support non-finite numbers.");
    }
    return numberCanon(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stringify).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined) continue;
      parts.push(JSON.stringify(k) + ":" + stringify(v));
    }
    return "{" + parts.join(",") + "}";
  }
  throw new Error(`Canonical JSON cannot serialize: ${typeof value}`);
}

function numberCanon(n: number): string {
  // For our purposes (integer offsets, [0,1] confidence/decay), the JS
  // default representation is already canonical. Strip trailing ".0" only
  // for integers.
  if (Number.isInteger(n)) return String(n);
  return String(n);
}
