import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useColors } from '@/design/theme';
import { radius, space } from '@/design/tokens';

export type PillTone = 'neutral' | 'brand';

/** Small status chip. The mockup's `.pill` / `.pill.green`. */
export function Pill({ label, tone = 'neutral' }: { label: string; tone?: PillTone }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: tone === 'brand' ? colors.brandSubtle : colors.surfaceSecondary },
      ]}>
      <Text variant="caption" color={tone === 'brand' ? 'brandPrimary' : 'textSecondary'} style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

/** Inline label used on exercise rows. The mockup's `.tag`. */
export function Tag({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={[styles.tag, { backgroundColor: colors.brandSubtle }]}>
      <Text variant="caption" color="brandPrimary" style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
  tag: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
  label: { fontSize: 10, letterSpacing: 0.2 },
});
