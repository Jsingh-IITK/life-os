import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';

/**
 * Covers the app while the stored session is being read.
 *
 * Rendered as an overlay rather than instead of the navigator: Expo Router's
 * root layout must always return a navigator, and returning a bare view stops
 * routes mounting and collapses the layout.
 */
export function Splash() {
  const colors = useColors();
  return (
    <View style={[styles.overlay, { backgroundColor: colors.backgroundPrimary }]}>
      <Text variant="sectionHeading">Life OS</Text>
      <ActivityIndicator size="small" color={colors.brandPrimary} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    // RN 0.88 removed StyleSheet.absoluteFillObject; spelled out instead.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  spinner: { marginTop: space[4] },
});
