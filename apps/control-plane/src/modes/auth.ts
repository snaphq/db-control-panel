import { createHash, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

const digest = (value: string): Buffer =>
  createHash('sha256').update(value).digest();

/**
 * Constant-time string comparison. Both sides are hashed first so the compared
 * buffers always have equal length, which also hides the token's length.
 */
export function safeEqual(received: string, expected: string): boolean {
  return timingSafeEqual(digest(received), digest(expected));
}

const BEARER_PREFIX = /^Bearer\s+(.+)$/i;

/** Requires `Authorization: Bearer <token>` matching `expected`; responds 401 otherwise. */
export function bearerAuth(expected: string): MiddlewareHandler {
  return async (c, next) => {
    const match = BEARER_PREFIX.exec(c.req.header('authorization') ?? '');
    if (!match?.[1] || !safeEqual(match[1].trim(), expected)) {
      return c.json(
        {
          error: {
            code: 'unauthorized',
            message: 'Invalid or missing bearer token',
          },
        },
        401,
        { 'WWW-Authenticate': 'Bearer' },
      );
    }
    await next();
  };
}
