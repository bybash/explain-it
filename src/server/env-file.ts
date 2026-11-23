/**
 * Reading and writing `.env` text, keeping comments, order and every line it
 * does not change. Pure: the settings store does the file input and output.
 */

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

const unquote = (raw: string): string => {
  const value = raw.trim();
  if (value.startsWith('"')) {
    const end = value.lastIndexOf('"');
    const inner = end > 0 ? value.slice(1, end) : value.slice(1);
    return inner.replace(/\\(["\\n])/g, (_, c: string) => (c === "n" ? "\n" : c));
  }
  if (value.startsWith("'")) {
    const end = value.lastIndexOf("'");
    return end > 0 ? value.slice(1, end) : value.slice(1);
  }
  // Unquoted, a # after a space starts a comment.
  return value.replace(/\s+#.*$/, "");
};

/** The variables in `.env` text; lines that set nothing are skipped. */
export const parseEnvFile = (text: string): Map<string, string> => {
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) continue;
    const match = LINE.exec(line);
    if (match?.[1] !== undefined) values.set(match[1], unquote(match[2] ?? ""));
  }
  return values;
};

/** A value as `.env` writes it: bare when it is plain, otherwise in double quotes. */
const quoted = (value: string): string =>
  /^[A-Za-z0-9_./:@+=,-]*$/.test(value) && value !== ""
    ? value
    : `"${value.replace(/[\\"]/g, (c) => `\\${c}`)}"`;

/**
 * `.env` text with `changes` made: a variable set to a string is changed
 * where it is, or added at the end; one set to null is removed.
 */
export const updateEnvFile = (
  text: string,
  changes: Readonly<Record<string, string | null>>,
): string => {
  const pending = new Map(Object.entries(changes));
  const lines = text === "" ? [] : text.replace(/\r?\n$/, "").split(/\r?\n/);
  const kept = lines.flatMap((line) => {
    const name = line.trimStart().startsWith("#") ? undefined : LINE.exec(line)?.[1];
    if (name === undefined || !pending.has(name)) return [line];
    const value = pending.get(name);
    pending.delete(name);
    return value === null || value === undefined ? [] : [`${name}=${quoted(value)}`];
  });
  for (const [name, value] of pending) if (value !== null) kept.push(`${name}=${quoted(value)}`);
  return kept.length === 0 ? "" : `${kept.join("\n")}\n`;
};
