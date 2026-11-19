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
   * has started, it holds the `from` of the one that starts earliest.
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

const NAME = /[A-Za-z_]\w*/.source;
const LABEL_NAME = new RegExp(`^${NAME}$`);
// Offsets may use exponent notation, as numbers print that way in template strings.
const POSITION = new RegExp(`^(<|>|${NAME})?(?:([+-])=(\\d*\\.?\\d+(?:[eE][+-]?\\d+)?))?$`);

const finite = (where: string, n: number): number => {
  if (!Number.isFinite(n)) throw new Error(`${where}: expected a finite number, got ${n}`);
  return n;
};

const endOf = (tween: Tween): number => tween.start + tween.duration;

const sameKeys = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((key, i) => key === b[i]);

/**
 * Builds a timeline. Misuse (an unknown label, a malformed position, a number
 * that is not finite) is a bug in the caller, so it throws.
 */
export const timeline = (): TimelineBuilder => {
  const tweens: Tween[] = [];
  const labels = new Map<string, number>();
  let end = 0;
  let previous = { start: 0, end: 0 };

  const resolve = (at: Position | undefined, where: string): number => {
    if (at === undefined) return end;
    if (typeof at === "number") return Math.max(0, finite(`${where}.at`, at));
    const match = POSITION.exec(at);
    if (!match || at === "") throw new Error(`invalid position "${at}"`);
    const [, base, sign, amount] = match;
    let time = end;
    if (base === "<") time = previous.start;
    else if (base === ">") time = previous.end;
    else if (base !== undefined) {
      const label = labels.get(base);
      if (label === undefined) throw new Error(`unknown label "${base}"`);
      time = label;
    }
    if (amount !== undefined) time += (sign === "-" ? -1 : 1) * Number(amount);
    return Math.max(0, time);
  };

  const finiteProps = (where: string, props: Props): Props => {
    for (const [prop, value] of Object.entries(props)) finite(`${where}.${prop}`, value);
    return Object.freeze({ ...props });
  };

  const place = (spec: Omit<TweenSpec, "at">, start: number): Tween => {
    const fromKeys = Object.keys(spec.from).toSorted();
    const toKeys = Object.keys(spec.to).toSorted();
    if (!sameKeys(fromKeys, toKeys))
      throw new Error(
        `${spec.target}: from and to must have the same properties (from: ${fromKeys.join(", ")}; to: ${toKeys.join(", ")})`,
      );
    const tween: Tween = Object.freeze({
      target: spec.target,
      from: finiteProps(`${spec.target}.from`, spec.from),
      to: finiteProps(`${spec.target}.to`, spec.to),
      start,
      duration: Math.max(0, finite(`${spec.target}.duration`, spec.duration)),
      ease: spec.ease ?? "linear",
    });
    tweens.push(tween);
    return tween;
  };

  const markBlock = (start: number, blockEnd: number) => {
    previous = { start, end: blockEnd };
    end = Math.max(end, blockEnd);
  };

  const builder: TimelineBuilder = {
    add(spec) {
      const tween = place(spec, resolve(spec.at, spec.target));
      markBlock(tween.start, endOf(tween));
      return builder;
    },
    stagger(targets, spec, each) {
      finite("stagger each", each);
      const start = resolve(spec.at, "stagger");
      const placed = targets.map((target, i) =>
        place({ ...spec, target }, Math.max(0, start + i * each)),
      );
      // A negative gap places later targets earlier, so the block spans them all.
      markBlock(
        Math.min(start, ...placed.map((tween) => tween.start)),
        Math.max(start, ...placed.map(endOf)),
      );
      return builder;
    },
    label(name, at) {
      if (!LABEL_NAME.test(name)) throw new Error(`invalid label name "${name}"`);
      if (labels.has(name)) throw new Error(`duplicate label "${name}"`);
      labels.set(name, resolve(at, `label ${name}`));
      return builder;
    },
    wait(seconds) {
      markBlock(end, end + Math.max(0, finite("wait", seconds)));
      return builder;
    },
    build: () => toTimeline(tweens, Object.fromEntries(labels), end),
  };
  return builder;
};

type Track = { readonly target: string; readonly prop: string; readonly tweens: readonly Tween[] };

const toTimeline = (
  tweens: readonly Tween[],
  labels: Readonly<Record<string, number>>,
  duration: number,
): Timeline => {
  // One track per animated property, its tweens in start order. The sort is
  // stable, so tweens that start together stay in the order they were added.
  const byKey = new Map<string, { target: string; prop: string; tweens: Tween[] }>();
  for (const tween of tweens) {
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
    tweens: Object.freeze([...tweens]),
    seek(t: number): State {
      const time = Math.min(Math.max(finite("seek", t), 0), duration);
      const state: State = {};
      for (const track of tracks) {
        const props = state[track.target] ?? {};
        props[track.prop] = valueAt(track, time);
        state[track.target] = props;
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
  if (time >= endOf(active)) return to;
  const progress = (time - active.start) / active.duration;
  return from + (to - from) * EASES[active.ease](progress);
};
