import { SymbolView } from 'expo-symbols';
import { Link, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FUTURE_ROUTES, NAV_ROUTES, type NavRoute } from '@/components/nav/routes';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/design/theme';
import { MIN_TOUCH_TARGET, SIDEBAR_WIDTH, radius, space } from '@/design/tokens';

function isActive(pathname: string, route: NavRoute): boolean {
  return route.match === '/' ? pathname === '/' : pathname.startsWith(route.match);
}

export function Sidebar() {
  const colors = useColors();
  const pathname = usePathname();

  return (
    <View
      style={[
        styles.sidebar,
        { backgroundColor: colors.backgroundSecondary, borderRightColor: colors.borderPrimary },
      ]}>
      <View style={styles.brand}>
        <Text variant="cardHeading">Life OS</Text>
        <Text variant="caption" color="textMuted">
          Your life, in one place
        </Text>
      </View>

      <View style={styles.group} accessibilityRole="menu">
        {NAV_ROUTES.map((route) => (
          <SidebarLink key={route.name} route={route} active={isActive(pathname, route)} />
        ))}
      </View>

      <View style={[styles.group, styles.futureGroup]}>
        <Text variant="caption" color="textMuted" style={styles.groupLabel}>
          Coming soon
        </Text>
        {FUTURE_ROUTES.map((item) => (
          // Not a link: these modules do not exist, so there is nothing to
          // navigate to. Rendering them inert is the honest treatment.
          <View
            key={item.label}
            accessible
            accessibilityLabel={`${item.label}, coming soon`}
            style={[styles.item, styles.disabledItem]}>
            <SymbolView name={item.icon} tintColor={colors.textMuted} size={20} />
            <Text variant="body" color="textMuted">
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SidebarLink({ route, active }: { route: NavRoute; active: boolean }) {
  const colors = useColors();
  const [hovered, setHovered] = useState(false);

  return (
    <Link href={route.href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityState={{ selected: active }}
        accessibilityLabel={route.label}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        // Flattened: Link's asChild renders through Slot, which rejects an
        // array of styles on its child.
        style={StyleSheet.flatten([
          styles.item,
          {
            // A subtle brand tint marks the active item, not a saturated block.
            backgroundColor: active
              ? colors.brandSubtle
              : hovered
                ? colors.surfaceSecondary
                : 'transparent',
          },
        ])}>
        <SymbolView
          name={route.icon}
          tintColor={active ? colors.brandPrimary : colors.textSecondary}
          size={20}
        />
        <Text variant="body" color={active ? 'brandPrimary' : 'textSecondary'}>
          {route.label}
        </Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    borderRightWidth: 1,
    paddingHorizontal: space[3],
    paddingVertical: space[5],
    gap: space[6],
  },
  brand: { paddingHorizontal: space[2], gap: space[1] },
  group: { gap: space[1] },
  futureGroup: { marginTop: 'auto' },
  groupLabel: { paddingHorizontal: space[2], marginBottom: space[1] },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[3],
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
  },
  disabledItem: { opacity: 0.55 },
});
