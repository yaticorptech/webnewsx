import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiErrorBody } from "../shared/contracts.js";

/** An error that maps 1:1 to an `ApiErrorBody` response. Throw it from any handler. */
export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: ContentfulStatusCode, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    if (fields) this.fields = fields;
  }

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message, ...(this.fields ? { fields: this.fields } : {}) } };
  }
}

export const notFound = (message = "Not found") => new ApiError(404, "not_found", message);
export const unauthorized = () => new ApiError(401, "unauthorized", "Please log in to continue");
export const forbidden = (message = "You can't do that") => new ApiError(403, "forbidden", message);
export const validationError = (fields: Record<string, string>, message = "Please fix the highlighted fields") =>
  new ApiError(400, "validation_error", message, fields);

/** Postgres unique-violation (23505) detection for postgres.js / drizzle errors. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = findPgError(error);
  if (!pgError || pgError.code !== "23505") return false;
  return constraint ? pgError.constraint_name === constraint : true;
}

type PgErrorLike = { code?: string; constraint_name?: string };

function findPgError(error: unknown): PgErrorLike | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const candidate = current as PgErrorLike & { cause?: unknown };
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) return candidate;
    current = candidate.cause;
  }
  return null;
}
