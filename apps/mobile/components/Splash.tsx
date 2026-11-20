import { ActivityIndicator, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

/**
 * Shown while the stored session is being read.
 *
 * This renders during server-side rendering too: on the server there is no
 * stored session to read, so session state is always "unknown" for the first
 * paint of every route. Rendering nothing there left a blank page; rendering
 * the app would show protected content to a signed-out visitor; rendering the
 * auth screens would flash sign-in at an already-signed-in user. A neutral
 * loading state is the only option that is never wrong.
 */
export function Splash() {
  return (
    <View style={styles.container}>
      <Text style={styles.wordmark}>Life OS</Text>
      <ActivityIndicator style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontSize: 20, fontWeight: '600', opacity: 0.85 },
  spinner: { marginTop: 16 },
});
