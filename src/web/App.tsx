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
    <div className="shell">
      <header className="shell-header">
        <a className="brand" href="#/">
          expl<span className="brand-ai">AI</span>n-it
        </a>
        <nav className="shell-nav">
          <a href="#/settings" aria-current={current.page === "settings" ? "page" : undefined}>
            Settings
          </a>
        </nav>
      </header>
      <main className={current.page === "project" ? "shell-main wide" : "shell-main"}>
        {current.page === "project" ? (
          <ProjectView slug={current.slug} gate={current.gate} />
        ) : current.page === "settings" ? (
          <Settings />
        ) : (
          <ProjectList />
        )}
      </main>
    </div>
  );
};
