import type { CategoryColour } from "../engine/theme/categories.ts";
import { KIND_STYLES } from "../engine/theme/kinds.ts";
import { CATEGORIES, DEFAULT_CATEGORY } from "../schema/colours.ts";
import type { Graph } from "../schema/graph.ts";
import type { ColourDraft, ColouredPart } from "./colours-form.ts";
import { capitalised } from "./labels.ts";
import { Section } from "./style-fields.tsx";

type Colours = Readonly<Record<string, CategoryColour>>;

/** One row: a name, the palette's swatches, and what its default colour is. */
const ColourRow = ({
  group,
  name,
  detail,
  chosen,
  fallback,
  colours,
  pick,
  extra,
}: {
  /** The radio group's name, unique in the page. */
  group: string;
  name: string;
  detail?: string | undefined;
  /** The category picked or saved, or null for the default. */
  chosen: string | null;
  /** The category the default draws in. */
  fallback: string;
  colours: Colours;
  pick: (category: string | null) => void;
  extra?: React.ReactNode;
}) => (
  <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
    <span className="min-w-36 flex-1">
      <span className="font-semibold">{name}</span>
      {detail && <span className="ml-2 text-muted text-sm">{detail}</span>}
    </span>
    <span
      className="flex flex-wrap items-center gap-1.5"
      role="radiogroup"
      aria-label={`Colour of ${name}`}
    >
      {CATEGORIES.map((category) => {
        const colour = colours[category];
        const isDefault = category === fallback;
        return (
          <label
            key={category}
            title={colour ? `${category}: ${colour.light} light, ${colour.dark} dark` : category}
          >
            <input
              type="radio"
              className="peer sr-only"
              name={group}
              checked={(chosen ?? fallback) === category}
              aria-label={isDefault ? `${category} (default)` : category}
              onChange={() => pick(isDefault ? null : category)}
            />
            <span
              className="grid size-6 cursor-pointer place-items-center rounded-full border-2 border-surface outline-1 outline-line peer-checked:outline-2 peer-checked:outline-ink peer-focus-visible:outline-accent"
              style={{ background: colour?.light }}
            >
              {/* The default's mark: what picking it goes back to. */}
              {isDefault && <span className="size-1.5 rounded-full bg-surface" />}
            </span>
          </label>
        );
      })}
    </span>
    {extra}
  </li>
);

/**
 * The style gate's Colours tab (decision 043): a palette colour for each
 * node, edge and area, picked from the palette's swatches. A node's default
 * is its kind's colour, an edge's and an area's the accent. What is picked
 * is drawn in the preview straight away and saved with the style.
 */
export const ColoursTab = ({
  graph,
  colours,
  draft,
  change,
}: {
  graph: Graph;
  colours: Colours;
  draft: ColourDraft;
  change: (draft: ColourDraft) => void;
}) => {
  const chosen = (part: ColouredPart, item: { id: string; category?: string | undefined }) =>
    item.id in draft[part] ? (draft[part][item.id] ?? null) : (item.category ?? null);
  const pick = (part: ColouredPart, id: string) => (category: string | null) =>
    change({ ...draft, [part]: { ...draft[part], [id]: category } });
  const labelOf = new Map(graph.nodes.map((n) => [n.id, n.label]));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">
        Each colour comes from the palette, so it works in light and dark alike. The swatch with a
        dot is the default; pick it to go back to it.
      </p>
      <Section title="Nodes">
        <ul className="divide-y divide-line">
          {graph.nodes.map((node) => {
            const fallback = KIND_STYLES[node.kind].category;
            const current = chosen("nodes", node);
            const sameKind = graph.nodes.filter((n) => n.kind === node.kind);
            return (
              <ColourRow
                key={node.id}
                group={`colour-node-${node.id}`}
                name={node.label}
                detail={capitalised(node.kind)}
                chosen={current}
                fallback={fallback}
                colours={colours}
                pick={pick("nodes", node.id)}
                extra={
                  sameKind.length > 1 && (
                    <button
                      type="button"
                      className="text-muted text-sm underline hover:text-ink"
                      onClick={() =>
                        change({
                          ...draft,
                          nodes: {
                            ...draft.nodes,
                            ...Object.fromEntries(sameKind.map((n) => [n.id, current])),
                          },
                        })
                      }
                    >
                      Use for every {node.kind}
                    </button>
                  )
                }
              />
            );
          })}
        </ul>
      </Section>
      {graph.edges.length > 0 && (
        <Section title="Edges">
          <ul className="divide-y divide-line">
            {graph.edges.map((edge) => (
              <ColourRow
                key={edge.id}
                group={`colour-edge-${edge.id}`}
                name={edge.label ?? edge.id}
                detail={`${labelOf.get(edge.from) ?? edge.from} → ${labelOf.get(edge.to) ?? edge.to}`}
                chosen={chosen("edges", edge)}
                fallback={DEFAULT_CATEGORY}
                colours={colours}
                pick={pick("edges", edge.id)}
              />
            ))}
          </ul>
        </Section>
      )}
      {graph.zones.length > 0 && (
        <Section title="Areas">
          <ul className="divide-y divide-line">
            {graph.zones.map((zone) => (
              <ColourRow
                key={zone.id}
                group={`colour-zone-${zone.id}`}
                name={zone.label}
                chosen={chosen("zones", zone)}
                fallback={DEFAULT_CATEGORY}
                colours={colours}
                pick={pick("zones", zone.id)}
              />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
};
