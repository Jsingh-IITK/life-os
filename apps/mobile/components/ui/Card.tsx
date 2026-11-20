import { Platform, StyleSheet, View, type ViewProps } from 'react-native';

import { useColors, useTheme } from '@/design/theme';
import { elevation, radius, space } from '@/design/tokens';

export type CardVariant = 'standard' | 'metric' | 'insight' | 'empty';

export interface CardProps extends ViewProps {
  variant?: CardVariant;
  padded?: boolean;
}

export function Card({ variant = 'standard', padded = true, style, ...rest }: CardProps) {
  const colors = useColors();
  const { scheme } = useTheme();

  const background =
    variant === 'insight'
      ? colors.brandSubtle
      : variant === 'empty'
        ? colors.surfaceSecondary
        : colors.surfacePrimary;

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: background,
          borderColor: colors.borderPrimary,
          padding: padded ? space[5] : 0,
        },
        // Borders are the primary separation mechanism; the light theme adds a
        // restrained shadow, dark relies on surface contrast alone.
        scheme === 'light' && Platform.OS !== 'android' ? elevation.card : null,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    borderWidth: 1,
  },
});
