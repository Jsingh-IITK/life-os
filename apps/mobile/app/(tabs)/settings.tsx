import { ModuleScreen, styles } from '@/components/ModuleScreen';
import { Text } from '@/components/Themed';

export default function SettingsScreen() {
  return (
    <ModuleScreen title="Settings" phase="Phase 1">
      <Text style={styles.caption}>
        Profile, preferences, currency, timezone and per-module settings. Every
        value is owned by the signed-in user — none of it is a global default.
      </Text>
    </ModuleScreen>
  );
}
