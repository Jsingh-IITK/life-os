import { Money } from '@life-os/finance-core';
import { Measures } from '@life-os/fitness-core';

import { ModuleScreen, styles } from '@/components/ModuleScreen';
import { Text } from '@/components/Themed';

/**
 * Home. Beyond being the shell's landing screen, this renders values computed
 * by both core packages — which is the Phase 0 proof that the monorepo wiring
 * works: the app can consume the engines, and the engines run on Hermes with
 * the same results they produce under Node in CI.
 */
export default function HomeScreen() {
  const takeHome = Money.fromRupees('125000');
  const committed = Money.fromRupees('70500');
  const remaining = Money.subtract(takeHome, committed);

  const topSet = Measures.fromKilograms('62.5');
  const sessionVolume = Measures.totalVolume([
    { weight: Measures.fromKilograms('60'), reps: Measures.reps(8) },
    { weight: Measures.fromKilograms('62.5'), reps: Measures.reps(8) },
    { weight: Measures.fromKilograms('65'), reps: Measures.reps(6) },
  ]);

  return (
    <ModuleScreen title="Life OS" phase="Phase 0 — shell and shared engines">
      <Text style={styles.row}>Take-home {Money.formatINR(takeHome)}</Text>
      <Text style={styles.row}>Committed {Money.formatINR(committed)}</Text>
      <Text style={styles.row}>Unallocated {Money.formatINR(remaining)}</Text>
      <Text style={styles.row}>Top set {Measures.formatWeight(topSet)}</Text>
      <Text style={styles.row}>Session volume {Measures.formatVolume(sessionVolume)}</Text>
      <Text style={styles.caption}>
        Sample figures rendered through @life-os/finance-core and
        @life-os/fitness-core. Nothing is persisted yet — accounts, transactions
        and workouts arrive in later phases.
      </Text>
    </ModuleScreen>
  );
}
