import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Links open apart from the app, which would otherwise be left behind; a
 * message's headings sit under the page's own; a wide table scrolls by itself.
 */
const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  h1: ({ children }) => <h3>{children}</h3>,
  h2: ({ children }) => <h4>{children}</h4>,
  h3: ({ children }) => <h5>{children}</h5>,
  h4: ({ children }) => <h6>{children}</h6>,
  h5: ({ children }) => <h6>{children}</h6>,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
};

/**
 * A chat message as Markdown (GitHub's kind). HTML in it shows as the text
 * it is, links that run code lose their address, and images are never
 * loaded: a reply may quote what it read, so it must not be able to add to
 * the page or call out to another site. Drawn again only when its text
 * changes, not at every key typed under it.
 */
export const Markdown = memo(({ text }: { text: string }) => (
  <div className="markdown">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS} disallowedElements={["img"]}>
      {text}
    </ReactMarkdown>
  </div>
));
