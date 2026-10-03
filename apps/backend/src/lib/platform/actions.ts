import "server-only";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdminSession } from "@/lib/admin-auth";
import {
  type PlatformAdminClient,
  platformAdmin,
} from "@repo/core/control-plane/admin-client";
import {
  ControlPlaneConfigError,
  ControlPlaneConflictError,
  ControlPlaneNotFoundError,
  ControlPlaneRequestError,
  ControlPlaneUnavailableError,
} from "@repo/core/control-plane/errors";
import { NextResponse } from "next/server";

/** The two platform operations an admin can start, and what the audit log calls them. */
const ACTIONS = {
  rebalance: {
    audit: "admin_pageservers_rebalance_started",
    start: (client: PlatformAdminClient) => client.rebalancePageservers(),
  },
  spread: {
    audit: "admin_safekeepers_spread_started",
    start: (client: PlatformAdminClient) => client.spreadSafekeepers(),
  },
} as const;

export type PlatformAction = keyof typeof ACTIONS;

function fail(status: number, error: string, code: string, extra = {}) {
  return NextResponse.json({ error, code, ...extra }, { status });
}

/** The operation that holds the platform lock, so the UI can link to it; best effort. */
async function findActiveOperationId(
  client: PlatformAdminClient,
): Promise<string | null> {
  try {
    const page = await client.listOperations({ status: "active", limit: 1 });
    return page.operations[0]?.id ?? null;
  } catch (error) {
    console.error("Could not look up the active platform operation:", error);
    return null;
  }
}

/** Maps a failed start to the JSON error the Platform buttons show. */
async function startFailure(
  error: unknown,
  client: PlatformAdminClient | null,
): Promise<Response> {
  if (error instanceof ControlPlaneConflictError) {
    if (error.code === "platform_busy") {
      return fail(
        409,
        "Another platform operation is already running. Wait for it to finish, then try again.",
        "platform_busy",
        {
          active_operation_id: client
            ? await findActiveOperationId(client)
            : null,
        },
      );
    }
    return fail(409, error.message, error.code);
  }
  if (
    error instanceof ControlPlaneNotFoundError ||
    error instanceof ControlPlaneRequestError
  ) {
    return fail(error.status, error.message, error.code);
  }
  if (error instanceof ControlPlaneConfigError) {
    console.error(error.message);
    return fail(
      503,
      "The control plane isn't connected: ALLOYDB_ADMIN_API_TOKEN is not set.",
      error.code,
    );
  }
  if (error instanceof ControlPlaneUnavailableError) {
    console.error("Control plane unavailable:", error.message);
    return fail(502, "The control plane is unavailable.", "unavailable");
  }
  console.error("Platform action failed:", error);
  return fail(500, "Internal server error", "internal");
}

/**
 * Starts a platform operation for the signed-in admin: session check, the
 * control-plane call, then an `admin_audit_log` entry naming the operation.
 * Answers 202 `{operation}`; 409 `platform_busy` when another one is running.
 */
export async function startPlatformOperation(
  action: PlatformAction,
): Promise<Response> {
  const session = await getAdminSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let client: PlatformAdminClient | null = null;
  try {
    client = platformAdmin();
    const { operation } = await ACTIONS[action].start(client);
    try {
      await logAdminAction({ id: session.user.id }, ACTIONS[action].audit, {
        operation_id: operation.id,
        action: operation.action,
      });
    } catch (error) {
      // The operation is already running; reporting a failure would invite a
      // retry that the control plane would refuse as platform_busy.
      console.error(`Could not audit ${ACTIONS[action].audit}:`, error);
    }
    return NextResponse.json({ operation }, { status: 202 });
  } catch (error) {
    return startFailure(error, client);
  }
}
