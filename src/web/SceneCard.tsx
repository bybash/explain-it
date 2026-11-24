import type { ReactNode } from "react";
import type { Graph } from "../schema/graph.ts";
import { MAX_CAPTION, MAX_SCENE_NODES, type Scene } from "../schema/storyboard.ts";
import { Pill } from "./ui.tsx";

/** A scene: its title, the graph's nodes it shows, and its beats. */
export const SceneCard = ({
  number,
  graph,
  scene,
  errors,
  canRemove,
  title,
  nodes,
  remove,
  children,
}: {
  number: number;
  graph: Graph;
  scene: Scene;
  errors: readonly string[];
  canRemove: boolean;
  title: (title: string) => void;
  nodes: (nodes: string[]) => void;
  remove: () => void;
  children: ReactNode;
}) => {
  const full = scene.nodes.length >= MAX_SCENE_NODES;
  return (
    <section
      className="rounded-box border border-line p-4"
      aria-label={`Scene ${number}`}
      data-scene={scene.id}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-semibold">Scene {number}</span>
          <input
            className="field"
            value={scene.title}
            maxLength={MAX_CAPTION}
            placeholder="Its title, shown as the scene starts"
            onChange={(e) => title(e.target.value)}
          />
        </label>
        {canRemove && (
          <Pill onClick={remove} aria-label={`Remove scene ${number}`}>
            Remove the scene
          </Pill>
        )}
      </div>
      <fieldset className="mt-3 text-sm">
        <legend className="font-semibold">
          Nodes in this scene{" "}
          <span className="font-normal text-muted">
            ({scene.nodes.length} of at most {MAX_SCENE_NODES})
          </span>
        </legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {graph.nodes.map((node) => {
            const on = scene.nodes.includes(node.id);
            return (
              <label key={node.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && full}
                  onChange={(e) =>
                    nodes(
                      e.target.checked
                        ? [...scene.nodes, node.id]
                        : scene.nodes.filter((n) => n !== node.id),
                    )
                  }
                />
                {node.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      {errors.length > 0 && (
        <ul className="mt-2 text-error text-sm" aria-label={`Problems in scene ${number}`}>
          {errors.map((e, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: two problems may read the same.
            <li key={`${i}-${e}`}>{e}</li>
          ))}
        </ul>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
};
