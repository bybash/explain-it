import type { ServerEvent } from "../schema/api.ts";

export type Events = {
  readonly publish: (event: ServerEvent) => void;
  /** Calls `listener` with every event from now on; the returned function stops it. */
  readonly subscribe: (listener: (event: ServerEvent) => void) => () => void;
};

/** An in-process hub that passes each published event to every current listener. */
export const createEvents = (): Events => {
  const listeners = new Set<(event: ServerEvent) => void>();
  return {
    publish: (event) => {
      for (const listener of listeners) listener(event);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
