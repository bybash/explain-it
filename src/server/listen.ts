import type { Validated } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";

/**
 * Only this machine can connect by default (SPEC, App and stack). Docker
 * sets HOST to 0.0.0.0 inside the container and publishes the port on
 * 127.0.0.1 outside it.
 */
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3000;

export type ListenOptions = { readonly hostname: string; readonly port: number };

/** Where the server listens: `HOST` and `PORT` from the environment, else 127.0.0.1:3000. */
export const listenOptions = (
  env: Readonly<Record<string, string | undefined>>,
): Validated<ListenOptions> => {
  const hostname = env.HOST || DEFAULT_HOST;
  if (env.PORT === undefined) return ok({ hostname, port: DEFAULT_PORT });
  const port = Number(env.PORT);
  if (env.PORT.trim() === "" || !Number.isInteger(port) || port < 1 || port > 65535)
    return fail([{ path: "PORT", message: `"${env.PORT}" is not a port number from 1 to 65535` }]);
  return ok({ hostname, port });
};
