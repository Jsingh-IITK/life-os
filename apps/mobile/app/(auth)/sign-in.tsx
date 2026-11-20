import { Link } from 'expo-router';

import { AuthForm } from '@/components/AuthForm';
import { Text } from '@/components/ui';
import { describeAuthError } from '@/lib/auth/errors';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  return (
    <AuthForm
      title="Welcome back"
      subtitle="Your money and your training, in one place."
      submitLabel="Sign in"
      onSubmit={async ({ email, password }) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        // The session arrives via onAuthStateChange, which the root layout
        // watches — so there is no navigation call here. Redirecting manually
        // would race the provider.
        if (error) throw new Error(describeAuthError(error));
      }}
      footer={
        <>
          <Link href="/sign-up">
            <Text variant="body" color="brandPrimary">Create an account</Text>
          </Link>
          <Link href="/forgot-password">
            <Text variant="secondary" color="textMuted">Forgot your password?</Text>
          </Link>
        </>
      }
    />
  );
}
