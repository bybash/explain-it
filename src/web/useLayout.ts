import { useEffect, useState } from "react";
import { LAYOUT_KEY, type Layout, layoutChoices, readLayout, shownLayout, WIDE } from "./layout.ts";

/** What the browser kept, or nothing where it keeps nothing (private windows, blocked storage). */
const kept = (): string | null => {
  try {
    return localStorage.getItem(LAYOUT_KEY);
  } catch {
    return null;
  }
};

/** The project page's layout: the one chosen here before, as far as the screen has room for it. */
export const useLayout = () => {
  const [chosen, setChosen] = useState<Layout>(() => readLayout(kept()));
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches);
  useEffect(() => {
    const media = matchMedia(WIDE);
    const changed = () => setWide(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  const choose = (layout: Layout) => {
    setChosen(layout);
    try {
      localStorage.setItem(LAYOUT_KEY, layout);
    } catch {
      // Kept for this page only.
    }
  };
  return { layout: shownLayout(chosen, { wide }), choices: layoutChoices({ wide }), choose };
};
