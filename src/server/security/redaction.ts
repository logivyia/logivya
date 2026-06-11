const SENSITIVE_KEYS = /password|secret|token|authorization|cookie|session|credential|api[-_]?key/i;

export function redactSensitive<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactSensitive) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEYS.test(key) ? "[REDACTED]" : redactSensitive(item)])) as T;
  }
  return value;
}
