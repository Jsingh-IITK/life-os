import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { FocusRing } from '@/components/ui/FocusRing';
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

      <View>
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
              // Constant width: see FocusRing for why focus must not reflow.
              borderWidth: error ? 2 : 1,
            },
          ]}
          {...rest}
        />
        {/* Visible focus indicator that does not depend on colour alone and
            does not change the element's box. */}
        <FocusRing visible={focused} radius={radius.md} />
      </View>

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
