import { formatErrors, type ValidationError } from "../schema/errors.ts";

/** Problems, one per line, each naming its place. */
export const Errors = ({ errors, id }: { errors: readonly ValidationError[]; id?: string }) =>
  errors.length === 0 ? null : (
    <ul className="errors" id={id} role="alert">
      {formatErrors(errors).map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
