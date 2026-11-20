import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_ROUTES } from '@/components/nav/routes';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/design/theme';
import { MIN_TOUCH_TARGET, radius, space } from '@/design/tokens';

/**
 * Props are derived from the navigator rather than imported from
 * @react-navigation/bottom-tabs: expo-router's Tabs passes its own shape
 * (navigateToTab, emitter) which does not match that package's
 * BottomTabBarProps.
 */
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/**
 * Mobile primary navigation. Replaces the default tab bar so it uses semantic
 * tokens and a brand-tinted active treatment rather than a saturated block.
 */
export function BottomNav({ state, navigateToTab }: TabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surfacePrimary,
          borderTopColor: colors.borderPrimary,
          paddingBottom: insets.bottom || space[2],
        },
      ]}>
      {state.routes.map((route, index) => {
        const config = NAV_ROUTES.find((r) => r.name === route.name);
        if (!config) return null;

        const active = state.index === index;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={config.label}
            onPress={() => {
              if (!active) navigateToTab(route.key);
            }}
            style={styles.item}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: active ? colors.brandSubtle : 'transparent' },
              ]}>
              <SymbolView
                name={config.icon}
                tintColor={active ? colors.brandPrimary : colors.textMuted}
                size={22}
              />
            </View>
            <Text variant="caption" color={active ? 'brandPrimary' : 'textMuted'}>
              {config.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: space[2] },
  item: { flex: 1, alignItems: 'center', gap: space[1], minHeight: MIN_TOUCH_TARGET },
  iconWrap: { paddingHorizontal: space[4], paddingVertical: space[1], borderRadius: radius.pill },
});
