import type { Validated } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";

/**
 * Only this machine can connect by default (SPEC, App and stack). Docker
 * sets HOST to 0.0.0.0 inside the container and publishes the port on
 * 127.0.0.1 outside it.
 */
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3000;
/** Where `npm run dev` runs the API, behind Vite's dev server on PORT. */
export const DEFAULT_DEV_API_PORT = 3001;

export type ListenOptions = { readonly hostname: string; readonly port: number };

/** Where the server listens: `HOST` and `PORT` from the environment, else 127.0.0.1:3000. */
export const listenOptions = (
  env: Readonly<Record<string, string | undefined>>,
): Validated<ListenOptions> => {
  const hostname = env.HOST || DEFAULT_HOST;
  const port = portFrom(env, "PORT", DEFAULT_PORT);
  return port.ok ? ok({ hostname, port: port.value }) : port;
};

/** The API's port under `npm run dev`: `DEV_API_PORT`, else 3001. */
export const devApiPort = (env: Readonly<Record<string, string | undefined>>): Validated<number> =>
  portFrom(env, "DEV_API_PORT", DEFAULT_DEV_API_PORT);

const portFrom = (
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: number,
): Validated<number> => {
  const value = env[name];
  if (value === undefined) return ok(fallback);
  const port = Number(value);
  if (value.trim() === "" || !Number.isInteger(port) || port < 1 || port > 65535)
    return fail([{ path: name, message: `"${value}" is not a port number from 1 to 65535` }]);
  return ok(port);
};
