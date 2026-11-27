// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../schema/config.ts";
import { type OverlayDrawing, renderOverlays } from "./html.ts";
import { stageRegions } from "./regions.ts";
import { overlayTarget } from "./tweens.ts";

const regions = stageRegions({ ...DEFAULT_CONFIG.captions, list: true });
const lines: OverlayDrawing[] = [
  "A user signs in.",
  "The app hands off.",
  "The code comes back.",
].map((text, index) => ({ kind: "list", id: `list-${index}`, text, scene: "sign_in", index }));
const on = (...ids: number[]) =>
  Object.fromEntries(ids.map((i) => [overlayTarget(`list-${i}`), { opacity: 1 }]));

const stage = () => {
  const root = document.createElement("div");
  return { pose: renderOverlays(root, lines, regions, []), markup: () => root.innerHTML };
};

describe("renderOverlays", () => {
  it("draws the beat list the same however the player got to a moment", () => {
    const seeked = stage();
    seeked.pose(on(0, 1, 2));
    seeked.pose(on(0));
    const fresh = stage();
    fresh.pose(on(0));
    expect(seeked.markup()).toBe(fresh.markup());
  });
});
