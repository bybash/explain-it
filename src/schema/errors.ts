import { z } from "zod";
import { fail, ok, type Result } from "./result.ts";

/**
 * A problem in a document, at an exact place. People, MCP agents and the LLM
 * repair loop all read these, so messages are short and concrete.
 */
export const ValidationErrorSchema = z.object({ path: z.string(), message: z.string() });
export type ValidationError = Readonly<z.output<typeof ValidationErrorSchema>>;

export type Validated<T> = Result<T, ValidationError>;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** `["scenes", 1, "caption"]` → `scenes[1].caption`; odd keys are quoted: `[""]`. */
export const formatPath = (path: readonly PropertyKey[]): string => {
  if (path.length === 0) return "(root)";
  return path
    .map((segment, i) => {
      if (typeof segment === "number") return `[${segment}]`;
      const key = String(segment);
      if (!IDENTIFIER.test(key)) return `[${JSON.stringify(key)}]`;
      return i === 0 ? key : `.${key}`;
    })
    .join("");
};

/**
 * The value, or a thrown error listing the problems under `what`. For data
 * already validated at an edge, where a failure is a bug, not an expected one.
 */
export const orThrow = <T>(result: Validated<T>, what: string): T => {
  if (!result.ok) throw new Error(`${what}:\n${formatErrors(result.errors).join("\n")}`);
  return result.value;
};

/** One line per error: `path: message`. */
export const formatErrors = (errors: readonly ValidationError[]): string[] =>
  errors.map((error) => `${error.path}: ${error.message}`);

/** Parses `data` with `schema` and never throws. */
export const parseWith = <S extends z.ZodType>(
  schema: S,
  data: unknown,
): Validated<z.output<S>> => {
  const result = schema.safeParse(data, { reportInput: true });
  if (result.success) return ok(result.data);
  return fail(result.error.issues.flatMap((issue) => issueToErrors(issue, [])));
};

type Issue = z.core.$ZodIssue;

const issueToErrors = (issue: Issue, prefix: readonly PropertyKey[]): ValidationError[] => {
  const path = [...prefix, ...issue.path];
  const at = (message: string): ValidationError[] => [{ path: formatPath(path), message }];

  switch (issue.code) {
    case "invalid_type":
      return at(
        issue.input === undefined
          ? "required"
          : `expected ${issue.expected}, got ${describeType(issue.input)}`,
      );
    case "too_big":
      return at(tooBig(issue));
    case "too_small":
      return at(tooSmall(issue));
    case "invalid_value":
      return at(oneOf(issue.values));
    case "invalid_format":
      return at(invalidFormat(issue));
    case "unrecognized_keys":
      return issue.keys.map((key) => ({
        path: formatPath([...path, key]),
        message: "unknown key",
      }));
    case "invalid_union":
      return invalidUnion(issue, path);
    default:
      return at(issue.message);
  }
};

const describeType = (input: unknown): string => {
  if (input === null) return "null";
  if (Array.isArray(input)) return "array";
  return typeof input;
};

const sizeOf = (input: unknown): number | undefined =>
  typeof input === "string" || Array.isArray(input) ? input.length : undefined;

const tooBig = (issue: z.core.$ZodIssueTooBig): string => {
  const size = sizeOf(issue.input);
  if (issue.origin === "string" && size !== undefined)
    return `${size} characters, max ${issue.maximum}`;
  if (issue.origin === "array" && size !== undefined) return `${size} items, max ${issue.maximum}`;
  return issue.inclusive === false
    ? `must be less than ${issue.maximum}`
    : `must be at most ${issue.maximum}`;
};

const tooSmall = (issue: z.core.$ZodIssueTooSmall): string => {
  const size = sizeOf(issue.input);
  if (issue.origin === "string" && size !== undefined)
    return size === 0 ? "must not be empty" : `${size} characters, min ${issue.minimum}`;
  if (issue.origin === "array" && size !== undefined) return `${size} items, min ${issue.minimum}`;
  return issue.inclusive === false
    ? `must be more than ${issue.minimum}`
    : `must be at least ${issue.minimum}`;
};

const oneOf = (values: readonly unknown[]): string => {
  const quoted = values.map((value) => JSON.stringify(value));
  return quoted.length === 1 ? `must be ${quoted[0]}` : `must be one of ${quoted.join(", ")}`;
};

const invalidFormat = (issue: z.core.$ZodIssueInvalidStringFormat): string => {
  // Patterns carry their own human message, set where the schema is defined.
  if (issue.format === "regex") return issue.message;
  if (issue.format === "datetime") return "must be an ISO date-time";
  return `must be a valid ${issue.format}`;
};

const invalidUnion = (
  issue: z.core.$ZodIssueInvalidUnion,
  path: readonly PropertyKey[],
): ValidationError[] => {
  // A discriminated union with an unknown tag lists the tags it accepts.
  if ("options" in issue && Array.isArray(issue.options)) {
    return [{ path: formatPath(path), message: oneOf(issue.options) }];
  }
  // Otherwise report the branch that came closest: the one whose problems are
  // not just "wrong type here", with the fewest problems.
  const branches = issue.errors.filter(
    (branch) =>
      !(branch.length === 1 && branch[0]?.code === "invalid_type" && branch[0].path.length === 0),
  );
  const closest = branches.toSorted((a, b) => a.length - b.length)[0];
  if (closest) return closest.flatMap((nested) => issueToErrors(nested, path));
  return [{ path: formatPath(path), message: "does not match any allowed form" }];
};
