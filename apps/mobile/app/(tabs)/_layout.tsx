import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BottomNav } from '@/components/nav/BottomNav';
import { Sidebar } from '@/components/nav/Sidebar';
import { NAV_ROUTES } from '@/components/nav/routes';
import { useColors, useLayout } from '@/design/theme';

/**
 * Responsive application shell.
 *
 * One navigator, two presentations: a 240px sidebar from the desktop
 * breakpoint up, bottom navigation below it. The Tabs navigator is kept in
 * both cases — swapping navigators by width would reset navigation state every
 * time the window crosses the breakpoint.
 */
export default function TabsLayout() {
  const { isWide } = useLayout();
  const colors = useColors();

  return (
    <View style={[styles.shell, { backgroundColor: colors.backgroundPrimary }]}>
      {isWide ? <Sidebar /> : null}

      <View style={styles.content}>
        <Tabs
          screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
          // On wide screens the sidebar is the navigation, so the tab bar is
          // rendered as nothing rather than hidden with display:none.
          tabBar={isWide ? () => null : (props) => <BottomNav {...props} />}>
          {NAV_ROUTES.map((route) => (
            <Tabs.Screen key={route.name} name={route.name} options={{ title: route.label }} />
          ))}
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row' },
  content: { flex: 1 },
});
