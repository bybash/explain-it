import { useCallback, useEffect, useRef, useState } from "react";
import type { ServerEvent } from "../schema/api.ts";
import { formatErrors, type Validated } from "../schema/errors.ts";
import { onServerEvents } from "./api.ts";

/**
 * Something the server holds, read now and again whenever an event
 * concerns it or the event stream reconnects. Only the latest read is kept,
 * so a slow answer never undoes a newer one; an event clears the last
 * problem, as the server has moved on. `read` and `concerns` keep their
 * identity between renders (`useCallback`), or every render reads again.
 */
export const useServerRead = <T>(
  read: () => Promise<Validated<T>>,
  concerns: (event: ServerEvent) => boolean,
) => {
  const [data, setData] = useState<T | undefined>();
  const [problem, setProblem] = useState<string | undefined>();
  const reads = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++reads.current;
    const latest = await read();
    if (mine !== reads.current) return;
    if (!latest.ok) return setProblem(formatErrors(latest.errors).join("; "));
    setData(latest.value);
  }, [read]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      onServerEvents({
        connected: () => void refresh(),
        event: (event) => {
          if (!concerns(event)) return;
          setProblem(undefined);
          void refresh();
        },
      }),
    [refresh, concerns],
  );

  /** Runs an action on the API: its errors are said, and the data read again either way. */
  const act = async (action: () => Promise<Validated<unknown>>) => {
    const done = await action();
    setProblem(done.ok ? undefined : formatErrors(done.errors).join("; "));
    await refresh();
  };

  return { data, problem, refresh, act };
};
