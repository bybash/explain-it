import { useEffect, useState } from "react";
import { ProjectList } from "./ProjectList.tsx";
import { ProjectView } from "./ProjectView.tsx";
import { route } from "./route.ts";
import { Settings } from "./Settings.tsx";

/** The app shell: a header and the page for the current address. */
export const App = () => {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const changed = () => setHash(location.hash);
    addEventListener("hashchange", changed);
    return () => removeEventListener("hashchange", changed);
  }, []);
  const current = route(hash);
  return (
    <div>
      <header className="flex h-14 items-center justify-between border-b border-line bg-surface px-6">
        <a className="font-bold text-lg" href="#/">
          expl<span className="text-accent">AI</span>n-it
        </a>
        <nav>
          <a
            className="font-semibold text-muted aria-[current=page]:text-accent"
            href="#/settings"
            aria-current={current.page === "settings" ? "page" : undefined}
          >
            Settings
          </a>
        </nav>
      </header>
      <main
        className={`mx-auto px-6 ${current.page === "project" ? "max-w-[1600px] pt-4 pb-8" : "max-w-[880px] pt-8 pb-16"}`}
      >
        {current.page === "project" ? (
          <ProjectView slug={current.slug} gate={current.gate} beat={current.beat} />
        ) : current.page === "settings" ? (
          <Settings />
        ) : (
          <ProjectList />
        )}
      </main>
    </div>
  );
};
