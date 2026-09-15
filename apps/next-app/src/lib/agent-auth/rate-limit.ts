import "server-only";

import { getRedis } from "@/lib/redis";
import { Ratelimit } from "@upstash/ratelimit";

const WINDOW_MS = 60 * 60 * 1000;
const ANONYMOUS_LIMIT = 5;
const ASSERTION_LIMIT = 60;
const MAX_LOCAL_KEYS = 10_000;

type LocalWindow = {
  timestamps: number[];
  touchedAt: number;
};

// The local fallback is deliberately bounded. It protects a single runtime
// during development or a short Redis outage without pretending to be a
// fleet-wide rate limiter.
const localWindows = new Map<string, LocalWindow>();

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

function limitForType(type: string): number {
  return type === "anonymous" ? ANONYMOUS_LIMIT : ASSERTION_LIMIT;
}

function localKey(ip: string | null, type: string): string {
  return `${type}:${ip ?? "<missing-ip>"}`;
}

function consumeLocalFallback(
  ip: string | null,
  type: string,
  now = Date.now(),
): boolean {
  const key = localKey(ip, type);
  const cutoff = now - WINDOW_MS;
  const existing = localWindows.get(key);
  const timestamps = (existing?.timestamps ?? []).filter(
    (timestamp) => timestamp > cutoff,
  );
  if (timestamps.length >= limitForType(type)) {
    localWindows.set(key, { timestamps, touchedAt: now });
    return false;
  }

  timestamps.push(now);
  localWindows.set(key, { timestamps, touchedAt: now });

  if (localWindows.size > MAX_LOCAL_KEYS) {
    for (const [candidate, window] of localWindows) {
      if (window.timestamps.every((timestamp) => timestamp <= cutoff)) {
        localWindows.delete(candidate);
      }
    }
    // If all entries are active, evict the least recently touched entry so a
    // hostile stream of spoofed IP headers cannot grow the process forever.
    if (localWindows.size > MAX_LOCAL_KEYS) {
      const oldest = [...localWindows.entries()].reduce((current, entry) =>
        entry[1].touchedAt < current[1].touchedAt ? entry : current,
      );
      localWindows.delete(oldest[0]);
    }
  }
  return true;
}

// Spec defaults: per-IP 5/hour for anonymous, 60/hour for identity_assertion.
function create(
  limit: number,
  window: `${number} ${"s" | "m" | "h"}`,
): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: true,
    prefix: "agent-auth",
  });
}

const anonymousLimiter = create(5, "1 h");
const assertionLimiter = create(60, "1 h");

export async function checkAgentIdentityRateLimit(
  ip: string | null,
  type: string,
): Promise<boolean> {
  // A missing client address cannot be safely rate-limited in production. Do
  // not turn a proxy/header configuration error into an abuse bypass.
  if (!ip && isProductionRuntime()) return false;

  const limiter = type === "anonymous" ? anonymousLimiter : assertionLimiter;
  const key = localKey(ip, type);
  try {
    if (limiter) {
      const { success } = await limiter.limit(key);
      return success;
    }
  } catch {
    // A distributed-store error is an explicit availability signal. Production
    // fails closed; local development gets the bounded per-process fallback.
    if (isProductionRuntime()) return false;
  }

  if (isProductionRuntime()) return false;
  return consumeLocalFallback(ip, type);
}
