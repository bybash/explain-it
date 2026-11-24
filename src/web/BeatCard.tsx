import { useId } from "react";
import type { Graph } from "../schema/graph.ts";
import { ACTION_TYPES, type Beat, MAX_CAPTION, MAX_SAY, type Scene } from "../schema/storyboard.ts";
import { ACTION_LABELS, ActionRow } from "./ActionRow.tsx";
import { type ActionType, type BeatHint, newAction } from "./script-model.ts";
import { Pill } from "./ui.tsx";

/** What the beat card can do to its beat and its place, wired by the panel. */
export type BeatControls = {
  readonly change: (beat: Beat) => void;
  readonly addAction: (type: ActionType) => void;
  readonly removeAction: (index: number) => void;
  readonly move: (by: -1 | 1) => void;
  readonly remove: () => void;
  readonly addAfter: () => void;
};

/**
 * One beat in the Script gate's editor: its caption, its narration and its
 * actions, how long it lasts and what to change, and whether a graph edit
 * made it stale. `errors` are the problems the schema finds in it.
 */
export const BeatCard = ({
  number,
  beat,
  scene,
  graph,
  hint,
  stale,
  errors,
  first,
  last,
  controls,
}: {
  number: number;
  beat: Beat;
  scene: Scene;
  graph: Graph;
  hint: BeatHint | undefined;
  stale: boolean;
  errors: readonly string[];
  first: boolean;
  last: boolean;
  controls: BeatControls;
}) => {
  const id = useId();
  const name = `Beat ${number}`;
  return (
    <li
      className={`rounded-box border bg-surface p-3 ${stale ? "border-warn" : "border-line"}`}
      aria-labelledby={`${id}-name`}
      data-beat={beat.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h5 id={`${id}-name`} className="font-semibold">
          {name}
        </h5>
        {hint && <span className="text-muted text-sm tabular-nums">{hint.seconds} s</span>}
        {stale && (
          <span className="rounded-full bg-warn/15 px-2 text-sm text-warn">
            Stale: the graph changed
          </span>
        )}
        <span className="ml-auto flex gap-1">
          <Pill onClick={() => controls.move(-1)} disabled={first} aria-label={`Move ${name} up`}>
            ↑
          </Pill>
          <Pill onClick={() => controls.move(1)} disabled={last} aria-label={`Move ${name} down`}>
            ↓
          </Pill>
          <Pill onClick={controls.remove} aria-label={`Remove ${name}`}>
            Remove
          </Pill>
        </span>
      </div>

      <label className="mt-2 flex flex-col gap-1 text-sm">
        <span className="font-semibold">Caption</span>
        <input
          className="field"
          value={beat.caption}
          maxLength={MAX_CAPTION}
          onChange={(e) => controls.change({ ...beat, caption: e.target.value })}
        />
      </label>
      <label className="mt-2 flex flex-col gap-1 text-sm">
        <span className="font-semibold">Narration</span>
        <textarea
          className="field min-h-16"
          value={beat.say ?? ""}
          maxLength={MAX_SAY}
          placeholder="What the voice says. Without it, the beat is timed by its caption."
          onChange={(e) => {
            const { say: _say, ...rest } = beat;
            controls.change(e.target.value === "" ? rest : { ...rest, say: e.target.value });
          }}
        />
      </label>

      <h6 className="mt-3 font-semibold text-sm">Actions</h6>
      {beat.actions.length === 0 ? (
        <p className="text-muted text-sm">None: the beat shows its caption over the scene.</p>
      ) : (
        <ul className="divide-y divide-line" aria-label={`Actions of ${name}`}>
          {beat.actions.map((action, i) => (
            <ActionRow
              // Actions have no ids; their place is what the editor changes.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above.
              key={i}
              action={action}
              scene={scene}
              graph={graph}
              change={(next) =>
                controls.change({
                  ...beat,
                  actions: beat.actions.map((a, j) => (j === i ? next : a)),
                })
              }
              remove={() => controls.removeAction(i)}
            />
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          className="field py-1 text-sm"
          aria-label={`Add an action to ${name}`}
          value=""
          onChange={(e) => controls.addAction(e.target.value as ActionType)}
        >
          <option value="">Add an action…</option>
          {ACTION_TYPES.map((type) => (
            <option key={type} value={type} disabled={!newAction(type, scene, graph)}>
              {ACTION_LABELS[type]}
            </option>
          ))}
        </select>
        <Pill
          className="ml-auto"
          onClick={controls.addAfter}
          aria-label={`Add a beat after ${name}`}
        >
          Add a beat after
        </Pill>
      </div>

      {(hint?.hints.length ?? 0) > 0 && (
        <ul className="mt-2 text-sm text-warn" aria-label={`Hints for ${name}`}>
          {hint?.hints.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      {errors.length > 0 && (
        <ul className="mt-2 text-error text-sm" aria-label={`Problems in ${name}`}>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </li>
  );
};
