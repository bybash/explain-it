/** Addresses that mean "listen on every address": a browser cannot open them, and the app refuses them as hosts. */
const EVERY_ADDRESS = ["0.0.0.0", "::"];

/**
 * The address to open the app at, for the start-up line: the one it listens
 * on, or this machine's own (`127.0.0.1`) when it listens on every address,
 * as it does in Docker. The app only answers requests addressed to this
 * machine by name, so `0.0.0.0` would be refused.
 */
export const openUrl = (hostname: string, port: number): string => {
  if (EVERY_ADDRESS.includes(hostname)) return `http://127.0.0.1:${port}`;
  return `http://${hostname.includes(":") ? `[${hostname}]` : hostname}:${port}`;
};
