import { StyleSheet, View } from 'react-native';

import { Pill } from '@/components/ui/Pill';
import { Text } from '@/components/ui/Text';
import { useColors, useLayout } from '@/design/theme';
import { space } from '@/design/tokens';

export interface HeroCardProps {
  eyebrow: string;
  title: string;
  body: string;
  statLabel?: string;
  statValue?: string;
  statCaption?: string;
}

/** The mockup's `.hero-card`: brand-tinted panel with a right-aligned stat. */
export function HeroCard({ eyebrow, title, body, statLabel, statValue, statCaption }: HeroCardProps) {
  const colors = useColors();
  const { isMobile } = useLayout();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.brandSubtle, borderColor: colors.borderPrimary },
        isMobile ? styles.cardMobile : null,
      ]}>
      <View style={styles.main}>
        <Pill label={eyebrow} tone="brand" />
        <Text variant="sectionHeading" style={styles.title}>
          {title}
        </Text>
        <Text variant="caption" color="textSecondary" style={styles.body}>
          {body}
        </Text>
      </View>

      {statValue ? (
        <View style={[styles.stat, isMobile ? styles.statMobile : null]}>
          {statLabel ? (
            <Text variant="caption" color="textSecondary">
              {statLabel}
            </Text>
          ) : null}
          <Text variant="pageHeading" tabular style={styles.statValue}>
            {statValue}
          </Text>
          {statCaption ? (
            <Text variant="caption" color="textSecondary">
              {statCaption}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: space[5],
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space[5],
  },
  cardMobile: { flexDirection: 'column', alignItems: 'flex-start' },
  main: { gap: space[2], flexShrink: 1, minWidth: 0 },
  title: { fontSize: 20 },
  body: { maxWidth: 540, fontSize: 12 },
  stat: { alignItems: 'flex-end', minWidth: 130, gap: 2 },
  statMobile: { alignItems: 'flex-start' },
  statValue: { letterSpacing: -1 },
});
