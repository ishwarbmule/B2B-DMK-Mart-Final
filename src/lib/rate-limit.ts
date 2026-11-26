/**
 * In-memory sliding-window rate limiter for the auth endpoints (login brute-force
 * guard). Serverless caveat: every instance keeps its own counters, so this is a
 * per-instance throttle — it still slows credential stuffing down massively and
 * pairs with the lockout messaging. Keyed by IP + identifier.
 */
const buckets = new Map<string, number[]>();

/** true = allowed; false = over the limit. */
export function rateLimit(key: string, opts?: { limit?: number; windowMs?: number }): boolean {
  const limit = opts?.limit ?? 8;
  const windowMs = opts?.windowMs ?? 5 * 60 * 1000;
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  // opportunistic cleanup so the map never grows unbounded
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return true;
}

/** Best-effort client IP from the Vercel proxy headers. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
