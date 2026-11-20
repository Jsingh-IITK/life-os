import { ActivityIndicator, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

/**
 * Covers the app while the stored session is being read.
 *
 * Rendered as an overlay rather than instead of the navigator. Expo Router's
 * root layout must always return a navigator — returning a bare view from it
 * stops routes mounting and collapses the layout container, which looks like a
 * redirect loop and a broken page rather than an obvious error.
 */
export function Splash() {
  return (
    <View style={styles.overlay}>
      <Text style={styles.wordmark}>Life OS</Text>
      <ActivityIndicator size="small" style={styles.spinner} />
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
  wordmark: { fontSize: 20, fontWeight: '600', opacity: 0.85 },
  spinner: { marginTop: 16 },
});
