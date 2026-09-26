import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

// In-memory store for rate limiting when Upstash is not configured
const inMemoryStore = new Map<string, { count: number; resetAt: number }>();

// Default rate limit settings for password reset
const PASSWORD_RESET_LIMIT = 3; // requests
const PASSWORD_RESET_WINDOW = 15 * 60 * 1000; // 15 minutes in ms

/**
 * Get Upstash Redis client if configured
 */
function getUpstashClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  return new Redis({ url, token });
}

/**
 * Create Upstash rate limiter if configured
 */
function getUpstashRateLimiter(): Ratelimit | null {
  const redis = getUpstashClient();
  if (!redis) {
    return null;
  }

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(PASSWORD_RESET_LIMIT, "15 m"),
    analytics: true,
    prefix: "ratelimit:password-reset:",
  });
}

/**
 * In-memory rate limiting fallback
 */
function checkInMemoryRateLimit(identifier: string): RateLimitResult {
  const now = Date.now();
  const key = `password-reset:${identifier}`;
  const existing = inMemoryStore.get(key);

  // Clean up expired entries periodically
  if (inMemoryStore.size > 1000) {
    for (const [k, v] of Array.from(inMemoryStore.entries())) {
      if (v.resetAt < now) {
        inMemoryStore.delete(k);
      }
    }
  }

  // If no existing entry or expired, create new one
  if (!existing || existing.resetAt < now) {
    inMemoryStore.set(key, {
      count: 1,
      resetAt: now + PASSWORD_RESET_WINDOW,
    });
    return {
      success: true,
      remaining: PASSWORD_RESET_LIMIT - 1,
      reset: now + PASSWORD_RESET_WINDOW,
    };
  }

  // Check if limit exceeded
  if (existing.count >= PASSWORD_RESET_LIMIT) {
    return {
      success: false,
      remaining: 0,
      reset: existing.resetAt,
    };
  }

  // Increment counter
  existing.count++;
  return {
    success: true,
    remaining: PASSWORD_RESET_LIMIT - existing.count,
    reset: existing.resetAt,
  };
}

/**
 * Check rate limit for password reset requests
 * Uses Upstash Redis if configured, otherwise falls back to in-memory
 */
export async function checkPasswordResetRateLimit(
  identifier: string,
): Promise<RateLimitResult> {
  const upstashLimiter = getUpstashRateLimiter();

  if (upstashLimiter) {
    try {
      const result = await upstashLimiter.limit(identifier);
      return {
        success: result.success,
        remaining: result.remaining,
        reset: result.reset,
      };
    } catch (error) {
      console.error(
        "[RateLimit] Upstash error, falling back to in-memory:",
        error,
      );
      // Fall through to in-memory
    }
  }

  return checkInMemoryRateLimit(identifier);
}

/**
 * Check if Upstash is configured for rate limiting
 */
export function isUpstashConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}
