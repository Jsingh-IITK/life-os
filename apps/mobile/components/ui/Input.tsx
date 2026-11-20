import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useColors } from '@/design/theme';
import { MIN_TOUCH_TARGET, radius, space, tabularNumbers, typography } from '@/design/tokens';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  /** Required: every input needs a visible label, not just a placeholder. */
  label: string;
  error?: string | null;
  hint?: string;
  /** Tabular figures for currency and numeric entry. */
  numeric?: boolean;
}

export function Input({ label, error, hint, numeric = false, ...rest }: InputProps) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? colors.danger
    : focused
      ? colors.brandPrimary
      : colors.borderPrimary;

  return (
    <View style={styles.wrapper}>
      <Text variant="secondary" color="textSecondary" style={styles.label}>
        {label}
      </Text>

      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[
          typography.body,
          numeric ? tabularNumbers : null,
          styles.input,
          {
            color: colors.textPrimary,
            backgroundColor: colors.surfacePrimary,
            borderColor,
            // Thicker ring on focus so the indicator is visible, not just a
            // hue change — which colour-blind users may not perceive.
            borderWidth: focused || error ? 2 : 1,
          },
        ]}
        {...rest}
      />

      {error ? (
        <Text variant="caption" color="danger" style={styles.message}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textMuted" style={styles.message}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: space[1] },
  label: { marginBottom: space[1] },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    minHeight: MIN_TOUCH_TARGET,
  },
  message: { marginTop: space[1] },
});
