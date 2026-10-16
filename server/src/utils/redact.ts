const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'newpassword',
  'currentpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'managementtoken',
  'resettoken',
  'signature',
  'secret',
  'apikey',
  'razorpay_key_secret',
  'smtppass',
  'authorization',
  'cookie',
];

export function redact<T>(value: T, extraKeys: string[] = []): T {
  const keys = new Set([...SENSITIVE_KEYS, ...extraKeys.map((k) => k.toLowerCase())]);
  return redactValue(value, keys, 0) as T;
}

function redactValue(value: unknown, keys: Set<string>, depth: number): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, keys, depth + 1));
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = keys.has(k.toLowerCase()) ? '[REDACTED]' : redactValue(v, keys, depth + 1);
    }
    return out;
  }
  return value;
}
