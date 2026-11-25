import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Links open apart from the app, which would otherwise be left behind. */
const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

/**
 * A chat message as Markdown (GitHub's kind). HTML in it is dropped, links
 * that run code lose their address, and images are never loaded: a reply
 * may quote what it read, so it must not be able to add to the page or call
 * out to another site.
 */
export const Markdown = ({ text }: { text: string }) => (
  <div className="markdown">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={COMPONENTS}
      disallowedElements={["img"]}
      skipHtml
    >
      {text}
    </ReactMarkdown>
  </div>
);
