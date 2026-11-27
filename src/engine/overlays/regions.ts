import { SAFE_MARGIN, STAGE } from "../../schema/checks.ts";
import { type Config, type Logo, listsSteps } from "../../schema/config.ts";

/** An axis-aligned box in stage pixels. */
export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** Where each overlay band sits on the stage, and the area left for the scene. */
export type StageRegions = {
  /** The frame minus the safe margin; nothing is drawn outside it. */
  readonly safe: Rect;
  readonly title: Rect;
  /** Missing when step captions are off, or listed (`list`). */
  readonly step?: Rect;
  /** The beat list's column down the left, when the captions are listed (decision 048). */
  readonly list?: Rect;
  /** Missing when narration captions are off. */
  readonly narration?: Rect;
  /** The lines the step band holds, and the step caption shows at most. */
  readonly stepLines: number;
  /** Where the scene title and the step captions are: at the top, or in the bottom-left corner (decision 049). */
  readonly place: Config["captions"]["place"];
  /** What is left for nodes, edges and callouts. */
  readonly content: Rect;
  /** Font sizes in pixels, which the bands were measured for. */
  readonly fonts: { readonly title: number; readonly step: number; readonly narration: number };
};

type CaptionSize = Config["captions"]["size"];

/** Font sizes in pixels per caption size. */
const CAPTION_FONT: Readonly<
  Record<CaptionSize, { readonly step: number; readonly narration: number }>
> = {
  S: { step: 30, narration: 26 },
  M: { step: 36, narration: 30 },
  L: { step: 44, narration: 36 },
};

const TITLE_FONT = 22;
export const LINE_HEIGHT = 1.3;
/** Narration shows at most this many lines at once; longer lines are split into cues (beats/cues.ts). */
export const NARRATION_LINES = 2;
/** The most lines a step caption takes: at the top, and in the bottom-left corner, which is narrower (decision 049). */
export const STEP_LINES = { top: 2, bottom: 3 } as const;
/** The lines the corner keeps for a step caption, however short: its look stays the same from beat to beat. */
const CORNER_MIN_LINES = 2;
/** How much of the safe area's width the bottom-left corner's title and step caption take. */
const CORNER_SHARE = 0.42;
/** How much of the safe area's width the beat list takes, when the captions are listed. */
const LIST_SHARE = 0.3;
/** Space between bands, and between a band and the content. */
const GAP = 24;
/** The title chip's padding above and below its text. */
const TITLE_PADDING = 10;

/** The logo is fitted inside this box at 1080p, keeping its aspect ratio (SPEC, Logo). */
export const LOGO_SIZE = { width: 200, height: 64 } as const;
/** The logo alone as the closing card is fitted inside this box, in the middle (SPEC, Logo). */
export const MIDDLE_LOGO_SIZE = { width: 480, height: 160 } as const;

export const safeArea = (): Rect => {
  const mx = STAGE.width * SAFE_MARGIN;
  const my = STAGE.height * SAFE_MARGIN;
  return { x: mx, y: my, width: STAGE.width - 2 * mx, height: STAGE.height - 2 * my };
};

/** Where the logo sits: its box in a right-hand corner of the safe area. */
export const logoBox = (corner: Logo["corner"]): Rect => {
  const safe = safeArea();
  return {
    x: safe.x + safe.width - LOGO_SIZE.width,
    y: corner === "top-right" ? safe.y : safe.y + safe.height - LOGO_SIZE.height,
    ...LOGO_SIZE,
  };
};

const lines = (font: number, count: number): number => Math.ceil(font * LINE_HEIGHT * count);

/**
 * The stage's layout: the scene title at the top left, the step caption under
 * it, the narration caption along the bottom, and the content between them.
 * A caption that is turned off takes no space. A logo on every frame, in
 * `logoOnEveryFrame`'s corner, keeps the bands beside it and the content clear.
 */
export const stageRegions = (
  captions: Config["captions"],
  logoOnEveryFrame?: Logo["corner"],
  /** How many lines the longest step caption needs at the band's width, as the page measures it. */
  stepLines = 1,
): StageRegions => {
  const regions =
    captions.place === "bottom"
      ? bottomLeft(captions, Math.min(STEP_LINES.bottom, Math.max(CORNER_MIN_LINES, stepLines)))
      : atTop(captions, Math.min(STEP_LINES.top, Math.max(1, stepLines)));
  return logoOnEveryFrame ? clearOf(regions, logoBox(logoOnEveryFrame)) : regions;
};

/** The title and the step caption at the top, the content under them (the default). */
const atTop = (captions: Config["captions"], stepLines: number): StageRegions => {
  const safe = safeArea();
  const font = CAPTION_FONT[captions.size];
  const band = (y: number, height: number): Rect => ({ x: safe.x, y, width: safe.width, height });

  const title = band(safe.y, lines(TITLE_FONT, 1) + 2 * TITLE_PADDING);
  let top = title.y + title.height;
  const listed = listsSteps(captions);
  const step =
    captions.step && !listed ? band(top + GAP / 2, lines(font.step, stepLines)) : undefined;
  if (step) top = step.y + step.height;

  const narration = narrationBand(captions, safe);
  const bottom = narration ? narration.y - GAP : safe.y + safe.height;

  const contentTop = top + GAP;
  const width = safe.width * LIST_SHARE;
  const list = listed
    ? { x: safe.x, y: contentTop, width, height: bottom - contentTop }
    : undefined;
  const content = band(contentTop, bottom - contentTop);
  return {
    safe,
    title,
    ...(step ? { step } : {}),
    ...(list ? { list } : {}),
    ...(narration ? { narration } : {}),
    place: "top",
    stepLines,
    content: list ? rightOf(content, list) : content,
    fonts: { title: TITLE_FONT, ...font },
  };
};

/**
 * The title and the step caption in the bottom-left corner, above the
 * narration (decision 049): the scene is framed in the whole height, and a
 * diamond-shaped layout usually leaves that corner empty; the checks say
 * when it does not. The step caption may take two lines; the beat list, when
 * on, rises above the title.
 */
const bottomLeft = (captions: Config["captions"], stepLines: number): StageRegions => {
  const safe = safeArea();
  const font = CAPTION_FONT[captions.size];
  const narration = narrationBand(captions, safe);
  const bottom = narration ? narration.y - GAP : safe.y + safe.height;
  const corner = safe.width * CORNER_SHARE;
  const listed = listsSteps(captions);

  const stepHeight = lines(font.step, stepLines);
  const step =
    captions.step && !listed
      ? { x: safe.x, y: bottom - stepHeight, width: corner, height: stepHeight }
      : undefined;
  const titleHeight = lines(TITLE_FONT, 1) + 2 * TITLE_PADDING;
  const title = {
    x: safe.x,
    y: (step ? step.y - GAP / 2 : bottom) - titleHeight,
    width: corner,
    height: titleHeight,
  };
  const list = listed
    ? { x: safe.x, y: safe.y, width: safe.width * LIST_SHARE, height: title.y - GAP - safe.y }
    : undefined;
  const content = { x: safe.x, y: safe.y, width: safe.width, height: bottom - safe.y };
  return {
    safe,
    title,
    ...(step ? { step } : {}),
    ...(list ? { list } : {}),
    ...(narration ? { narration } : {}),
    place: "bottom",
    stepLines,
    content: list ? rightOf(content, list) : content,
    fonts: { title: TITLE_FONT, ...font },
  };
};

/** The narration's band along the bottom of the safe area, when it is on. */
const narrationBand = (captions: Config["captions"], safe: Rect): Rect | undefined => {
  const height = lines(CAPTION_FONT[captions.size].narration, NARRATION_LINES);
  return captions.narration
    ? { x: safe.x, y: safe.y + safe.height - height, width: safe.width, height }
    : undefined;
};

/** The content to the right of the beat list's column. */
const rightOf = (content: Rect, list: Rect): Rect => ({
  ...content,
  x: list.x + list.width + GAP,
  width: content.width - list.width - GAP,
});

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Keeps the regions clear of the logo's box (the beat list, down the left,
 * never meets it). The title and step caption read
 * from the left, so they lose their right end; the narration is centred, so
 * it loses both ends and stays centred. The content gives up the rows the
 * logo is in.
 */
const clearOf = (regions: StageRegions, logo: Rect): StageRegions => {
  const cut = GAP + logo.width;
  const shortened = (rect: Rect | undefined) =>
    rect && overlaps(rect, logo) ? { ...rect, width: rect.width - cut } : rect;
  const centred = (rect: Rect | undefined) =>
    rect && overlaps(rect, logo) ? { ...rect, x: rect.x + cut, width: rect.width - 2 * cut } : rect;
  const { content } = regions;
  const below = logo.y + logo.height + GAP;
  const clearContent = !overlaps(content, logo)
    ? content
    : logo.y <= content.y
      ? { ...content, y: below, height: content.y + content.height - below }
      : { ...content, height: logo.y - GAP - content.y };
  const step = shortened(regions.step);
  const narration = centred(regions.narration);
  return {
    ...regions,
    title: shortened(regions.title) ?? regions.title,
    ...(step ? { step } : {}),
    ...(narration ? { narration } : {}),
    content: clearContent,
  };
};
