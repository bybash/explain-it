import { useEffect, useState } from "react";
import { ProjectList } from "./ProjectList.tsx";
import { ProjectView } from "./ProjectView.tsx";

/** The page the address names: `#/projects/<slug>` opens a project; anything else lists them. */
const route = (hash: string): { page: "list" } | { page: "project"; slug: string } => {
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
      </header>
      <main className="shell-main">
        {current.page === "project" ? <ProjectView slug={current.slug} /> : <ProjectList />}
      </main>
    </div>
  );
};
