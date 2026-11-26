import { GATES, type Gate } from "../schema/project.ts";

export type Route =
  | { readonly page: "list" }
  | { readonly page: "settings" }
  | {
      readonly page: "project";
      readonly slug: string;
      readonly gate?: Gate;
      /** A beat to open in the Script gate's editor. */
      readonly beat?: string;
    };

/**
 * The page an address names: `#/projects/<slug>` opens a project at the
 * gate it has reached, `#/projects/<slug>/<gate>` at that gate,
 * `#/projects/<slug>/script/<beat>` at a beat of the script, and
 * `#/settings` the settings; anything else lists the projects.
 */
export const route = (hash: string): Route => {
  if (hash === "#/settings") return { page: "settings" };
  const match = /^#\/projects\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/.exec(hash);
  if (!match?.[1]) return { page: "list" };
  const slug = decodeURIComponent(match[1]);
  const gate = GATES.find((g) => g === match[2]);
  if (!gate) return { page: "project", slug };
  const beat = gate === "script" && match[3] ? decodeURIComponent(match[3]) : undefined;
  return beat ? { page: "project", slug, gate, beat } : { page: "project", slug, gate };
};

/** The address of a project, at a gate, or at a beat in the Script gate (see `route`). */
export const projectHref = (slug: string, gate?: Gate, beat?: string): string =>
  [`#/projects/${encodeURIComponent(slug)}`, gate, gate === "script" ? beat : undefined]
    .filter((part) => part !== undefined)
    .map((part, i) => (i === 2 ? encodeURIComponent(part as string) : part))
    .join("/");

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
 * `requested` when it is open, and otherwise at the gate reached.
 */
export const gateSteps = (reached: Gate, requested?: Gate): GateStep[] => {
  const at = GATES.indexOf(reached);
  const viewed = requested !== undefined && GATES.indexOf(requested) <= at ? requested : reached;
  return GATES.map((gate, i) => ({
    gate,
    state: i < at ? "done" : i === at ? "current" : "next",
    open: i <= at,
    viewed: gate === viewed,
  }));
};
