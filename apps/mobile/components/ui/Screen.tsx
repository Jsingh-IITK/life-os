import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useColors, useLayout } from '@/design/theme';
import { CONTENT_MAX_WIDTH, space } from '@/design/tokens';

export interface ScreenProps extends ViewProps {
  title?: string;
  subtitle?: string;
  scroll?: boolean;
}

/**
 * Page frame: themed canvas, responsive padding, and a constrained content
 * column so text does not stretch across a wide desktop window.
 */
export function Screen({ title, subtitle, scroll = true, children, style, ...rest }: ScreenProps) {
  const colors = useColors();
  const { isMobile, isWide } = useLayout();
  const insets = useSafeAreaInsets();

  const padding = isMobile ? space[4] : isWide ? space[8] : space[6];

  const body = (
    <View style={[styles.column, { maxWidth: CONTENT_MAX_WIDTH, padding }, style]} {...rest}>
      {title ? (
        <View style={styles.header}>
          <Text variant={isMobile ? 'pageHeading' : 'display'}>{title}</Text>
          {subtitle ? (
            <Text variant="secondary" color="textSecondary" style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );

  if (!scroll) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundPrimary }]}>{body}</View>
    );
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.backgroundPrimary }]}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + space[8] }]}>
      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { alignItems: 'center' },
  column: { width: '100%', gap: space[5] },
  header: { gap: space[1] },
  subtitle: { maxWidth: 560 },
});
