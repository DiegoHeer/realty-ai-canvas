import type { AllauthFieldError } from '@realty/data';

/**
 * Per-field + form-level messages derived from an allauth `errors[]` array.
 * `fieldErrors` is keyed by allauth `param` (e.g. `"password"`, `"email"`,
 * `"key"`); `formError` collects anything that has no param (or a param the
 * calling form doesn't own).
 */
export interface MappedAuthErrors {
  fieldErrors: Record<string, string>;
  formError?: string;
}

/**
 * Stable allauth codes we ship localized copy for. Anything not listed — notably
 * the password validators (`password_too_short`, `password_too_common`,
 * `password_entirely_numeric`, `password_too_similar`) — falls back to the
 * backend's own human-readable `message`, so the user always sees a specific,
 * actionable reason instead of a generic banner (hybrid resolution).
 */
const CODE_I18N_KEY: Record<string, string> = {
  email_password_mismatch: 'auth.errorInvalidCredentials',
  incorrect_code: 'auth.errorCodeInvalid',
  token_invalid: 'auth.errorCodeInvalid',
};

/** Params that name a verification/reset code field, where a bare `invalid` code means "bad code". */
const CODE_FIELD_PARAMS = new Set(['key', 'code']);

/**
 * Resolve one allauth error to display text: localized copy when we recognize
 * the code, otherwise the backend's raw `message`. The bare `invalid` code is
 * overloaded (email format vs. verification key), so it is only localized to the
 * code-invalid copy when it targets a code/key field; elsewhere we trust the
 * backend text. A final fallback covers entries with neither a known code nor a
 * message.
 */
export function resolveAuthErrorMessage(
  err: AllauthFieldError,
  t: (key: string) => string,
): string {
  const key = err.code ? CODE_I18N_KEY[err.code] : undefined;
  if (key) return t(key);
  if (err.code === 'invalid' && err.param !== undefined && CODE_FIELD_PARAMS.has(err.param)) {
    return t('auth.errorCodeInvalid');
  }
  if (err.message) return err.message;
  return t('auth.errorGeneric');
}

/**
 * Bucket a parsed allauth `errors[]` array into per-field messages plus an
 * optional form-level banner. `fieldParams` lists the params that map to real
 * inputs on the calling form; entries with no param — or a param the form does
 * not own — are routed to the form-level banner so nothing is silently dropped.
 * The first error wins per field; multiple form-level messages are newline-joined.
 */
export function mapAuthFieldErrors(
  errors: AllauthFieldError[] | undefined,
  fieldParams: readonly string[],
  t: (key: string) => string,
): MappedAuthErrors {
  const fieldErrors: Record<string, string> = {};
  const formMessages: string[] = [];

  for (const err of errors ?? []) {
    const message = resolveAuthErrorMessage(err, t);
    if (err.param !== undefined && fieldParams.includes(err.param)) {
      if (!(err.param in fieldErrors)) fieldErrors[err.param] = message;
    } else {
      formMessages.push(message);
    }
  }

  return {
    fieldErrors,
    formError: formMessages.length > 0 ? formMessages.join('\n') : undefined,
  };
}
