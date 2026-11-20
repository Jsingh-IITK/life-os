import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useColors } from '@/design/theme';
import { tabularNumbers, typography, type ColorToken, type TypographyVariant } from '@/design/tokens';

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: ColorToken;
  /**
   * Tabular figures. Required for money and metrics so digits occupy equal
   * width and columns stay aligned as values change.
   */
  tabular?: boolean;
  align?: 'auto' | 'left' | 'right' | 'center';
}

export function Text({
  variant = 'body',
  color = 'textPrimary',
  tabular = false,
  align,
  style,
  ...rest
}: TextProps) {
  const colors = useColors();
  return (
    <RNText
      style={[
        typography[variant],
        { color: colors[color] },
        tabular ? tabularNumbers : null,
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    />
  );
}
