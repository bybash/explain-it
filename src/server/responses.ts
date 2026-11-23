import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Validated, ValidationError } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";

/** Every error response has this shape: what is wrong, each naming its place. */
export const errorResponse = (
  c: Context,
  status: ContentfulStatusCode,
  errors: readonly ValidationError[],
) => c.json({ errors }, status);

/** The answer for a slug that names no project. */
export const noProject = (c: Context, slug: string) =>
  errorResponse(c, 404, [{ path: "slug", message: `no project "${slug}"` }]);

/** A request's JSON body, or the error that names why it is not one. */
export const jsonBody = async (c: Context): Promise<Validated<unknown>> => {
  try {
    return ok(await c.req.json());
  } catch {
    return fail([{ path: "(body)", message: "not valid JSON" }]);
  }
};
