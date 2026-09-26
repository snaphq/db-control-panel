export type ErrorWithCode = Error & {
  code?: string;
};

function isErrorLike(
  error: unknown,
): error is { message?: unknown; code?: unknown } {
  return typeof error === "object" && error !== null;
}

export function getErrorMessage(
  error: unknown,
  fallback = "Internal server error",
): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (isErrorLike(error) && typeof error.message === "string") {
    return error.message;
  }

  return fallback;
}

export function getErrorCode(error: unknown): string | undefined {
  if (isErrorLike(error) && typeof error.code === "string") {
    return error.code;
  }

  return undefined;
}

export function createErrorWithCode(
  message: string,
  code?: string,
): ErrorWithCode {
  const error = new Error(message) as ErrorWithCode;

  if (code) {
    error.code = code;
  }

  return error;
}
