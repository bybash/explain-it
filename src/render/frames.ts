/** Frames captured per second of timeline (SPEC, Rendering). */
export const FPS = 30;

/** Rounding slack, so 0.1 s at 30 fps is 3 frames and not 4. */
const EPSILON = 1e-9;

/** The timeline time of each frame to capture: one per frame, from 0, never past `duration`. */
export const frameTimes = (duration: number): number[] => {
  const count = Math.max(1, Math.ceil(duration * FPS - EPSILON));
  return Array.from({ length: count }, (_, i) => i / FPS);
};

/**
 * The poster: the title card when there is one, else the middle of the first
 * scene's last beat, when that scene is all drawn.
 */
export const posterTime = (plan: {
  readonly cards: readonly { readonly id: string; readonly start: number }[];
  readonly scenes: readonly { readonly id: string }[];
  readonly beats: readonly {
    readonly scene: string;
    readonly start: number;
    readonly end: number;
  }[];
}): number => {
  const title = plan.cards.find((card) => card.id === "title");
  if (title) return title.start;
  const first = plan.scenes[0];
  const last = plan.beats.filter((b) => b.scene === first?.id).at(-1);
  return last ? (last.start + last.end) / 2 : 0;
};
