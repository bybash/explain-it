/**
 * Reading and writing `.env` text, keeping comments, order, line endings and
 * every line it does not change. Pure: the settings store does the file
 * input and output.
 */

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

const nameOf = (line: string): string | undefined =>
  line.trimStart().startsWith("#") ? undefined : LINE.exec(line)?.[1];

/** A double-quoted value up to its closing quote, with `\n`, `\r`, `\"` and `\\` read back. */
const doubleQuoted = (value: string): string => {
  let out = "";
  for (let i = 1; i < value.length; i++) {
    const c = value[i];
    if (c === '"') break;
    if (c === "\\" && i + 1 < value.length) {
      const next = value[++i];
      out += next === "n" ? "\n" : next === "r" ? "\r" : next;
    } else out += c;
  }
  return out;
};

const unquote = (raw: string): string => {
  const value = raw.trim();
  if (value.startsWith('"')) return doubleQuoted(value);
  if (value.startsWith("'")) {
    const end = value.indexOf("'", 1);
    return end > 0 ? value.slice(1, end) : value.slice(1);
  }
  // Unquoted, a # at the start or after a space starts a comment.
  return value.startsWith("#") ? "" : value.replace(/\s+#.*$/, "");
};

/** The variables in `.env` text; lines that set nothing are skipped, and a later line wins. */
export const parseEnvFile = (text: string): Map<string, string> => {
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const name = nameOf(line);
    if (name !== undefined) values.set(name, unquote(LINE.exec(line)?.[2] ?? ""));
  }
  return values;
};

/** A value as `.env` writes it: bare when it is plain, otherwise in double quotes, always on one line. */
const quoted = (value: string): string =>
  /^[A-Za-z0-9_./:@+=,-]+$/.test(value)
    ? value
    : `"${value.replace(/[\\"\n\r]/g, (c) => (c === "\n" ? "\\n" : c === "\r" ? "\\r" : `\\${c}`))}"`;

/**
 * `.env` text with `changes` made: a variable set to a string is changed on
 * its first line (and any later lines for it are dropped, since the last one
 * is the one read) or added at the end; one set to null is removed.
 */
export const updateEnvFile = (
  text: string,
  changes: Readonly<Record<string, string | null>>,
): string => {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text === "" ? [] : text.replace(/\r?\n$/, "").split(/\r?\n/);
  const written = new Set<string>();
  const kept = lines.flatMap((line) => {
    const name = nameOf(line);
    if (name === undefined || !Object.hasOwn(changes, name)) return [line];
    const value = changes[name];
    if (written.has(name) || value === null || value === undefined) return [];
    written.add(name);
    return [`${name}=${quoted(value)}`];
  });
  for (const [name, value] of Object.entries(changes))
    if (value !== null && !written.has(name)) kept.push(`${name}=${quoted(value)}`);
  return kept.length === 0 ? "" : `${kept.join(eol)}${eol}`;
};
