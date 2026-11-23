import { GATES, type Gate } from "../schema/project.ts";

export type Route =
  | { readonly page: "list" }
  | { readonly page: "settings" }
  | { readonly page: "project"; readonly slug: string; readonly gate?: Gate };

/**
 * The page an address names: `#/projects/<slug>` opens a project at the
 * gate it has reached, `#/projects/<slug>/<gate>` at that gate, and
 * `#/settings` the settings; anything else lists the projects.
 */
export const route = (hash: string): Route => {
  if (hash === "#/settings") return { page: "settings" };
  const match = /^#\/projects\/([^/]+)(?:\/([^/]+))?$/.exec(hash);
  if (!match?.[1]) return { page: "list" };
  const slug = decodeURIComponent(match[1]);
  const gate = GATES.find((g) => g === match[2]);
  return gate ? { page: "project", slug, gate } : { page: "project", slug };
};

export type GateStep = {
  readonly gate: Gate;
  /** Approved, the one reached, or not reached yet. */
  readonly state: "done" | "current" | "next";
  /** Whether the user can open it: any gate up to the one reached (SPEC, User flow). */
  readonly open: boolean;
  /** Whether the panel shows it. */
  readonly viewed: boolean;
};

/**
 * The gate stepper: the project has reached `reached`; the user looks at
 * `asked` when it is open, and otherwise at the gate reached.
 */
export const gateSteps = (reached: Gate, asked?: Gate): GateStep[] => {
  const at = GATES.indexOf(reached);
  const viewed = asked !== undefined && GATES.indexOf(asked) <= at ? asked : reached;
  return GATES.map((gate, i) => ({
    gate,
    state: i < at ? "done" : i === at ? "current" : "next",
    open: i <= at,
    viewed: gate === viewed,
  }));
};
