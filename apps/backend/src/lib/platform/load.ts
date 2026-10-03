import "server-only";
import {
  type PlatformAdminClient,
  platformAdmin,
} from "@repo/core/control-plane/admin-client";
import {
  ControlPlaneConfigError,
  ControlPlaneNotFoundError,
  ControlPlaneUnavailableError,
} from "@repo/core/control-plane/errors";

type UnavailableReason =
  | "not_configured"
  | "rejected"
  | "unreachable"
  | "not_found"
  | "error";

export type Loaded<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable"; reason: UnavailableReason; message: string };

const NOT_DEPLOYED =
  "The control plane isn't reachable, so the cluster probably isn't deployed yet.";

/** Turns a failed control-plane call into something a page can show instead of crashing. */
export function toUnavailable(error: unknown): Loaded<never> {
  if (error instanceof ControlPlaneConfigError) {
    return {
      status: "unavailable",
      reason: "not_configured",
      message: `${NOT_DEPLOYED} ALLOYDB_ADMIN_API_TOKEN is not set for this portal.`,
    };
  }
  if (error instanceof ControlPlaneNotFoundError) {
    return {
      status: "unavailable",
      reason: "not_found",
      message: error.message,
    };
  }
  if (error instanceof ControlPlaneUnavailableError) {
    if (error.code === "unreachable") {
      return {
        status: "unavailable",
        reason: "unreachable",
        message: `${NOT_DEPLOYED} ${error.message}`,
      };
    }
    if (error.status === 401 || error.status === 403) {
      return {
        status: "unavailable",
        reason: "rejected",
        message:
          "The control plane rejected this portal's admin token. Check that ALLOYDB_ADMIN_API_TOKEN here matches the control plane's.",
      };
    }
    return { status: "unavailable", reason: "error", message: error.message };
  }
  console.error("Platform admin call failed:", error);
  return {
    status: "unavailable",
    reason: "error",
    message: "Something went wrong while asking the control plane.",
  };
}

/** Runs one admin-API read for a page; never throws. */
export async function loadPlatform<T>(
  read: (client: PlatformAdminClient) => Promise<T>,
): Promise<Loaded<T>> {
  try {
    return { status: "ok", data: await read(platformAdmin()) };
  } catch (error) {
    return toUnavailable(error);
  }
}
