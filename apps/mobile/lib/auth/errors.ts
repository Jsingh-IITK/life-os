import { AuthError } from '@supabase/supabase-js';

/**
 * Turn an auth failure into something worth reading.
 *
 * Supabase's messages are serviceable but terse, and a few are actively
 * confusing to a user ("Invalid login credentials" for an unconfirmed email).
 * Anything unrecognised is passed through rather than replaced by a generic
 * line, so a real problem stays diagnosable.
 */
export function describeAuthError(error: unknown): string {
  if (!(error instanceof AuthError)) {
    if (error instanceof Error) return error.message;
    return 'Something went wrong. Please try again.';
  }

  switch (error.code) {
    case 'invalid_credentials':
      return 'That email and password do not match an account.';
    case 'email_not_confirmed':
      return 'Check your inbox and confirm your email address first.';
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with that email already exists. Try signing in.';
    case 'weak_password':
      return 'That password is too weak. Use at least 8 characters.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a minute and try again.';
    case 'validation_failed':
      return 'Check the email address is spelled correctly.';
    default:
      return error.message;
  }
}
