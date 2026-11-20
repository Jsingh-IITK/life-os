import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/components/ui/Text';
import { useColors } from '@/design/theme';

export interface RingProps {
  /** 0–1. Clamped: an over-budget figure fills the ring rather than wrapping past the start. */
  value: number;
  size?: number;
  thickness?: number;
  /** Centre label. Preformatted. */
  caption?: string;
  accessibilityLabel?: string;
}

/**
 * Donut progress. Drawn with react-native-svg rather than a chart library:
 * it is two circles and a dash offset, and it avoids the Skia-on-web
 * compatibility question a charting dependency would introduce.
 */
export function Ring({ value, size = 102, thickness = 13, caption, accessibilityLabel }: RingProps) {
  const colors = useColors();
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.surfaceSecondary}
          strokeWidth={thickness}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.brandPrimary}
          strokeWidth={thickness}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * pct} ${circumference}`}
          // Start at twelve o'clock rather than three.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      {caption ? (
        <View style={styles.centre} pointerEvents="none">
          <Text variant="sectionHeading" tabular>
            {caption}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  centre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
