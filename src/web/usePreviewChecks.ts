import { useCallback, useEffect, useRef, useState } from "react";
import type { PreviewChecks } from "../schema/api.ts";
import { formatErrors } from "../schema/errors.ts";
import { getChecks, onServerEvents, startChecks } from "./api.ts";

/**
 * The Preview gate's checks: the run under way and the last report, read
 * again whenever the server says the run moved on, the event stream
 * reconnects, or the project's files change (`filesVersion` changes with
 * them), as a change can put the report out of date. Only the latest read
 * is kept, so a slow answer never undoes a newer one.
 */
export const usePreviewChecks = (slug: string, filesVersion: string) => {
  const [checks, setChecks] = useState<PreviewChecks | undefined>();
  const [problem, setProblem] = useState<string | undefined>();
  const reads = useRef(0);

  const refresh = useCallback(async () => {
    const read = ++reads.current;
    const latest = await getChecks(slug);
    if (read !== reads.current) return;
    if (!latest.ok) return setProblem(formatErrors(latest.errors).join("; "));
    setChecks(latest.value);
  }, [slug]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new `filesVersion` means the files changed.
  useEffect(() => {
    void refresh();
  }, [refresh, filesVersion]);

  useEffect(
    () =>
      onServerEvents({
        connected: () => void refresh(),
        event: (event) => {
          if (event.type !== "preview-checks" || event.slug !== slug) return;
          // The server has moved on, so what went wrong before is behind it.
          setProblem(undefined);
          void refresh();
        },
      }),
    [slug, refresh],
  );

  const run = async () => {
    const started = await startChecks(slug);
    if (!started.ok) return setProblem(formatErrors(started.errors).join("; "));
    setProblem(undefined);
    await refresh();
  };

  return { checks, problem, run: () => void run() };
};
