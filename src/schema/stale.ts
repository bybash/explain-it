import type { Graph } from "./graph.ts";
import type { Action, Storyboard } from "./storyboard.ts";

/** An item as the script sees it: its colour is left out, as no beat depends on it. */
const scripted = ({ category: _category, ...item }: { readonly category?: string | undefined }) =>
  JSON.stringify(item);

/** The ids of nodes and edges that are gone or differ, in anything but their colour, between two graphs. */
const changedIds = (before: Graph, after: Graph): Set<string> => {
  const changed = new Set<string>();
  const compare = <T extends { id: string; category?: string | undefined }>(
    old: readonly T[],
    next: readonly T[],
  ) => {
    const now = new Map(next.map((item) => [item.id, scripted(item)]));
    for (const item of old) if (now.get(item.id) !== scripted(item)) changed.add(item.id);
  };
  compare(before.nodes, after.nodes);
  compare(before.edges, after.edges);
  return changed;
};

/** The node and edge ids an action names. */
const named = (action: Action): readonly string[] => {
  switch (action.type) {
    case "flow":
      return [action.edge];
    case "dim":
      return action.except;
    default:
      return [action.node];
  }
};

/**
 * The beats a graph edit makes stale: those whose actions name a node or an
 * edge that changed or was removed (SPEC, User flow). A beat that names
 * nothing that changed stays as it is.
 */
export const staleBeats = (before: Graph, after: Graph, storyboard: Storyboard): string[] => {
  const changed = changedIds(before, after);
  return storyboard.scenes
    .flatMap((scene) => scene.beats)
    .filter((beat) => beat.actions.some((action) => named(action).some((id) => changed.has(id))))
    .map((beat) => beat.id);
};
