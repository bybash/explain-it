import { useEffect, useState } from "react";
import { ProjectList } from "./ProjectList.tsx";
import { ProjectView } from "./ProjectView.tsx";
import { Settings } from "./Settings.tsx";

/** The page the address names: `#/projects/<slug>` opens a project, `#/settings` the settings; anything else lists them. */
const route = (
  hash: string,
): { page: "list" } | { page: "settings" } | { page: "project"; slug: string } => {
  if (hash === "#/settings") return { page: "settings" };
  const match = /^#\/projects\/([^/]+)$/.exec(hash);
  return match?.[1] ? { page: "project", slug: decodeURIComponent(match[1]) } : { page: "list" };
};

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
      <main className="shell-main">
        {current.page === "project" ? (
          <ProjectView slug={current.slug} />
        ) : current.page === "settings" ? (
          <Settings />
        ) : (
          <ProjectList />
        )}
      </main>
    </div>
  );
};
