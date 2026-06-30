import type { AllauthFieldError } from '@realty/data';

import { mapAuthFieldErrors, resolveAuthErrorMessage } from '@/lib/auth-errors';

/** Minimal `t` stand-in: returns localized copy for the keys we map, else the key. */
const t = (key: string): string =>
  (({
    'auth.errorInvalidCredentials': 'Invalid email or password.',
    'auth.errorCodeInvalid': 'That code is invalid or expired.',
    'auth.errorEmailTaken': 'That email is already registered.',
    'auth.errorGeneric': 'Something went wrong. Please try again.',
  }) as Record<string, string>)[key] ?? key;

describe('resolveAuthErrorMessage', () => {
  it('localizes a known login mismatch code', () => {
    const err: AllauthFieldError = {
      message: 'The email address and/or password you specified are not correct.',
      code: 'email_password_mismatch',
      param: 'password',
    };
    expect(resolveAuthErrorMessage(err, t)).toBe('Invalid email or password.');
  });

  it('localizes the incorrect_code case', () => {
    expect(
      resolveAuthErrorMessage({ message: 'Incorrect code.', code: 'incorrect_code', param: 'code' }, t),
    ).toBe('That code is invalid or expired.');
  });

  it('localizes a bare "invalid" code when it targets the verification key', () => {
    expect(
      resolveAuthErrorMessage({ message: 'Invalid or expired key.', code: 'invalid', param: 'key' }, t),
    ).toBe('That code is invalid or expired.');
  });

  it('localizes the email_taken code to the localized copy, not the backend message', () => {
    expect(
      resolveAuthErrorMessage(
        { message: 'A user is already registered with this email address.', code: 'email_taken', param: 'email' },
        t,
      ),
    ).toBe('That email is already registered.');
  });

  it('falls back to the raw backend message for an unmapped password-validator code', () => {
    expect(
      resolveAuthErrorMessage(
        { message: 'The password is too similar to the first name.', code: 'password_too_similar', param: 'password' },
        t,
      ),
    ).toBe('The password is too similar to the first name.');
  });

  it('falls back to the generic message when there is neither a known code nor a message', () => {
    expect(resolveAuthErrorMessage({ message: '', code: 'mystery_code' }, t)).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('mapAuthFieldErrors', () => {
  it('buckets entries under their param when the form owns that field', () => {
    const errors: AllauthFieldError[] = [
      { message: 'The password is too common.', code: 'password_too_common', param: 'password' },
    ];
    const result = mapAuthFieldErrors(errors, ['email', 'password'], t);
    expect(result.fieldErrors).toEqual({ password: 'The password is too common.' });
    expect(result.formError).toBeUndefined();
  });

  it('sends a param-less entry to the form-level banner', () => {
    const errors: AllauthFieldError[] = [{ message: 'Too many requests. Try again later.', code: 'rate_limited' }];
    const result = mapAuthFieldErrors(errors, ['email', 'password'], t);
    expect(result.fieldErrors).toEqual({});
    expect(result.formError).toBe('Too many requests. Try again later.');
  });

  it('sends an entry whose param the form does not own to the form-level banner', () => {
    const errors: AllauthFieldError[] = [
      { message: 'Invalid or expired key.', code: 'invalid', param: 'key' },
    ];
    // A form that only owns email/password should not silently drop the key error.
    const result = mapAuthFieldErrors(errors, ['email', 'password'], t);
    expect(result.fieldErrors).toEqual({});
    expect(result.formError).toBe('That code is invalid or expired.');
  });

  it('keeps the first error per field and joins multiple form-level messages', () => {
    const errors: AllauthFieldError[] = [
      { message: 'The password is too short.', code: 'password_too_short', param: 'password' },
      { message: 'The password is too common.', code: 'password_too_common', param: 'password' },
      { message: 'Form problem A.' },
      { message: 'Form problem B.' },
    ];
    const result = mapAuthFieldErrors(errors, ['password'], t);
    expect(result.fieldErrors).toEqual({ password: 'The password is too short.' });
    expect(result.formError).toBe('Form problem A.\nForm problem B.');
  });

  it('returns empty results for no errors', () => {
    expect(mapAuthFieldErrors(undefined, ['password'], t)).toEqual({ fieldErrors: {} });
    expect(mapAuthFieldErrors([], ['password'], t)).toEqual({ fieldErrors: {} });
  });
});
