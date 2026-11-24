import { useCallback, useEffect } from "react";
import type { ServerEvent } from "../schema/api.ts";
import { getChecks, startChecks } from "./api.ts";
import { useServerRead } from "./useServerRead.ts";

/**
 * The Preview gate's checks: the run under way and the last report, read
 * again whenever the server says the run moved on, and whenever the
 * project's files change (`filesVersion` changes with them), as a change
 * can put the report out of date.
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
  return { checks: data, problem, run: () => void act(() => startChecks(slug)) };
};
