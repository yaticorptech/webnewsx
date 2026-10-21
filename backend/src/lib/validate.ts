import type { Context } from "hono";
import type { z } from "zod";
import { ApiError, validationError } from "./errors.js";

/** Flattens zod issues into `{ "path.to.field": "first message" }`. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_";
    fields[key] ??= issue.message;
  }
  return fields;
}

/** Parses a value with a zod schema or throws a 400 `validation_error` ApiError. */
export function parseWith<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(zodFieldErrors(result.error));
  return result.data;
}

/** Reads a JSON request body and validates it. Invalid JSON → 400 `invalid_json`. */
export async function readJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
  return parseWith(schema, body);
}
