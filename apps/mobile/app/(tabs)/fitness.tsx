import { ModuleScreen, styles } from '@/components/ModuleScreen';
import { Text } from '@/components/Themed';

export default function FitnessScreen() {
  return (
    <ModuleScreen title="Fitness" phase="Phase 5">
      <Text style={styles.caption}>
        Training plans, workout templates and a set-level diary. Sessions
        snapshot their template at start, so editing a plan never rewrites
        history.
      </Text>
    </ModuleScreen>
  );
}
