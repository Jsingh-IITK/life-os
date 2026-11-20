import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, Input, Text } from '@/components/ui';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';

export interface AuthFormProps {
  title: string;
  subtitle: string;
  submitLabel: string;
  /** Omit to hide the password field — used by the reset-request screen. */
  withPassword?: boolean;
  /** Return a string to show it as a success notice. */
  onSubmit: (values: { email: string; password: string }) => Promise<string | void>;
  footer?: React.ReactNode;
}

export function AuthForm({
  title,
  subtitle,
  submitLabel,
  withPassword = true,
  onSubmit,
  footer,
}: AuthFormProps) {
  const colors = useColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && (!withPassword || password.length > 0) && !busy;

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await onSubmit({ email: email.trim(), password });
      if (typeof result === 'string') setNotice(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.backgroundPrimary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <View style={styles.brand}>
            <Text variant="caption" color="textMuted">
              LIFE OS
            </Text>
            <Text variant="pageHeading">{title}</Text>
            <Text variant="secondary" color="textSecondary">
              {subtitle}
            </Text>
          </View>

          <Card style={styles.card}>
            <Input
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!busy}
              returnKeyType={withPassword ? 'next' : 'go'}
              onSubmitEditing={withPassword ? undefined : handleSubmit}
            />

            {withPassword ? (
              <Input
                label="Password"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
              />
            ) : null}

            {/* Status is carried by the text itself as well as its colour,
                so it does not depend on colour perception alone. */}
            {error ? (
              <Text variant="secondary" color="danger">
                {error}
              </Text>
            ) : null}
            {notice ? (
              <Text variant="secondary" color="success">
                {notice}
              </Text>
            ) : null}

            <Button
              label={submitLabel}
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={busy}
              size="large"
              fullWidth
            />
          </Card>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: space[4] },
  column: { width: '100%', maxWidth: 420, gap: space[5] },
  brand: { gap: space[1] },
  card: { gap: space[4] },
  footer: { alignItems: 'center', gap: space[3] },
});
