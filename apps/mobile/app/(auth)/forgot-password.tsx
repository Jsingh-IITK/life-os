import { Link } from 'expo-router';

import { AuthForm } from '@/components/AuthForm';
import { Text } from '@/components/Themed';
import { describeAuthError } from '@/lib/auth/errors';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordScreen() {
  return (
    <AuthForm
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      submitLabel="Send reset link"
      withPassword={false}
      onSubmit={async ({ email }) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw new Error(describeAuthError(error));
        // Worded so it does not disclose whether the address has an account.
        return 'If that address has an account, a reset link is on its way.';
      }}
      footer={
        <Link href="/sign-in">
          <Text style={{ color: '#2f95dc' }}>Back to sign in</Text>
        </Link>
      }
    />
  );
}
