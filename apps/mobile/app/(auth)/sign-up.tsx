import { Link } from 'expo-router';

import { AuthForm } from '@/components/AuthForm';
import { Text } from '@/components/ui';
import { describeAuthError } from '@/lib/auth/errors';
import { supabase } from '@/lib/supabase';

export default function SignUpScreen() {
  return (
    <AuthForm
      title="Create your account"
      subtitle="One account. Finance and Fitness, kept separate but together."
      submitLabel="Create account"
      onSubmit={async ({ email, password }) => {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw new Error(describeAuthError(error));

        // With email confirmation enabled, signUp returns a user but no
        // session. Saying "you're in" here would be a lie, and the root layout
        // would keep showing this screen — so report the real state instead.
        if (data.session === null) {
          return 'Account created. Check your email to confirm it, then sign in.';
        }
      }}
      footer={
        <Link href="/sign-in">
          <Text variant="body" color="brandPrimary">I already have an account</Text>
        </Link>
      }
    />
  );
}
