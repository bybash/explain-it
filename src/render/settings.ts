import type { Config, Resolution } from "../schema/config.ts";
import type { RenderSettings } from "./render.ts";

/** What a render is asked for: a theme (one mode, or both) and a resolution, either of which may be left out. */
export type RenderChoice = {
  readonly theme?: Config["theme"]["mode"];
  readonly resolution?: Resolution;
};

/** What to render: the choices where given, else the project's config. */
export const renderSettings = (choice: RenderChoice, config: Config): RenderSettings => {
  const mode = choice.theme ?? config.theme.mode;
  return {
    themes: mode === "both" ? ["light", "dark"] : [mode],
    resolution: choice.resolution ?? config.output.resolution,
  };
};
