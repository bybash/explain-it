import { useCallback, useEffect, useRef } from "react";
import type { ServerEvent } from "../schema/api.ts";
import { getChecks, startChecks } from "./api.ts";
import { useServerRead } from "./useServerRead.ts";

/**
 * The Preview gate's checks: the run under way and the last report, read
 * again whenever the server says the run moved on, and whenever the
 * project's files change (`filesVersion` changes with them), as a change
 * can put the report out of date. Opening the gate runs them once, when
 * the report is out of date and no run is under way (decision 038), so
 * what they find is said in the chat.
 */
export const usePreviewChecks = (slug: string, filesVersion: string) => {
  const read = useCallback(() => getChecks(slug), [slug]);
  const concerns = useCallback(
    (event: ServerEvent) => event.type === "preview-checks" && event.slug === slug,
    [slug],
  );
  const { data, problem, refresh, act } = useServerRead(read, concerns);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new `filesVersion` means the files changed.
  useEffect(() => {
    void refresh();
  }, [refresh, filesVersion]);
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !data) return;
    asked.current = true;
    const running = data.run.state === "waiting" || data.run.state === "checking";
    if (!data.upToDate && !running) void act(() => startChecks(slug));
  }, [act, data, slug]);
  return { checks: data, problem, run: () => void act(() => startChecks(slug)) };
};
