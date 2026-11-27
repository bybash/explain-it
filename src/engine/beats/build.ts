import {
  type Config,
  type EndCard,
  type Pace,
  TITLE_CARD_AUTO,
  type TitleCard,
} from "../../schema/config.ts";
import type { Graph } from "../../schema/graph.ts";
import type { Narration } from "../../schema/narration.ts";
import type { BADGE_TONES, Storyboard } from "../../schema/storyboard.ts";
import { EDGE_TIMING, flowTweens } from "../edges/flow.ts";
import { appearTweens, highlightTweens, nodeTarget, zoneTarget } from "../iso/tweens.ts";
import { sceneTitleText } from "../overlays/html.ts";
import { type Entrance, OVERLAY_TIMING, overlayTarget, overlayTweens } from "../overlays/tweens.ts";
import type { TweenSpec } from "../timeline.ts";
import { splitCues } from "./cues.ts";
import { type Focus, focusTweens } from "./focus.ts";
import {
  type BeatTiming,
  beatTiming,
  CAPTION_CHARS_PER_SECOND,
  type NarrationMode,
  narrationMode,
} from "./timing.ts";

/** How scenes change, in seconds: a crossfade between them, and the empty background held at the end when no card closes the video. */
export const SCENE_TIMING = { transition: 0.8, tail: 1.2 } as const;

/** A card holds at least this long, in seconds, and longer when its text needs it (SPEC, Opening and ending). */
export const CARD_MIN_HOLD = 3;

/** The timeline target that holds one card's state: its `opacity`. */
export const cardTarget = (id: string): string => `card:${id}`;

/** The timeline target that holds one scene layer's state: its `opacity`. */
export const sceneTarget = (id: string): string => `scene:${id}`;

/**
 * A node or edge id within one scene. Each scene is drawn on its own layer,
 * so the same node has a separate state in every scene it is in.
 */
export const scoped = (scene: string, id: string): string => `${scene}/${id}`;

/** A stretch of the timeline, in seconds. */
export type Span = { readonly id: string; readonly start: number; readonly end: number };

export type ScenePlan = Span & {
  readonly index: number;
  readonly title: string;
  readonly nodes: readonly string[];
  /** The edges its beats flow, in the order they first flow. */
  readonly edges: readonly string[];
  /** Labels its flows give their edges in place of the graph's, from the first flow that has one. */
  readonly edgeLabels: Readonly<Record<string, string>>;
};

type Shown = {
  /** Unique among overlays; it names the overlay's timeline target. */
  readonly id: string;
  /** The scene whose layer it is drawn on. */
  readonly scene: string;
  readonly at: number;
  readonly until: number;
};

/** An overlay to draw, with when it shows. Node overlays name their node; the page finds its shape. */
export type PlannedOverlay = Shown &
  (
    | {
        readonly kind: "callout";
        readonly node: string;
        readonly title?: string;
        readonly text: string;
      }
    | {
        readonly kind: "badge";
        readonly node: string;
        readonly text: string;
        readonly tone: (typeof BADGE_TONES)[number];
      }
    | { readonly kind: "title" | "step" | "narration"; readonly text: string }
    | {
        /** A line of the beat list (decision 048): the beat's caption, its place in its scene's list, and when it fades. */
        readonly kind: "list";
        readonly text: string;
        readonly index: number;
        readonly fadesAt: number;
      }
  );

/**
 * A card on screen: fully shown from `start` to `end`, gone by `until`. The
 * title card opens the video; the closing card is the end card, or else the
 * title card again, or else the logo in the middle.
 */
export type CardPlan = Span & {
  readonly id: "title" | "end" | "title-again" | "logo";
  readonly until: number;
};

/** One narration caption, timed for the screen and the `.srt` file. */
export type Cue = {
  readonly beat: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
};

export type BeatPlan = {
  readonly duration: number;
  readonly cards: readonly CardPlan[];
  readonly scenes: readonly ScenePlan[];
  readonly beats: readonly (Span & { readonly scene: string })[];
  readonly overlays: readonly PlannedOverlay[];
  readonly cues: readonly Cue[];
  readonly tweens: readonly TweenSpec[];
};

export type BuildOptions = {
  /** Measured narration lengths in seconds, by beat id; the rest are estimated. */
  readonly narration?: Readonly<Record<string, number>>;
  /** How unhurried the video is, and how narration is timed; the config's defaults when not given. */
  readonly pace?: Pace;
  readonly mode?: NarrationMode;
  /** Opens the video, before the first scene, and closes it when there is no end card. */
  readonly titleCard?: TitleCard;
  /** Closes the video, after the last scene. */
  readonly endCard?: EndCard;
  /** Whether there is a logo, which closes the video when there is no card. */
  readonly logo?: boolean;
  /** Whether the step captions are listed down the left side (decision 048). */
  readonly list?: boolean;
};

/** The build options a project sets: its config's pace, voice, cards and logo, and its measured narration. */
export const beatOptions = (config: Config, narration?: Narration): BuildOptions => {
  const { title, end } = config.cards ?? {};
  return {
    ...(narration ? { narration } : {}),
    pace: config.pacing,
    mode: narrationMode(config),
    ...(title ? { titleCard: title } : {}),
    ...(end ? { endCard: end } : {}),
    ...(config.logo ? { logo: true } : {}),
    ...(config.captions.list ? { list: true } : {}),
  };
};

/** A project's beat plan as it plays: its script on its graph, timed by its style and measured narration. */
export const projectBeats = (project: {
  readonly storyboard: Storyboard;
  readonly graph: Graph;
  readonly config: Config;
  readonly narration?: Narration | undefined;
}): BeatPlan =>
  buildBeats(project.storyboard, project.graph, beatOptions(project.config, project.narration));

const ENTRANCES: Readonly<Record<PlannedOverlay["kind"], Entrance>> = {
  title: "fade",
  step: "rise",
  list: "rise",
  narration: "fade",
  callout: "rise",
  badge: "pop",
};

/**
 * Turns a storyboard into a timeline plan: when each scene and beat plays,
 * the overlays they show, and the tweens that play it all. Scenes follow
 * each other with a crossfade; each starts with only its own nodes, and
 * draws only the edges it flows.
 */
export const buildBeats = (
  storyboard: Storyboard,
  graph: Graph,
  options: BuildOptions = {},
): BeatPlan => {
  const { transition, tail } = SCENE_TIMING;
  const edgeEnds = new Map(graph.edges.map((e) => [e.id, [e.from, e.to] as const]));
  const zoneOf = new Map(graph.nodes.map((n) => [n.id, n.zone]));

  const cards: CardPlan[] = [];
  const tweens: TweenSpec[] = [];
  if (options.titleCard) {
    const end = titleHold(options.titleCard);
    cards.push({ id: "title", start: 0, end, until: end + transition });
    tweens.push(fadeOut(cardTarget("title"), end));
  }
  const opening = cards[0]?.until ?? 0;

  // Times come first: a flow keeps its dashes moving, and a badge stays, until its scene has gone.
  let clock = opening;
  const timed = storyboard.scenes.map((scene, index) => {
    const start = clock;
    const beats = scene.beats.map((beat) => {
      const measured = options.narration?.[beat.id];
      const timing = beatTiming(beat, {
        ...(options.pace ? { pace: options.pace } : {}),
        ...(options.mode ? { mode: options.mode } : {}),
        ...(measured === undefined ? {} : { narration: measured }),
      });
      const span = { beat, timing, start: clock, end: clock + timing.duration };
      clock = span.end;
      return span;
    });
    const end = clock;
    const last = index === storyboard.scenes.length - 1;
    if (!last) clock += transition;
    return { scene, index, start, end, last, beats };
  });
  // The last scene fades out as the closing card fades in; the card then holds to the last frame.
  const closing = closingCard(options);
  const fadedOut = clock + transition;
  const duration = fadedOut + (closing?.hold ?? tail);
  if (closing) {
    cards.push({ id: closing.id, start: fadedOut, end: duration, until: duration });
    tweens.push(fade(cardTarget(closing.id), 0, 1, clock));
  }

  const scenes: ScenePlan[] = [];
  const beats: (Span & { scene: string })[] = [];
  const overlays: PlannedOverlay[] = [];
  const cues: Cue[] = [];
  const show = (overlay: PlannedOverlay) => {
    overlays.push(overlay);
    tweens.push(
      ...overlayTweens(overlay.id, {
        at: overlay.at,
        until: overlay.until,
        entrance: ENTRANCES[overlay.kind],
      }),
    );
  };

  for (const { scene, index, start, end, beats: sceneBeats } of timed) {
    const layerGoneAt = end + transition;
    const edges = [
      ...new Set(
        scene.beats.flatMap((b) => b.actions.flatMap((a) => (a.type === "flow" ? [a.edge] : []))),
      ),
    ];
    const edgeLabels: Record<string, string> = {};
    for (const b of scene.beats)
      for (const a of b.actions)
        if (a.type === "flow" && a.label !== undefined && !(a.edge in edgeLabels))
          edgeLabels[a.edge] = a.label;
    scenes.push({
      id: scene.id,
      index,
      title: scene.title,
      start,
      end,
      nodes: scene.nodes,
      edges,
      edgeLabels,
    });
    tweens.push(...sceneFades(scene.id, { start, end, fadeIn: start > 0 }));
    show({
      kind: "title",
      id: `title:${scene.id}`,
      scene: scene.id,
      text: sceneTitleText(index, scene.title, storyboard.scenes.length),
      at: start,
      until: layerGoneAt,
    });

    const inScene = (id: string) => scoped(scene.id, id);
    let listed = 0;
    const appears = new Map<string, number>();
    /** The scene's focus as it changes: each dim, and the start of each beat without one. */
    const focuses: Focus[] = [];
    for (const { beat, timing, start: beatStart, end: beatEnd } of sceneBeats) {
      beats.push({ id: beat.id, scene: scene.id, start: beatStart, end: beatEnd });
      if (!beat.actions.some((a) => a.type === "dim")) focuses.push({ at: beatStart });
      if (options.list) {
        // The line stays to the scene's end, fading once its beat is over (`faded`, 0..1).
        show({
          kind: "list",
          id: `list:${beat.id}`,
          scene: scene.id,
          text: beat.caption,
          index: listed++,
          fadesAt: beatEnd,
          at: beatStart,
          until: layerGoneAt,
        });
        if (beatEnd < end)
          tweens.push({
            target: overlayTarget(`list:${beat.id}`),
            from: { faded: 0 },
            to: { faded: 1 },
            duration: OVERLAY_TIMING.exit,
            ease: "inOutSine",
            at: beatEnd,
          });
      } else
        show({
          kind: "step",
          id: `step:${beat.id}`,
          scene: scene.id,
          text: beat.caption,
          at: beatStart,
          until: beatEnd,
        });
      const narrationEnd =
        timing.narration && beatStart + timing.narration.at + timing.narration.length;
      if (beat.say !== undefined && timing.narration) {
        const said = cuesOf(
          beat.id,
          beat.say,
          beatStart + timing.narration.at,
          timing.narration.length,
        );
        for (const [k, cue] of said.entries()) {
          cues.push(cue);
          show({
            kind: "narration",
            id: `say:${beat.id}:${k}`,
            scene: scene.id,
            text: cue.text,
            at: cue.start,
            until: cue.end,
          });
        }
      }

      for (const [a, action] of beat.actions.entries()) {
        const slot = slotOf(timing, a);
        const at = beatStart + slot.at;
        const id = `action:${beat.id}:${a}`;
        switch (action.type) {
          case "appear":
            tweens.push(...appearTweens(nodeTarget(inScene(action.node)), at));
            if (!appears.has(action.node)) appears.set(action.node, at);
            break;
          case "highlight":
            tweens.push(...highlightTweens(nodeTarget(inScene(action.node)), at));
            break;
          case "flow":
            tweens.push(
              ...flowTweens(inScene(action.edge), {
                at,
                flowFor: Math.max(0, layerGoneAt - at - EDGE_TIMING.draw),
              }),
            );
            break;
          case "dim":
            // Made into tweens with the scene's other changes of focus (see `focusTweens`).
            focuses.push({ at, kept: new Set(action.except) });
            break;
          case "callout":
            show({
              kind: "callout",
              id,
              scene: scene.id,
              node: action.node,
              ...(action.title === undefined ? {} : { title: action.title }),
              text: action.text,
              at,
              until: calloutUntil(at + slot.duration, narrationEnd, beatEnd),
            });
            break;
          case "badge":
            show({
              kind: "badge",
              id,
              scene: scene.id,
              node: action.node,
              text: action.text,
              tone: action.tone,
              at,
              until: layerGoneAt,
            });
            break;
        }
      }
    }
    tweens.push(...zoneAppears(scene.nodes, zoneOf, appears, inScene));
    const onNode = new Map(
      overlays.flatMap((o) =>
        o.scene === scene.id && (o.kind === "badge" || o.kind === "callout")
          ? [[o.id, o.node] as const]
          : [],
      ),
    );
    tweens.push(
      ...focusTweens({ nodes: scene.nodes, edges, edgeEnds, zoneOf, onNode, inScene }, focuses),
    );
  }
  return { duration, cards, scenes, beats, overlays, cues, tweens };
};

/**
 * A zone's platform rises with the first of its nodes to appear. When one of
 * its nodes is there from the start of the scene, so is the platform.
 */
const zoneAppears = (
  nodes: readonly string[],
  zoneOf: ReadonlyMap<string, string | undefined>,
  appears: ReadonlyMap<string, number>,
  inScene: (id: string) => string,
): TweenSpec[] => {
  const members = new Map<string, string[]>();
  for (const node of nodes) {
    const zone = zoneOf.get(node);
    if (zone !== undefined) members.set(zone, [...(members.get(zone) ?? []), node]);
  }
  return [...members].flatMap(([zone, ids]) => {
    const times = ids.map((id) => appears.get(id));
    if (times.some((t) => t === undefined)) return [];
    return appearTweens(zoneTarget(inScene(zone)), Math.min(...(times as number[])));
  });
};

/** Splits a narration line into cues, each on screen for its share of the characters. */
const cuesOf = (beat: string, say: string, start: number, length: number): Cue[] => {
  const texts = splitCues(say);
  const total = texts.reduce((sum, text) => sum + text.length, 0);
  let at = start;
  return texts.map((text) => {
    const end = at + (length * text.length) / total;
    const cue = { beat, text, start: at, end };
    at = end;
    return cue;
  });
};

const slotOf = (timing: BeatTiming, index: number) => {
  const slot = timing.actions[index];
  if (!slot) throw new Error(`no timing for action ${index}`);
  return slot;
};

/** Callouts stay until the narration ends (SPEC, Timing); one that would barely show stays to the beat's end. */
const calloutUntil = (entered: number, narrationEnd: number | undefined, beatEnd: number) =>
  narrationEnd !== undefined && narrationEnd >= entered ? narrationEnd : beatEnd;

/** How long a card is fully shown: its text at reading speed, but at least the minimum. */
const textHold = (lines: readonly (string | undefined)[]): number =>
  Math.max(
    CARD_MIN_HOLD,
    lines.reduce((sum, line) => sum + (line?.length ?? 0), 0) / CAPTION_CHARS_PER_SECOND,
  );

/** How long the title card holds: as long as the user set, or else by its text (decision 044). */
const titleHold = (card: TitleCard): number =>
  card.seconds ??
  Math.min(
    TITLE_CARD_AUTO.max,
    Math.max(
      TITLE_CARD_AUTO.min,
      `${card.title}${card.description ?? ""}`.length / TITLE_CARD_AUTO.charsPerSecond,
    ),
  );
const endText = (card: EndCard) => [card.headline, card.link, card.where, card.credit];

/** The card that closes the video and how long it holds (SPEC, Opening and ending). */
const closingCard = ({
  titleCard,
  endCard,
  logo,
}: BuildOptions): { id: CardPlan["id"]; hold: number } | undefined => {
  if (endCard) return { id: "end", hold: textHold(endText(endCard)) };
  if (titleCard) return { id: "title-again", hold: titleHold(titleCard) };
  if (logo) return { id: "logo", hold: CARD_MIN_HOLD };
  return undefined;
};

const fade = (target: string, from: number, to: number, at: number): TweenSpec => ({
  target,
  from: { opacity: from },
  to: { opacity: to },
  duration: SCENE_TIMING.transition,
  ease: "inOutSine",
  at,
});

const fadeOut = (target: string, at: number): TweenSpec => fade(target, 1, 0, at);

/** Fades a scene's layer in over the transition before it, and out over the one after it. */
const sceneFades = (
  id: string,
  { start, end, fadeIn }: { start: number; end: number; fadeIn: boolean },
): TweenSpec[] => {
  const target = sceneTarget(id);
  return [
    ...(fadeIn ? [fade(target, 0, 1, start - SCENE_TIMING.transition)] : []),
    fadeOut(target, end),
  ];
};
