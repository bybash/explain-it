import type { Config, Logo } from "../../schema/config.ts";

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
  /** Missing when step captions are off. */
  readonly step?: Rect;
  /** Missing when narration captions are off. */
  readonly narration?: Rect;
  /** What is left for nodes, edges and callouts. */
  readonly content: Rect;
  /** Font sizes in pixels, which the bands were measured for. */
  readonly fonts: { readonly title: number; readonly step: number; readonly narration: number };
};

export const STAGE = { width: 1920, height: 1080 } as const;
/** The safe area's margin, as a share of each side of the frame (SPEC, Checks). */
const SAFE_MARGIN = 0.05;

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
/** Space between bands, and between a band and the content. */
const GAP = 24;
/** The title chip's padding above and below its text. */
const TITLE_PADDING = 10;

/** The logo is fitted inside this box at 1080p, keeping its aspect ratio (SPEC, Logo). */
export const LOGO_SIZE = { width: 200, height: 64 } as const;

const safeArea = (): Rect => {
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
): StageRegions => {
  const safe = safeArea();
  const font = CAPTION_FONT[captions.size];
  const band = (y: number, height: number): Rect => ({ x: safe.x, y, width: safe.width, height });

  const title = band(safe.y, lines(TITLE_FONT, 1) + 2 * TITLE_PADDING);
  let top = title.y + title.height;
  const step = captions.step ? band(top + GAP / 2, lines(font.step, 1)) : undefined;
  if (step) top = step.y + step.height;

  let bottom = safe.y + safe.height;
  const narrationHeight = lines(font.narration, NARRATION_LINES);
  const narration = captions.narration
    ? band(bottom - narrationHeight, narrationHeight)
    : undefined;
  if (narration) bottom = narration.y - GAP;

  const contentTop = top + GAP;
  const regions = {
    safe,
    title,
    ...(step ? { step } : {}),
    ...(narration ? { narration } : {}),
    content: band(contentTop, bottom - contentTop),
    fonts: { title: TITLE_FONT, ...font },
  };
  return logoOnEveryFrame ? clearOf(regions, logoBox(logoOnEveryFrame)) : regions;
};

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Keeps the regions clear of the logo's box. The title and step caption read
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
