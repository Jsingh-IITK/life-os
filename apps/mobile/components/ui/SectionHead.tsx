import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { space } from '@/design/tokens';

/** Card header: title, optional subtitle, optional trailing control. */
export function SectionHead({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.head}>
      <View style={styles.text}>
        <Text variant="cardHeading" style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
    marginBottom: space[3],
  },
  text: { gap: 2, minWidth: 0, flexShrink: 1 },
  title: { fontSize: 17, letterSpacing: -0.35 },
});
