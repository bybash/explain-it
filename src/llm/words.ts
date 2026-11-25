import { z } from "zod";
import type { WordProblem } from "../checks/chat-report.ts";
import type { Validated } from "../schema/errors.ts";
import { fail, ok } from "../schema/result.ts";
import { MAX_CAPTION, MAX_SAY } from "../schema/storyboard.ts";
import type { LlmClient } from "./client.ts";
import { type StructuredCall, structuredCall } from "./structured.ts";

const WHAT = { caption: "on-screen caption", say: "narration line" } as const;
const WHY = {
  read: "It goes by too fast to read.",
  fit: "It is too long to say in the time its beat has.",
} as const;

/** The answer: the words again, shorter. */
const ShorterSchema = (field: WordProblem["field"]) =>
  z.strictObject({
    text: z
      .string()
      .min(1)
      .max(field === "caption" ? MAX_CAPTION : MAX_SAY),
  });

/**
 * The call that writes a caption or line again in fewer words (decision
 * 038), for a fix the user is offered: the same meaning and the same names,
 * within the most characters that fit. Its check sends back an answer that
 * is still too long, or unchanged.
 */
export const shorterWordsCall = (
  problem: WordProblem,
  /** What the video is about, so the words keep its terms: the scene's title, say. */
  about: string,
) => {
  const schema = ShorterSchema(problem.field);
  return {
    name: "shorter-words",
    system:
      "You edit the words of an explainer video. Write the given words again, shorter, keeping what they say and every name in them; plain words, no new facts. Answer with the JSON object only.",
    prompt: [
      `The ${WHAT[problem.field]} of beat "${problem.beat}" (${about}):`,
      JSON.stringify(problem.text),
      `${WHY[problem.why]} Write it in at most ${problem.most} characters; it has ${problem.text.length}.`,
    ].join("\n"),
    schema,
    check: (value): Validated<z.output<typeof schema>> =>
      value.text.length > problem.most
        ? fail([
            {
              path: "text",
              message: `${value.text.length} characters, max ${problem.most}`,
            },
          ])
        : value.text === problem.text
          ? fail([{ path: "text", message: "the same words; make it shorter" }])
          : ok(value),
  } satisfies StructuredCall<typeof schema>;
};

/** Shorter words for a problem, or why there are none (no LLM, or no answer that fits). */
export const shorterWords = async (
  client: LlmClient,
  problem: WordProblem,
  about: string,
): Promise<Validated<string>> => {
  const answer = await structuredCall(client, shorterWordsCall(problem, about));
  return answer.ok ? ok(answer.value.text) : answer;
};
