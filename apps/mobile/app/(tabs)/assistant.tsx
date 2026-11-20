import { ModuleScreen, styles } from '@/components/ModuleScreen';
import { Text } from '@/components/Themed';

export default function AssistantScreen() {
  return (
    <ModuleScreen title="Assistant" phase="Phase 4 (finance), Phase 5 (fitness)">
      <Text style={styles.caption}>
        Conversational entry in English and Hinglish. The assistant proposes
        structured drafts; deterministic code validates and performs every
        calculation.
      </Text>
    </ModuleScreen>
  );
}
