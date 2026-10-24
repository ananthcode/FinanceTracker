import type { ErrorCode } from "@ft/core";

/** A known API failure mapped to the contract error shape (contracts/http-api.md). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const errors = {
  validation: (msg = "The request is not valid.") => new ApiError(400, "VALIDATION_FAILED", msg),
  unauthenticated: () => new ApiError(401, "UNAUTHENTICATED", "Please sign in."),
  inactive: () => new ApiError(401, "USER_INACTIVE", "Your access has been disabled."),
  forbidden: () => new ApiError(403, "FORBIDDEN", "You don't have access to this."),
  notFound: () => new ApiError(404, "NOT_FOUND", "Not found."),
  tryLater: () => new ApiError(429, "TRY_LATER", "Too many requests. Please try again later."),
};

export function newErrorId(): string {
  return crypto.randomUUID();
}

export function errorResponse(err: ApiError, errorId: string): Response {
  return Response.json(
    {
      error: {
        code: err.code,
        message: err.message,
        errorId,
        ...(err.retryAfter !== undefined ? { retryAfter: err.retryAfter } : {}),
      },
    },
    {
      status: err.status,
      headers: err.retryAfter !== undefined ? { "Retry-After": String(err.retryAfter) } : undefined,
    },
  );
}
