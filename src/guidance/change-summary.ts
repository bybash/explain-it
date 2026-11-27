import type { Project } from "../schema/project.ts";
import type { Brief } from "../schema/story.ts";
import type { Storyboard } from "../schema/storyboard.ts";

/** A commit as a summary shows it: its first seven characters, as Git does. */
const SHORT_COMMIT = 7;

/**
 * Text from the script as plain Markdown text, on one line: HTML and the
 * characters Markdown reads are escaped, and `@` and `#` become entities, so
 * a summary posted to a pull request mentions no one and links no issue.
 */
const plain = (text: string): string =>
  text
    .replace(/\s+/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // `#` first: the entity for `@` has one of its own.
    .replace(/#/g, "&#35;")
    .replace(/@/g, "&#64;")
    .replace(/[\\`*_[\]()|~!]/g, "\\$&");

/** A link's address in angle brackets, which may hold spaces and parentheses; `<`, `>` and line breaks are encoded. */
const destination = (url: string): string =>
  `<${url.replace(/[<>\r\n]/g, (c) => encodeURIComponent(c))}>`;

/**
 * A short Markdown summary of a video, for a pull request or a chat
 * (decision 051): its name, the one thing to remember, each scene's title
 * and its beats' captions in order, the files it covers, and the video's
 * link. It is made from the script alone, so it says what the script says;
 * its words are plain text (see `plain`).
 */
export const changeSummary = ({
  name,
  storyboard,
  brief,
  sources,
  videoUrl,
  gifUrl,
}: {
  readonly name: string;
  readonly storyboard: Storyboard;
  readonly brief: Brief | null;
  readonly sources?: Project["sources"] | undefined;
  /** Where the video was put for readers to watch: an http or https address. */
  readonly videoUrl?: string | undefined;
  /** Where the GIF of one scene was put: shown under the title, where it plays inline. */
  readonly gifUrl?: string | undefined;
}): string => {
  const blocks = [`### ${plain(name)}`];
  if (gifUrl) blocks.push(`![A scene of the video](${destination(gifUrl)})`);
  if (brief?.takeaway) blocks.push(plain(brief.takeaway));
  for (const scene of storyboard.scenes)
    blocks.push(
      [`**${plain(scene.title)}**`, ...scene.beats.map((b) => `- ${plain(b.caption)}`)].join("\n"),
    );
  blocks.push(
    sources && sources.length > 0
      ? `Covers ${sources
          .map((s) => `${plain(s.path)}${s.commit ? ` at ${s.commit.slice(0, SHORT_COMMIT)}` : ""}`)
          .join(", ")}.`
      : "The files it covers were not recorded.",
  );
  if (videoUrl) blocks.push(`[Watch the video](${destination(videoUrl)})`);
  return blocks.join("\n\n");
};
