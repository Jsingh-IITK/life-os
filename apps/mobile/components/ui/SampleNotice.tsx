import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useColors } from '@/design/theme';
import { radius, space } from '@/design/tokens';

/**
 * A conspicuous caveat above figures that are not yet the user's own —
 * because the data is empty, provisional, or otherwise not what it appears.
 *
 * Originally marked placeholder data, which no longer exists anywhere in the
 * app. It is kept for the weaker case: real figures that are all zero and
 * would otherwise look like a broken screen rather than an empty one.
 */
export function SampleNotice({ text }: { text: string }) {
  const colors = useColors();
  return (
    <View
      style={[styles.banner, { backgroundColor: colors.surfaceSecondary, borderColor: colors.borderPrimary }]}
      accessibilityRole="alert">
      <Text variant="caption" color="textSecondary">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
});
