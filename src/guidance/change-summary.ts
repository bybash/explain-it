import type { Project } from "../schema/project.ts";
import type { Brief } from "../schema/story.ts";
import type { Storyboard } from "../schema/storyboard.ts";

/** A commit as a summary shows it: its first seven characters, as Git does. */
const SHORT_COMMIT = 7;

/**
 * A short Markdown summary of a video, for a pull request or a chat
 * (decision 051): its name, the one thing to remember, each scene's title
 * and its beats' captions in order, the files it covers, and the video's
 * link. It is made from the script alone, so it always says what the video
 * says.
 */
export const changeSummary = ({
  name,
  storyboard,
  brief,
  sources,
  video,
}: {
  readonly name: string;
  readonly storyboard: Storyboard;
  readonly brief: Brief | null;
  readonly sources?: Project["sources"] | undefined;
  /** The video's link or path, when it has been rendered. */
  readonly video?: string | undefined;
}): string => {
  const blocks = [`### ${name}`];
  if (brief?.takeaway) blocks.push(brief.takeaway);
  for (const scene of storyboard.scenes)
    blocks.push([`**${scene.title}**`, ...scene.beats.map((b) => `- ${b.caption}`)].join("\n"));
  blocks.push(
    sources && sources.length > 0
      ? `Covers ${sources
          .map((s) => `\`${s.path}\`${s.commit ? ` at ${s.commit.slice(0, SHORT_COMMIT)}` : ""}`)
          .join(", ")}.`
      : "The files it covers were not recorded.",
  );
  if (video) blocks.push(`[Watch the video](${video})`);
  return blocks.join("\n\n");
};
