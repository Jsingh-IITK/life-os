import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

/**
 * The shared shell. Finance and Fitness are peers here by design — the PRD
 * treats them as first-class modules, so neither is nested under the other.
 * Future modules (Habits, Journal) slot in as additional tabs without
 * restructuring this layout.
 */
type IconName = Parameters<typeof SymbolView>[0]['name'];

// The tab bar supplies RN's ColorValue, which admits null; SymbolView wants a
// concrete tint, so fall through to its default when the bar passes nothing.
const icon =
  (name: IconName) =>
  ({ color }: { color: ColorValue }) => (
    <SymbolView name={name} tintColor={color ?? undefined} size={26} />
  );

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        // Disable static header render on web to avoid a hydration mismatch.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: icon({ ios: 'house', android: 'home', web: 'home' }),
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: 'Finance',
          tabBarIcon: icon({
            ios: 'indianrupeesign.circle',
            android: 'account_balance_wallet',
            web: 'account_balance_wallet',
          }),
        }}
      />
      <Tabs.Screen
        name="fitness"
        options={{
          title: 'Fitness',
          tabBarIcon: icon({
            ios: 'figure.strengthtraining.traditional',
            android: 'fitness_center',
            web: 'fitness_center',
          }),
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: 'Assistant',
          tabBarIcon: icon({
            ios: 'bubble.left.and.text.bubble.right',
            android: 'chat',
            web: 'chat',
          }),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: icon({ ios: 'gearshape', android: 'settings', web: 'settings' }),
        }}
      />
    </Tabs>
  );
}
