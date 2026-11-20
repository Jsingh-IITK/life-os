import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

/**
 * Phase 0 placeholder. Each module screen states what it will hold and which
 * phase delivers it, so the shell is honest about being a shell rather than
 * implying functionality that does not exist yet.
 */
export function ModuleScreen({
  title,
  phase,
  children,
}: {
  title: string;
  phase: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.phase}>{phase}</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      {children}
    </View>
  );
}

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
  },
  phase: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 6,
    textAlign: 'center',
  },
  separator: {
    marginVertical: 24,
    height: 1,
    width: '70%',
  },
  row: {
    fontSize: 15,
    marginBottom: 6,
    fontVariant: ['tabular-nums'],
  },
  caption: {
    fontSize: 12,
    opacity: 0.55,
    marginTop: 14,
    textAlign: 'center',
    maxWidth: 320,
  },
});
