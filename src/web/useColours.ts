import { useEffect, useRef, useState } from "react";
import type { Category } from "../schema/colours.ts";
import type { Graph } from "../schema/graph.ts";
import {
  type ColourDraft,
  type ColouredPart,
  changesColours,
  colourChange,
  colouredGraph,
  NO_COLOURS,
  settled,
  withPick,
} from "./colours-form.ts";

/**
 * The Colours tab's state (decision 043): the picks not saved yet, over the
 * graph as it is on disk. A graph changed elsewhere settles them: picks it
 * now has are done, and picks for something recoloured meanwhile are dropped
 * and said, so a save never undoes another change.
 */
export const useColours = (onDisk: Graph | null) => {
  const [draft, setDraft] = useState<ColourDraft>(NO_COLOURS);
  /** The graph a save answered with, shown until the project is opened again with it. */
  const [justSaved, setJustSaved] = useState<Graph>();
  const [lost, setLost] = useState<readonly string[]>([]);
  const graph = justSaved ?? onDisk;

  const seen = useRef(JSON.stringify(onDisk));
  useEffect(() => {
    const now = JSON.stringify(onDisk);
    if (now === seen.current) return;
    seen.current = now;
    setJustSaved(undefined);
    if (!onDisk) return;
    setDraft((current) => {
      const next = settled(onDisk, current);
      if (next.lost.length > 0) setLost(next.lost);
      return next.draft;
    });
  }, [onDisk]);

  const change = graph ? colourChange(graph, draft) : {};
  return {
    graph,
    draft,
    change,
    changed: changesColours(change),
    /** Graph changes elsewhere dropped these picks; said until the next pick. */
    lost,
    preview: graph ? colouredGraph(graph, draft) : null,
    pick: (part: ColouredPart, ids: readonly string[], to: Category | null) => {
      if (!graph) return;
      setLost([]);
      setDraft((current) => ids.reduce((d, id) => withPick(d, graph, part, id, to), current));
    },
    saved: (next: Graph) => {
      setJustSaved(next);
      setDraft(NO_COLOURS);
    },
  };
};
