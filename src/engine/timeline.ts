import { EASES, type EaseName } from "./ease.ts";

/** Numeric properties of one target, such as `{ opacity: 1, y: 0 }`. */
export type Props = Readonly<Record<string, number>>;

/** Every animated property of every target at one moment. */
export type State = Record<string, Record<string, number>>;

/**
 * Where something starts:
 * - a number: an absolute time in seconds
 * - `"<"` / `">"`: the start / end of the previously added tween, stagger or wait
 * - a label name
 * - any of these followed by `+=n` or `-=n`; a bare `+=n` is relative to the end
 * - omitted: the end of the timeline so far
 */
export type Position = number | string;

export type TweenSpec = {
  readonly target: string;
  readonly from: Props;
  readonly to: Props;
  readonly duration: number;
  /** Defaults to linear; callers such as the beat builder pick eases per action. */
  readonly ease?: EaseName;
  readonly at?: Position;
};

export type Tween = {
  readonly target: string;
  readonly from: Props;
  readonly to: Props;
  readonly start: number;
  readonly duration: number;
  readonly ease: EaseName;
};

export type Timeline = {
  readonly duration: number;
  readonly labels: Readonly<Record<string, number>>;
  readonly tweens: readonly Tween[];
  /**
   * The state at time `t`, computed from `t` alone: seeking in any order
   * gives the same result. For a property animated by several tweens, the
   * one that started last wins (on a tie, the one added last); before any
   * has started, it holds the first tween's `from` value.
   */
  seek(t: number): State;
};

export type TimelineBuilder = {
  add(spec: TweenSpec): TimelineBuilder;
  /** Starts the same tween on each target, `each` seconds apart. */
  stagger(
    targets: readonly string[],
    spec: Omit<TweenSpec, "target">,
    each: number,
  ): TimelineBuilder;
  label(name: string, at?: Position): TimelineBuilder;
  /** Empty time, for example to let a narration line finish. */
  wait(seconds: number): TimelineBuilder;
  build(): Timeline;
};

const POSITION = /^(<|>|[A-Za-z_]\w*)?(?:([+-])=(\d*\.?\d+))?$/;

/**
 * Builds a timeline. Misuse (an unknown label, a malformed position) is a
 * bug in the caller, so it throws.
 */
export const timeline = (): TimelineBuilder => {
  const tweens: Tween[] = [];
  const labels: Record<string, number> = {};
  let end = 0;
  let previous = { start: 0, end: 0 };

  const resolve = (at: Position | undefined): number => {
    if (at === undefined) return end;
    if (typeof at === "number") return Math.max(0, at);
    const match = POSITION.exec(at);
    if (!match || at === "") throw new Error(`invalid position "${at}"`);
    const [, base, sign, amount] = match;
    let time = end;
    if (base === "<") time = previous.start;
    else if (base === ">") time = previous.end;
    else if (base !== undefined) {
      const label = labels[base];
      if (label === undefined) throw new Error(`unknown label "${base}"`);
      time = label;
    }
    if (amount !== undefined) time += (sign === "-" ? -1 : 1) * Number(amount);
    return Math.max(0, time);
  };

  const place = (spec: Omit<TweenSpec, "at">, start: number): Tween => {
    const fromKeys = Object.keys(spec.from).toSorted();
    const toKeys = Object.keys(spec.to).toSorted();
    if (fromKeys.join() !== toKeys.join())
      throw new Error("from and to must have the same properties");
    const tween: Tween = {
      target: spec.target,
      from: { ...spec.from },
      to: { ...spec.to },
      start,
      duration: Math.max(0, spec.duration),
      ease: spec.ease ?? "linear",
    };
    tweens.push(tween);
    return tween;
  };

  const block = (start: number, blockEnd: number) => {
    previous = { start, end: blockEnd };
    end = Math.max(end, blockEnd);
  };

  const builder: TimelineBuilder = {
    add(spec) {
      const tween = place(spec, resolve(spec.at));
      block(tween.start, tween.start + tween.duration);
      return builder;
    },
    stagger(targets, spec, each) {
      const start = resolve(spec.at);
      let blockEnd = start;
      targets.forEach((target, i) => {
        const tween = place({ ...spec, target }, start + i * each);
        blockEnd = Math.max(blockEnd, tween.start + tween.duration);
      });
      block(start, blockEnd);
      return builder;
    },
    label(name, at) {
      if (name in labels) throw new Error(`duplicate label "${name}"`);
      labels[name] = resolve(at);
      return builder;
    },
    wait(seconds) {
      block(end, end + Math.max(0, seconds));
      return builder;
    },
    build: () => freeze(tweens, labels, end),
  };
  return builder;
};

type Track = { readonly target: string; readonly prop: string; readonly tweens: readonly Tween[] };

const freeze = (
  tweens: readonly Tween[],
  labels: Readonly<Record<string, number>>,
  duration: number,
): Timeline => {
  const frozen = tweens.map((tween) => Object.freeze({ ...tween }));

  // One track per animated property, its tweens in start order. The sort is
  // stable, so tweens that start together stay in the order they were added.
  const byKey = new Map<string, { target: string; prop: string; tweens: Tween[] }>();
  for (const tween of frozen) {
    for (const prop of Object.keys(tween.to)) {
      const key = `${tween.target}\u0000${prop}`;
      const track = byKey.get(key) ?? { target: tween.target, prop, tweens: [] };
      track.tweens.push(tween);
      byKey.set(key, track);
    }
  }
  const tracks: readonly Track[] = [...byKey.values()].map((track) => ({
    ...track,
    tweens: track.tweens.toSorted((a, b) => a.start - b.start),
  }));

  return Object.freeze({
    duration,
    labels: Object.freeze({ ...labels }),
    tweens: Object.freeze(frozen),
    seek(t: number): State {
      const time = Math.min(Math.max(t, 0), duration);
      const state: State = {};
      for (const track of tracks) {
        (state[track.target] ??= {})[track.prop] = valueAt(track, time);
      }
      return state;
    },
  });
};

const valueAt = (track: Track, time: number): number => {
  const { prop } = track;
  let active: Tween | undefined;
  for (const tween of track.tweens) {
    if (tween.start > time) break;
    active = tween;
  }
  if (!active) return track.tweens[0]?.from[prop] ?? 0;

  const from = active.from[prop] ?? 0;
  const to = active.to[prop] ?? 0;
  if (time >= active.start + active.duration) return to;
  const progress = (time - active.start) / active.duration;
  return from + (to - from) * EASES[active.ease](progress);
};
