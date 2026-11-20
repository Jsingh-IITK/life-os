import { StyleSheet, View, type ViewProps } from 'react-native';

import { useLayout } from '@/design/theme';
import { space } from '@/design/tokens';

export interface GridProps extends ViewProps {
  /** Columns at desktop width. Steps down automatically below it. */
  columns: 2 | 3 | 4;
}

/**
 * React Native has no CSS Grid, so the mockup's grid-4 / grid-3 / grid-2 are
 * reproduced with flex wrapping and an explicit basis.
 *
 * Breakpoints mirror the mockup's media queries: four columns become two under
 * 1100px, and two- and three-column grids collapse to one under 760px while
 * four-column stays two-up — which is what keeps the metric row readable on a
 * phone instead of becoming a tall stack.
 */
export function Grid({ columns, style, children, ...rest }: GridProps) {
  const { width } = useLayout();

  let effective: 1 | 2 | 3 | 4 = columns;
  if (width < 1100 && columns === 4) effective = 2;
  if (width < 760) effective = columns === 4 ? 2 : 1;

  const basis = `${100 / effective}%`;

  return (
    <View style={[styles.grid, style]} {...rest}>
      {/* The negative-margin trick keeps gutters even without gap support
          differences between platforms biting. */}
      {Array.isArray(children)
        ? children.map((child, i) => (
            <View key={i} style={[styles.cell, { flexBasis: basis, maxWidth: basis }]}>
              {child}
            </View>
          ))
        : children}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space[2] },
  cell: { paddingHorizontal: space[2], paddingBottom: space[4], minWidth: 0 },
});
