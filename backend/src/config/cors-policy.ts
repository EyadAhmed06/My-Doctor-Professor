export function parseAllowedOrigins(
  frontendUrl: unknown,
  additionalOrigins: unknown,
  nodeEnvironment: unknown,
): ReadonlySet<string> {
  const values = [
    String(frontendUrl ?? '').trim(),
    ...String(additionalOrigins ?? '').split(',').map((value) => value.trim()),
  ].filter(Boolean);

  if (!values.length && String(nodeEnvironment ?? 'development') !== 'production') {
    values.push('http://localhost:3001');
  }

  const origins = new Set<string>();
  for (const value of values) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`Invalid CORS origin: ${value}`);
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value.replace(/\/$/, '')) {
      throw new Error(`CORS origins must be absolute HTTP(S) origins without paths: ${value}`);
    }
    if (String(nodeEnvironment) === 'production' && url.protocol !== 'https:') {
      throw new Error(`Production CORS origins must use HTTPS: ${value}`);
    }
    origins.add(url.origin);
  }
  if (!origins.size) throw new Error('At least one trusted frontend origin must be configured');
  return origins;
}

export function isAllowedOrigin(origin: string | undefined, allowed: ReadonlySet<string>): boolean {
  if (!origin) return true;
  try {
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}
