import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useColors } from '@/design/theme';
import { fontFamily, space } from '@/design/tokens';

export interface ProgressBarProps {
  /** 0–1. Clamped, so an over-budget category fills the track rather than overflowing it. */
  value: number;
  label?: string;
  /** Right-hand figure, preformatted. */
  detail?: string;
  /** Over-budget reads as a warning rather than silently looking complete. */
  tone?: 'brand' | 'warning' | 'danger';
}

export function ProgressBar({ value, label, detail, tone = 'brand' }: ProgressBarProps) {
  const colors = useColors();
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

  const fill =
    tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.brandPrimary;

  return (
    <View style={styles.wrap}>
      {label || detail ? (
        <View style={styles.meta}>
          {label ? (
            <Text variant="caption" color="textSecondary" style={styles.metaText}>
              {label}
            </Text>
          ) : null}
          {detail ? (
            <Text variant="caption" tabular style={styles.detail}>
              {detail}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View
        style={[styles.track, { backgroundColor: colors.surfaceSecondary }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
        accessibilityLabel={label}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: fill }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3] },
  metaText: { fontSize: 12 },
  detail: { fontSize: 12, fontFamily: fontFamily.semibold },
  track: { height: 7, borderRadius: 20, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 20 },
});
