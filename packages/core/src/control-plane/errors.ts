/**
 * Typed failures of the control-plane client. Callers map them to HTTP
 * statuses (see `route.ts`) without inspecting message text.
 */

export class ControlPlaneError extends Error {
  /** HTTP status the control plane answered with; 0 when it never answered. */
  readonly status: number;
  /** Machine-readable code from the control plane's `{error: {code}}` body. */
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }
}

/** 423: the console project already has an operation in flight. */
export class ControlPlaneBusyError extends ControlPlaneError {
  constructor(message: string) {
    super(message, 423, "busy");
  }
}

/** 404: the resource is unknown, or belongs to another organization or project. */
export class ControlPlaneNotFoundError extends ControlPlaneError {
  constructor(message: string, code = "not_found") {
    super(message, 404, code);
  }
}

/** Other 4xx: the request was understood and refused (validation, conflict). */
export class ControlPlaneRequestError extends ControlPlaneError {}

/** 5xx, network failure, timeout, or a response that does not match the contract. */
export class ControlPlaneUnavailableError extends ControlPlaneError {}

/** `ALLOYDB_API_TOKEN` is not set: the console cannot talk to the control plane. */
export class ControlPlaneConfigError extends ControlPlaneError {
  constructor(message: string) {
    super(message, 0, "not_configured");
  }
}
