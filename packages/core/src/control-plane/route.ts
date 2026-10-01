import "server-only";
import { NextResponse } from "next/server";
import { type ProjectAccess, requireProjectAccess } from "./access";
import { type ControlPlaneClient, controlPlaneFor } from "./client";
import {
  ControlPlaneBusyError,
  ControlPlaneConfigError,
  ControlPlaneNotFoundError,
  ControlPlaneRequestError,
  ControlPlaneUnavailableError,
} from "./errors";

function fail(status: number, error: string, code: string) {
  return NextResponse.json({ error, code }, { status });
}

/** Maps a control-plane failure to the JSON error the Databases UI shows. */
function controlPlaneErrorResponse(error: unknown): Response {
  if (error instanceof ControlPlaneBusyError) {
    return fail(423, "Another change is in progress.", "busy");
  }
  if (error instanceof ControlPlaneNotFoundError) {
    return fail(404, error.message, error.code);
  }
  if (error instanceof ControlPlaneRequestError) {
    return fail(error.status, error.message, error.code);
  }
  if (error instanceof ControlPlaneConfigError) {
    console.error(error.message);
    return fail(503, "Databases are not set up for this site yet.", error.code);
  }
  if (error instanceof ControlPlaneUnavailableError) {
    console.error("Control plane unavailable:", error.message);
    return fail(
      502,
      "The database service is unavailable. Try again shortly.",
      "unavailable",
    );
  }
  console.error("Databases route failed:", error);
  return fail(500, "Internal server error", "internal");
}

/**
 * Runs one control-plane call for a console project: session, tenant and
 * membership first, then the call with the organization and project taken from
 * the console database. Nothing from the request selects either id.
 */
export async function withProjectControlPlane<T>(
  projectId: string,
  options: { write: boolean; status?: number },
  run: (cp: ControlPlaneClient, access: ProjectAccess) => Promise<T>,
): Promise<Response> {
  const access = await requireProjectAccess(projectId, {
    write: options.write,
  });
  if (!access.ok) {
    const code = { 401: "unauthorized", 403: "forbidden", 404: "not_found" };
    return fail(access.status, access.message, code[access.status]);
  }
  try {
    const result = await run(
      controlPlaneFor(access.access.scope),
      access.access,
    );
    return NextResponse.json(result, { status: options.status ?? 200 });
  } catch (error) {
    return controlPlaneErrorResponse(error);
  }
}
