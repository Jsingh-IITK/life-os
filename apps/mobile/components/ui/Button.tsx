import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useColors } from '@/design/theme';
import { MIN_TOUCH_TARGET, radius, space } from '@/design/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Accessible name when the label alone is not descriptive enough. */
  accessibilityLabel?: string;
  style?: ViewStyle;
}

const HEIGHT: Record<ButtonSize, number> = { small: 32, medium: 40, large: 48 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const colors = useColors();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const inactive = disabled || loading;

  const surface: Record<ButtonVariant, { bg: string; border: string; fg: Parameters<typeof Text>[0]['color'] }> = {
    primary: { bg: colors.brandPrimary, border: colors.brandPrimary, fg: 'onBrand' },
    secondary: { bg: 'transparent', border: colors.borderPrimary, fg: 'textPrimary' },
    ghost: { bg: 'transparent', border: 'transparent', fg: 'textPrimary' },
    destructive: { bg: 'transparent', border: colors.danger, fg: 'danger' },
  };
  const tone = surface[variant];

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          height: HEIGHT[size],
          // Small buttons would otherwise fall under the 44px touch target, so
          // padding compensates without changing the visual height.
          minHeight: size === 'small' ? undefined : MIN_TOUCH_TARGET,
          paddingHorizontal: size === 'small' ? space[3] : space[4],
          backgroundColor:
            variant === 'ghost' && (hovered || pressed) ? colors.brandSubtle : tone.bg,
          borderColor: focused ? colors.brandPrimary : tone.border,
          borderWidth: variant === 'primary' ? 0 : 1,
          opacity: inactive ? 0.45 : pressed ? 0.85 : hovered ? 0.92 : 1,
          width: fullWidth ? '100%' : undefined,
        },
        // Visible focus indicator, required for keyboard navigation.
        focused ? { borderWidth: 2 } : null,
        style,
      ]}>
      {loading ? (
        <View style={styles.row}>
          <ActivityIndicator
            size="small"
            color={variant === 'primary' ? colors.onBrand : colors.textPrimary}
          />
          <Text variant="body" color={tone.fg} style={styles.loadingLabel}>
            {label}
          </Text>
        </View>
      ) : (
        <Text variant={size === 'small' ? 'secondary' : 'body'} color={tone.fg}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  loadingLabel: { opacity: 0.9 },
});
