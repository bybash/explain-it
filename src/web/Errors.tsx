import { formatErrors, type ValidationError } from "../schema/errors.ts";

/** Problems, one per line, each naming its place. */
export const Errors = ({
  errors,
  id,
  className = "",
}: {
  errors: readonly ValidationError[];
  id?: string;
  className?: string;
}) =>
  errors.length === 0 ? null : (
    <ul className={`mt-2 text-error ${className}`} id={id} role="alert">
      {formatErrors(errors).map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
