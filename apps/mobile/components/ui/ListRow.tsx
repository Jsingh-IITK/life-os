import { StyleSheet, View, type ViewProps } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useColors } from '@/design/theme';
import { fontFamily, radius, space } from '@/design/tokens';

export interface ListRowProps extends ViewProps {
  icon?: string;
  title: string;
  meta?: string;
  /** Preformatted amount. Formatting belongs to finance-core, not here. */
  amount?: string;
  amountTone?: 'textPrimary' | 'success' | 'danger';
  /** Anything on the right instead of an amount — a Pill, a Tag. */
  trailing?: React.ReactNode;
  last?: boolean;
}

/**
 * The mockup's `.list-row`: round icon, title, meta line, trailing value.
 * Used for transactions, schedule entries and summary rows alike.
 */
export function ListRow({
  icon,
  title,
  meta,
  amount,
  amountTone = 'textPrimary',
  trailing,
  last = false,
  style,
  ...rest
}: ListRowProps) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: colors.borderPrimary, borderBottomWidth: last ? 0 : 1 },
        style,
      ]}
      {...rest}>
      <View style={styles.left}>
        {icon ? (
          <View style={[styles.icon, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={styles.iconGlyph}>{icon}</Text>
          </View>
        ) : null}
        <View style={styles.text}>
          <Text variant="secondary" style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {meta ? (
            <Text variant="caption" color="textSecondary" numberOfLines={1} style={styles.meta}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>

      {trailing ?? (amount ? (
        <Text variant="secondary" color={amountTone} tabular style={styles.amount}>
          {amount}
        </Text>
      ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
    paddingVertical: space[3],
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: space[3], minWidth: 0, flexShrink: 1 },
  icon: { width: 36, height: 36, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  iconGlyph: { fontSize: 16 },
  text: { minWidth: 0, flexShrink: 1 },
  title: { fontFamily: fontFamily.semibold, fontSize: 12 },
  meta: { fontSize: 10, marginTop: 2 },
  amount: { fontFamily: fontFamily.bold, fontSize: 12 },
});
