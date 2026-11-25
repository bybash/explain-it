/** How a project's page shares the screen: the chat, the gate's panel, or both side by side. */
export type Layout = "chat" | "split" | "panel";

export const LAYOUT_LABELS: Readonly<Record<Layout, string>> = {
  chat: "Chat",
  split: "Split",
  panel: "Panel",
};

/** The width from which the chat and the panel fit side by side; `useLayout` watches it. */
export const WIDE = "(min-width: 861px)";
/** Where the browser keeps the layout chosen. */
export const LAYOUT_KEY = "explain-it-layout";

type Screen = { readonly wide: boolean };

/** The layouts a screen has room for. */
export const layoutChoices = ({ wide }: Screen): readonly Layout[] =>
  wide ? ["chat", "split", "panel"] : ["chat", "panel"];

/** The layout shown: the one chosen, or the chat where a split does not fit. */
export const shownLayout = (chosen: Layout, screen: Screen): Layout =>
  layoutChoices(screen).includes(chosen) ? chosen : "chat";

/** The layout that shows a gate's panel when only the chat is shown: beside it, where there is room. */
export const withPanel = (shown: Layout, screen: Screen): Layout =>
  shown === "chat" ? (screen.wide ? "split" : "panel") : shown;

/** The layout kept from before, or a split. */
export const readLayout = (kept: string | null): Layout =>
  kept === "chat" || kept === "panel" ? kept : "split";
