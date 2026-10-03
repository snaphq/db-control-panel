import { startPlatformOperation } from "@/lib/platform/actions";

/** Starts a pageserver rebalance; 202 `{operation}` or 409 `platform_busy`. */
export async function POST() {
  return startPlatformOperation("rebalance");
}
