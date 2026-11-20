import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';

export interface Bar {
  label: string;
  /** Any unit; bars are scaled against the largest value. */
  value: number;
  /** Highlights the current period. */
  current?: boolean;
}

export interface BarChartProps {
  data: readonly Bar[];
  height?: number;
  /** Screen-reader summary, since the bars alone convey nothing to one. */
  summary?: string;
}

/**
 * Plain bars, drawn with views. No chart library: the mockup's chart is a row
 * of rounded rectangles, and a dependency here would buy nothing while adding
 * the Skia-on-web compatibility question.
 */
export function BarChart({ data, height = 190, summary }: BarChartProps) {
  const colors = useColors();
  const max = Math.max(...data.map((d) => d.value), 0);

  return (
    <View accessible accessibilityLabel={summary}>
      <View style={[styles.chart, { height, borderBottomColor: colors.borderPrimary }]}>
        {data.map((bar, i) => {
          // Guard against an all-zero series, where every bar would be NaN.
          const ratio = max > 0 ? bar.value / max : 0;
          return (
            <View key={`${bar.label}-${i}`} style={styles.slot}>
              <View
                style={[
                  styles.bar,
                  {
                    height: `${Math.max(ratio * 100, 4)}%`,
                    backgroundColor: bar.current ? colors.brandPrimary : colors.brandSecondary,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.labels}>
        {data.map((bar, i) => (
          <Text key={`${bar.label}-${i}`} variant="caption" color="textMuted" style={styles.label}>
            {bar.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space[3],
    paddingTop: space[3],
    paddingHorizontal: space[1],
    borderBottomWidth: 1,
  },
  slot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '70%', maxWidth: 30, borderTopLeftRadius: 7, borderTopRightRadius: 7, minHeight: 8 },
  labels: { flexDirection: 'row', marginTop: space[2] },
  label: { flex: 1, textAlign: 'center', fontSize: 10 },
});
