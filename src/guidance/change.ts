import { TOOL_NAMES } from "../schema/mcp.ts";
import { MAX_SCENES, MIN_BEATS } from "../schema/storyboard.ts";

/**
 * How to explain a code change, for the `explain_change` prompt (decision
 * 051): the agent has the diff; the video tells reviewers what changed, as
 * before and after, and what to look at.
 */
export const CHANGE_GUIDE = `## Explaining a change

You have the change (its diff, its pull request). The video is for people who will not read all of it: show them what changed, then what to look at.

1. **Graph**: only the parts of the system the change touches, and the parts they talk to, named as the code names them. Fewer is clearer. Pass the files the change touches as \`sources\` to \`${TOOL_NAMES.createProject}\`, each with the commit, so the video says what it covers.
2. **Brief** (\`${TOOL_NAMES.setBrief}\`): shape \`before-after\`, with a last scene for review after the after; the audience is the people reviewing or affected by the change; the takeaway is what is different now, in one sentence.
3. **Script**, in three scenes (at most ${MAX_SCENES}), each of at least ${MIN_BEATS} beats:
   - **Before**: how it worked, and what was wrong with it or missing.
   - **After**: what the change does, step by step; a badge or callout marks each part it changes; its last beat says what is better now.
   - **What to review**: the parts most worth a reviewer's time, a beat each, saying why (a new dependency, a changed contract, a risky edge case). With fewer than ${MIN_BEATS} such parts, end with how the change was tested, or what it leaves as it was.
   Say only what the change shows. Leave out what it does not touch.
4. **Card** (\`${TOOL_NAMES.setCard}\`): a headline, then what changed, why, and what to look at, a point each.
5. **Share**: run \`${TOOL_NAMES.check}\`, then \`${TOOL_NAMES.render}\`; once the render is done, \`${TOOL_NAMES.explainChange}\` gives the summary to post where the change is discussed, and the paths of the video, its poster, the GIF of one scene and the TL;DR card on this machine (\`outdated\` means the project changed after that render: render again). Put the video and the GIF where readers can see them (attached to the pull request, say), then pass their addresses as \`video_url\` and \`gif_url\`: the summary links the video and shows the GIF, which plays inline. The card suits a chat or a link preview. Post only when the user says so.

Wait for the user's approval of the graph and of the script, as the guide below says.`;
