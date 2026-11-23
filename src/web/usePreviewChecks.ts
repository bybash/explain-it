import { useCallback, useEffect, useState } from "react";
import type { PreviewChecks } from "../schema/api.ts";
import { formatErrors } from "../schema/errors.ts";
import { getChecks, onServerEvents, startChecks } from "./api.ts";

/**
 * The Preview gate's checks: the run under way and the last report, read
 * again whenever the server says the run moved on, the event stream
 * reconnects, or the project's files change (`files` stands for them), as a
 * change can put the report out of date.
 */
export const usePreviewChecks = (slug: string, files: string) => {
  const [checks, setChecks] = useState<PreviewChecks | undefined>();
  const [problem, setProblem] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    const now = await getChecks(slug);
    if (now.ok) setChecks(now.value);
  }, [slug]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `files` stands for the project's files.
  useEffect(() => {
    void refresh();
  }, [refresh, files]);

  useEffect(
    () =>
      onServerEvents({
        connected: () => void refresh(),
        event: (event) => {
          if (event.type === "preview-checks" && event.slug === slug) void refresh();
        },
      }),
    [slug, refresh],
  );

  const run = async () => {
    const started = await startChecks(slug);
    if (!started.ok) return setProblem(formatErrors(started.errors).join("; "));
    setProblem(undefined);
    setChecks((now) => now && { ...now, run: started.value });
  };

  return { checks, problem, run: () => void run() };
};
