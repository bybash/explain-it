import { useId } from "react";
import type { Graph } from "../schema/graph.ts";
import {
  type Action,
  BADGE_TONES,
  MAX_BADGE_TEXT,
  MAX_CALLOUT_TEXT,
  MAX_CALLOUT_TITLE,
  MAX_CAPTION,
  type Scene,
} from "../schema/storyboard.ts";
import { type ActionType, sceneEdges, withText } from "./script-model.ts";
import { Pill } from "./ui.tsx";

/** What each action does, as the editor names it. */
export const ACTION_LABELS: Readonly<Record<ActionType, string>> = {
  appear: "Show a node",
  flow: "Send along an edge",
  highlight: "Highlight a node",
  callout: "Callout card",
  dim: "Dim all but",
  badge: "Badge",
};

const FIELD = "field py-1 text-sm";

/**
 * One action of a beat: its kind, and its fields, picked from the scene's
 * own nodes and edges so it can only name what the scene shows.
 */
export const ActionRow = ({
  action,
  scene,
  graph,
  change,
  remove,
}: {
  action: Action;
  scene: Scene;
  graph: Graph;
  change: (action: Action) => void;
  remove: () => void;
}) => {
  const id = useId();
  const label = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const nodePicker = (node: string, set: (node: string) => void, name: string) => (
    <select className={FIELD} aria-label={name} value={node} onChange={(e) => set(e.target.value)}>
      {scene.nodes.map((n) => (
        <option key={n} value={n}>
          {label.get(n) ?? n}
        </option>
      ))}
    </select>
  );
  const text = (value: string, max: number, name: string, set: (value: string) => void) => (
    <input
      className={`${FIELD} min-w-40 flex-1`}
      aria-label={name}
      placeholder={name}
      value={value}
      maxLength={max}
      onChange={(e) => set(e.target.value)}
    />
  );

  const fields = () => {
    switch (action.type) {
      case "appear":
      case "highlight":
        return nodePicker(action.node, (node) => change({ ...action, node }), "Node");
      case "flow":
        return (
          <>
            <select
              className={FIELD}
              aria-label="Edge"
              value={action.edge}
              onChange={(e) => change({ ...action, edge: e.target.value })}
            >
              {sceneEdges(scene, graph).map((edge) => (
                <option key={edge.id} value={edge.id}>
                  {label.get(edge.from)} → {label.get(edge.to)}
                  {edge.label ? ` (${edge.label})` : ""}
                </option>
              ))}
            </select>
            {text(action.label ?? "", MAX_CAPTION, "Label on the edge (optional)", (value) =>
              change(withText(action, "label", value)),
            )}
          </>
        );
      case "callout":
        return (
          <>
            {nodePicker(action.node, (node) => change({ ...action, node }), "Node")}
            {text(action.title ?? "", MAX_CALLOUT_TITLE, "Callout title (optional)", (value) =>
              change(withText(action, "title", value)),
            )}
            {text(action.text, MAX_CALLOUT_TEXT, "Callout text", (value) =>
              change({ ...action, text: value }),
            )}
          </>
        );
      case "dim":
        return (
          <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <legend className="sr-only">Nodes left bright</legend>
            {scene.nodes.map((n) => (
              <label key={n} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={action.except.includes(n)}
                  onChange={(e) =>
                    change({
                      ...action,
                      except: e.target.checked
                        ? [...action.except, n]
                        : action.except.filter((x) => x !== n),
                    })
                  }
                />
                {label.get(n) ?? n}
              </label>
            ))}
          </fieldset>
        );
      case "badge":
        return (
          <>
            {nodePicker(action.node, (node) => change({ ...action, node }), "Node")}
            {text(action.text, MAX_BADGE_TEXT, "Badge text", (value) =>
              change({ ...action, text: value }),
            )}
            <select
              className={FIELD}
              aria-label="Badge tone"
              value={action.tone}
              onChange={(e) =>
                change({ ...action, tone: e.target.value as (typeof BADGE_TONES)[number] })
              }
            >
              {BADGE_TONES.map((tone) => (
                <option key={tone} value={tone}>
                  {tone}
                </option>
              ))}
            </select>
          </>
        );
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5" aria-labelledby={id}>
      <span id={id} className="w-36 shrink-0 font-semibold text-sm">
        {ACTION_LABELS[action.type]}
      </span>
      {fields()}
      <Pill
        className="ml-auto"
        onClick={remove}
        aria-label={`Remove: ${ACTION_LABELS[action.type]}`}
      >
        Remove
      </Pill>
    </li>
  );
};
