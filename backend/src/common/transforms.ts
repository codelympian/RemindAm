import { type TransformFnParams } from 'class-transformer';

/**
 * Trims incoming strings so whitespace-only values are rejected by IsNotEmpty;
 * passes non-string values (e.g. `null`, numbers) through unchanged.
 */
export const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Trims strings and turns blank ones into `undefined`, so an optional field sent
 * as `""` is treated as "not provided" (IsOptional skips it) rather than stored
 * as an empty string. Non-strings — including an explicit `null` used to clear a
 * field on update — pass through unchanged.
 */
export const emptyToUndefined = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Coerces the `"true"` / `"false"` strings a query string carries into real
 * booleans so `@IsBoolean()` can validate them. Anything else — including a
 * genuine boolean from a JSON body, or a bad value that should fail validation —
 * passes through unchanged.
 */
export const toBoolean = ({ value }: TransformFnParams): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};
