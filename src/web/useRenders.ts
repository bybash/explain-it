import { useCallback, useEffect, useRef, useState } from "react";
import type { RenderAsk, RendersView } from "../schema/api.ts";
import { formatErrors, type Validated } from "../schema/errors.ts";
import { cancelRender, getRenders, onServerEvents, startRender } from "./api.ts";

/**
 * The Render gate's jobs and finished renders, read again whenever a render
 * job of the project changes or the event stream reconnects. Only the
 * latest read is kept, so a slow answer never undoes a newer one.
 */
export const useRenders = (slug: string) => {
  const [view, setView] = useState<RendersView | undefined>();
  const [problem, setProblem] = useState<string | undefined>();
  const reads = useRef(0);

  const refresh = useCallback(async () => {
    const read = ++reads.current;
    const latest = await getRenders(slug);
    if (read !== reads.current) return;
    if (!latest.ok) return setProblem(formatErrors(latest.errors).join("; "));
    setView(latest.value);
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      onServerEvents({
        connected: () => void refresh(),
        event: (event) => {
          if (event.type === "render" && event.slug === slug) void refresh();
        },
      }),
    [slug, refresh],
  );

  /** Runs an action on the API: its errors are said, and the jobs read again either way. */
  const act = async (action: () => Promise<Validated<unknown>>) => {
    const done = await action();
    setProblem(done.ok ? undefined : formatErrors(done.errors).join("; "));
    await refresh();
  };

  return {
    view,
    problem,
    render: (ask: RenderAsk) => void act(() => startRender(slug, ask)),
    cancel: (job: string) => void act(() => cancelRender(slug, job)),
  };
};
