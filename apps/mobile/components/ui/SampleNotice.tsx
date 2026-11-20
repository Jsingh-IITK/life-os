import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useColors } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { SAMPLE_NOTICE } from '@/lib/placeholder';

/**
 * Marks a screen whose figures come from the placeholder module.
 *
 * Deliberately conspicuous. The point is that no number on the screen can be
 * mistaken for the user's own, which is the condition under which showing
 * sample figures at all is acceptable.
 */
export function SampleNotice({ text = SAMPLE_NOTICE }: { text?: string }) {
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
