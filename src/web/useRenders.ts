import { useCallback } from "react";
import type { RenderAsk, ServerEvent } from "../schema/api.ts";
import { cancelRender, getRenders, startRender } from "./api.ts";
import { useServerRead } from "./useServerRead.ts";

/** The Render gate's jobs and finished renders, read again whenever one of the project's render jobs changes. */
export const useRenders = (slug: string) => {
  const read = useCallback(() => getRenders(slug), [slug]);
  const concerns = useCallback(
    (event: ServerEvent) => event.type === "render" && event.slug === slug,
    [slug],
  );
  const { data, problem, act } = useServerRead(read, concerns);
  return {
    view: data,
    problem,
    render: (ask: RenderAsk) => void act(() => startRender(slug, ask)),
    cancel: (job: string) => void act(() => cancelRender(slug, job)),
  };
};
