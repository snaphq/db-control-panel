import { startPlatformOperation } from "@/lib/platform/actions";

/** Moves one safekeeper if the layout calls for it; 202 `{operation}` or 409 `platform_busy`. */
export async function POST() {
  return startPlatformOperation("spread");
}
