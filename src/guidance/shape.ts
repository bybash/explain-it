import { z } from "zod";

/**
 * A zod schema written as TypeScript-like types for people and agents to
 * read: every field, whether it is optional, its limits, default and
 * description, all read from the schema itself, so the text cannot drift
 * from what is accepted. Each object becomes a named type with its fields
 * commented: an array field's items are named by `names` (`{ nodes: "Node" }`),
 * other objects after their key, and a union's variants after their type tag.
 */

type Json = {
  readonly type?: string;
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly anyOf?: readonly Json[];
  readonly oneOf?: readonly Json[];
  readonly items?: Json;
  readonly properties?: Readonly<Record<string, Json>>;
  readonly required?: readonly string[];
  readonly description?: string;
  readonly default?: unknown;
  readonly maxLength?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly pattern?: string;
};

/** A named type still to write; a union's variant shows its description above it. */
type Pending = { readonly name: string; readonly schema: Json; readonly variant?: boolean };

const literal = (value: unknown) => JSON.stringify(value);
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** The alternatives of a union, leaving out `anyOf` entries that only say which fields are required. */
const alternativesOf = (schema: Json): readonly Json[] | undefined => {
  const options = (schema.anyOf ?? schema.oneOf)?.filter(
    (o) => o.type || o.const !== undefined || o.enum || o.properties || o.anyOf || o.oneOf,
  );
  return options && options.length > 0 ? options : undefined;
};

/** "needs at least one of: light, dark", for an object whose `anyOf` only names required fields. */
const requiresOneOf = (schema: Json): string | undefined => {
  const options = schema.anyOf ?? schema.oneOf;
  if (!options || alternativesOf(schema)) return undefined;
  const fields = options.flatMap((o) => o.required ?? []);
  return fields.length > 0 ? `needs at least one of: ${fields.join(", ")}` : undefined;
};

/** What a field's comment says: its description, then its limits and default. */
const notes = (schema: Json): string => {
  const limits: string[] = [];
  const target = schema.items && !schema.items.properties ? schema.items : schema;
  if (target.maxLength !== undefined) limits.push(`≤ ${target.maxLength} characters`);
  if (target.pattern !== undefined) limits.push(`matches ${target.pattern}`);
  if (schema.minItems !== undefined && schema.maxItems !== undefined)
    limits.push(`${schema.minItems}–${schema.maxItems} items`);
  else if (schema.maxItems !== undefined) limits.push(`≤ ${schema.maxItems} items`);
  else if (schema.minItems !== undefined) limits.push(`at least ${schema.minItems}`);
  // The largest safe integer is zod's way of saying "any whole number".
  const maximum = schema.maximum === Number.MAX_SAFE_INTEGER ? undefined : schema.maximum;
  if (schema.minimum !== undefined && maximum !== undefined)
    limits.push(`from ${schema.minimum} to ${maximum}`);
  else if (maximum !== undefined) limits.push(`at most ${maximum}`);
  else if (schema.minimum !== undefined) limits.push(`at least ${schema.minimum}`);
  if (schema.default !== undefined && typeof schema.default !== "object")
    limits.push(`default ${literal(schema.default)}`);
  const rest = limits.join("; ");
  const description = schema.description ?? "";
  if (!description) return rest;
  if (!rest) return description;
  return /[.!?]$/.test(description) ? `${description} ${rest}` : `${description}; ${rest}`;
};

/** A field's type; objects are queued as named types and written by name. */
const typeOf = (
  schema: Json,
  name: string,
  pending: Pending[],
  names: Readonly<Record<string, string>>,
): string => {
  if (schema.const !== undefined) return literal(schema.const);
  if (schema.enum) return schema.enum.map(literal).join(" | ");
  const options = alternativesOf(schema);
  if (options && !schema.properties) {
    // A union of objects is one named type, written variant by variant; a mixed one stays inline.
    if (options.every((o) => o.type === "object")) {
      pending.push({ name, schema });
      return name;
    }
    return options.map((o) => typeOf(o, name, pending, names)).join(" | ");
  }
  switch (schema.type) {
    case "array": {
      if (!schema.items) return "unknown[]";
      const item = typeOf(schema.items, name, pending, names);
      return item.includes("|") ? `(${item})[]` : `${item}[]`;
    }
    case "object":
      pending.push({ name, schema });
      return name;
    case "integer":
      return "number";
    case undefined:
      return "unknown";
    default:
      return schema.type;
  }
};

const lineFor = (text: string, comment: string) => (comment ? `${text}   // ${comment}` : text);

/** The type tag a union's variant carries, such as "flow" for `{ type: "flow" }`. */
const tagOf = (variant: Json): string | undefined => {
  for (const field of Object.values(variant.properties ?? {}))
    if (typeof field.const === "string") return field.const;
  return undefined;
};

/** One named type: an object as a block of fields, a union of objects as one type per variant. */
const block = (
  { name, schema, variant }: Pending,
  pending: Pending[],
  names: Readonly<Record<string, string>>,
): string[] => {
  const variants = schema.properties ? undefined : alternativesOf(schema);
  if (variants) {
    const variantNames = variants.map((v, i) => {
      const tag = tagOf(v);
      return tag ? `${capital(tag)}${name}` : `${name}${i + 1}`;
    });
    variants.forEach((v, i) => {
      pending.push({ name: variantNames[i] ?? name, schema: v, variant: true });
    });
    return [`type ${name} = ${variantNames.join(" | ")};`];
  }
  const required = new Set(schema.required ?? []);
  const fields = Object.entries(schema.properties ?? {})
    .filter(([key]) => key !== "$schema")
    .map(([key, field]) =>
      lineFor(
        `  ${key}${required.has(key) ? "" : "?"}: ${typeOf(field, names[key] ?? capital(key), pending, names)};`,
        notes(field),
      ),
    );
  // A field already shows its object's description; a union's variant has no field of its own.
  const header = [variant ? schema.description : undefined, requiresOneOf(schema)]
    .filter(Boolean)
    .map((c) => `// ${c}`);
  return [...header, `type ${name} = {`, ...fields, "};"];
};

/**
 * The schema as TypeScript-like types, the root first and then each named
 * type in the order it is reached. The root's own description is left to
 * the text around it.
 */
export const schemaShape = (
  name: string,
  schema: z.ZodType,
  names: Readonly<Record<string, string>> = {},
): string => {
  const { description: _description, ...root } = z.toJSONSchema(schema, { io: "input" }) as Json;
  const pending: Pending[] = [{ name, schema: root }];
  const written = new Set<string>();
  const lines: string[] = [];
  for (let next = pending.shift(); next; next = pending.shift()) {
    if (written.has(next.name)) continue;
    written.add(next.name);
    lines.push(...block(next, pending, names));
  }
  return lines.join("\n");
};
