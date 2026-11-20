import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';

import { ModuleScreen, styles } from '@/components/ModuleScreen';
import { Text } from '@/components/Themed';

export default function ModalScreen() {
  return (
    <>
      <ModuleScreen title="About" phase="Life OS — Phase 0">
        <Text style={styles.caption}>
          A personal command centre for money and training. Finance and Fitness
          are independent modules over a shared shell, identity and assistant.
        </Text>
      </ModuleScreen>
      {/* Use a light status bar on iOS to account for the modal's black space */}
      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </>
  );
}
