import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';

import { Text, View, useThemeColor } from '@/components/Themed';

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

/**
 * Shared layout for the auth screens.
 *
 * Deliberately plain: the design system is proposed later, and styling these
 * now would mean redoing them. What is not deferred is the behaviour that is
 * easy to get wrong — autofill hints, keyboard types, disabled state while
 * in flight, and errors surfaced rather than swallowed.
 */
export function AuthForm({
  title,
  subtitle,
  submitLabel,
  withPassword = true,
  onSubmit,
  footer,
}: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const borderColor = useThemeColor({}, 'tabIconDefault');
  const textColor = useThemeColor({}, 'text');

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
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <TextInput
          style={[styles.input, { borderColor, color: textColor }]}
          placeholder="you@example.com"
          placeholderTextColor={borderColor}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!busy}
          onSubmitEditing={withPassword ? undefined : handleSubmit}
          returnKeyType={withPassword ? 'next' : 'go'}
        />

        {withPassword ? (
          <TextInput
            style={[styles.input, { borderColor, color: textColor }]}
            placeholder="Password"
            placeholderTextColor={borderColor}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            editable={!busy}
            onSubmitEditing={handleSubmit}
            returnKeyType="go"
          />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.button,
            { opacity: !canSubmit ? 0.4 : pressed ? 0.8 : 1 },
          ]}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonLabel}>{submitLabel}</Text>
          )}
        </Pressable>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontSize: 26, fontWeight: '600' },
  subtitle: { fontSize: 14, opacity: 0.6, marginTop: 6, marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#2f95dc',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#d7263d', fontSize: 13, marginBottom: 8 },
  notice: { color: '#1b7f4b', fontSize: 13, marginBottom: 8 },
  footer: { marginTop: 20, alignItems: 'center', gap: 10, backgroundColor: 'transparent' },
});
