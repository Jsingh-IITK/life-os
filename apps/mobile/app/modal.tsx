import { Card, Screen, Text } from '@/components/ui';

export default function ModalScreen() {
  return (
    <Screen title="About">
      <Card>
        <Text variant="secondary" color="textSecondary">
          A personal command centre for money and training. Finance and Fitness
          are independent modules over a shared shell, identity and assistant.
        </Text>
      </Card>
    </Screen>
  );
}
