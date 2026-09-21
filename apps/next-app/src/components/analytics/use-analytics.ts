"use client";

import { useEffect, useState } from "react";

const FRESH_FOR_MS = 30_000;
const MAX_STALE_FOR_MS = 5 * 60_000;

type CacheEntry = {
  data: unknown;
  updatedAt: number;
  inFlight?: Promise<unknown>;
};

const analyticsCache = new Map<string, CacheEntry>();

function cacheKey(endpoint: string, range: string): string {
  // The host is part of the tenant boundary even when the API URL only
  // contains a workspace slug.
  const scope = typeof window === "undefined" ? "server" : window.location.host;
  return `${scope}:${endpoint}:${range}`;
}

function requestAnalytics<T>(url: string, key: string): Promise<T> {
  const existing = analyticsCache.get(key);
  if (existing?.inFlight) return existing.inFlight as Promise<T>;

  const request = fetch(url, { credentials: "same-origin" })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    })
    .then((data) => {
      analyticsCache.set(key, { data, updatedAt: Date.now() });
      return data;
    })
    .finally(() => {
      const current = analyticsCache.get(key);
      if (current?.inFlight === request) {
        analyticsCache.set(key, {
          data: current.data,
          updatedAt: current.updatedAt,
        });
      }
    });

  analyticsCache.set(key, {
    data: existing?.data,
    updatedAt: existing?.updatedAt ?? 0,
    inFlight: request,
  });
  return request;
}

export function clearAnalyticsCache() {
  analyticsCache.clear();
}

export function useAnalytics<T>(endpoint: string, range: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const url = `${endpoint}${endpoint.includes("?") ? "&" : "?"}range=${range}`;
    const key = cacheKey(endpoint, range);
    const cached = analyticsCache.get(key);
    const age = cached
      ? Date.now() - cached.updatedAt
      : Number.POSITIVE_INFINITY;
    const hasUsableCache = cached?.data !== undefined && age < MAX_STALE_FOR_MS;

    if (hasUsableCache) {
      setData(cached.data as T);
      setLoading(false);
    } else {
      setLoading(true);
    }

    if (cached && age < FRESH_FOR_MS)
      return () => {
        cancelled = true;
      };

    requestAnalytics<T>(url, key)
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        // Keep stale rows visible when revalidation fails.
        if (!cancelled && !hasUsableCache) {
          setError(err instanceof Error ? err.message : "Failed");
        }
      })
      .finally(() => {
        if (!cancelled && !hasUsableCache) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, range]);

  return { data, loading, error };
}

export function computeDelta(total: number, prev: number): number | null {
  if (prev === 0) return total === 0 ? 0 : null;
  return ((total - prev) / prev) * 100;
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatTick(date: string): string {
  // YYYY-MM-DD -> MMM D
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
