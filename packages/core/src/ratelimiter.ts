import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getRedis } from "./redis";

let ratelimitInstance: Ratelimit | null = null;

function createRatelimit(): Ratelimit | null {
  const redis = getRedis();
  if (!redis) {
    return null;
  }

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "10 s"),
    analytics: true,
    timeout: 10000,
  });
}

export function getRatelimit(): Ratelimit | null {
  if (ratelimitInstance) {
    return ratelimitInstance;
  }
  ratelimitInstance = createRatelimit();
  return ratelimitInstance;
}

export const ratelimit = getRatelimit();
