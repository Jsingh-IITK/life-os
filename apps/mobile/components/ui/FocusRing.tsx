import { StyleSheet, View } from 'react-native';

import { useColors } from '@/design/theme';

/**
 * A focus indicator that sits on top of its parent rather than inside its box.
 *
 * Changing borderWidth to show focus seems harmless but reflows the element,
 * which shifts everything below it. Blur fires when you click a button below a
 * focused input, so the button moves out from under the pointer between press
 * and release — the click silently misses. Overlaying the ring keeps layout
 * identical in both states.
 *
 * The parent must be position: relative (the default for React Native views).
 */
export function FocusRing({ visible, radius }: { visible: boolean; radius: number }) {
  const colors = useColors();
  if (!visible) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.ring, { borderColor: colors.brandPrimary, borderRadius: radius }]}
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderWidth: 2,
  },
});
