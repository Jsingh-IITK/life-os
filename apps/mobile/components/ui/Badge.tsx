import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useColors } from '@/design/theme';
import { radius, space } from '@/design/tokens';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const colors = useColors();

  const background = tone === 'brand' || tone === 'neutral' ? colors.brandSubtle : 'transparent';
  const border =
    tone === 'neutral'
      ? colors.borderPrimary
      : tone === 'brand'
        ? colors.brandSecondary
        : colors[tone];

  return (
    <View style={[styles.badge, { backgroundColor: background, borderColor: border }]}>
      {/* Tone is carried by the text colour and the label itself, never by
          colour alone — a requirement of the design system's status rules. */}
      <Text variant="caption" color={tone === 'neutral' || tone === 'brand' ? 'textSecondary' : tone}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
});
