// The preview page, shown in an iframe by a gate's panel: it draws the
// project with the player the renderer captures, so what is previewed is
// what is rendered, and scales the 1920 × 1080 frame to the iframe's width.
// It takes messages only from the app's own pages (see preview-protocol.ts).

import { mountPlayer, type Player } from "../engine/player.ts";
import { parseConfig, parseLogoImages } from "../schema/config.ts";
import { orThrow } from "../schema/errors.ts";
import { parseGraph } from "../schema/graph.ts";
import { parseLayout } from "../schema/layout.ts";
import { parseStoryboard } from "../schema/storyboard.ts";
import {
  type DrawMessage,
  type FromPreview,
  type Mark,
  ToPreviewSchema,
} from "./preview-protocol.ts";

const FRAME_WIDTH = 1920;
const frame = document.querySelector<HTMLElement>(".frame");
if (!frame) throw new Error("missing .frame");

const scaleToFit = () => {
  frame.style.transform = `scale(${innerWidth / FRAME_WIDTH})`;
};
addEventListener("resize", scaleToFit);
scaleToFit();

const answer = (message: FromPreview) => parent.postMessage(message, location.origin);

/** Where to look in the video: the title card, the middle of each beat, the end. */
const marksOf = (player: Player): Mark[] => {
  const { cards, beats, duration } = player.plan;
  const title = cards.find((c) => c.id === "title");
  return [
    ...(title ? [{ label: "Title", at: title.start + 0.5 }] : []),
    ...beats.map((beat, i) => ({ label: `Beat ${i + 1}`, at: (beat.start + beat.end) / 2 })),
    { label: "End", at: Math.max(0, duration - 0.5) },
  ];
};

let player: Player | undefined;
/** Each drawing is numbered, so a slow one that a newer one has overtaken is dropped. */
let drawing = 0;

const draw = async (message: DrawMessage) => {
  const asked = ++drawing;
  const graph = orThrow(parseGraph(message.graph), "graph.json");
  const drawn = await mountPlayer(frame, {
    graph,
    storyboard: orThrow(parseStoryboard(message.storyboard, graph), "storyboard.json"),
    layout: orThrow(parseLayout(message.layout, graph), "layout.json"),
    config: orThrow(parseConfig(message.config), "config.json"),
    mode: message.mode,
    fonts: new URL("/api/fonts/", location.href),
    ...(message.logo === undefined ? {} : { logo: orThrow(parseLogoImages(message.logo), "logo") }),
  });
  if (asked !== drawing) return;
  player = drawn;
  drawn.seek(Math.min(message.at, drawn.duration));
  answer({ type: "drawn", duration: drawn.duration, marks: marksOf(drawn) });
};

addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.origin !== location.origin) return;
  const message = ToPreviewSchema.safeParse(event.data);
  if (!message.success) return;
  if (message.data.type === "seek") player?.seek(Math.min(message.data.at, player.duration));
  else
    draw(message.data).catch((error: unknown) =>
      answer({ type: "failed", message: error instanceof Error ? error.message : String(error) }),
    );
});
