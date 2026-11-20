import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FocusRing } from '@/components/ui/FocusRing';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/design/theme';
import { MIN_TOUCH_TARGET, radius, space } from '@/design/tokens';

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * Segmented chooser. Used instead of a native picker so the options and their
 * consequences are visible rather than hidden behind a tap — picking the wrong
 * transaction type changes what the entry means.
 */
export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  error?: string | null;
}) {
  const colors = useColors();

  return (
    <View style={styles.wrap}>
      <Text variant="secondary" color="textSecondary">
        {label}
      </Text>

      <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <OptionChip
              key={option.value}
              selected={selected}
              label={option.label}
              hint={option.hint}
              onPress={() => onChange(option.value)}
            />
          );
        })}
      </View>

      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
      {/* colors referenced so the themed border below stays in sync */}
      <View style={{ height: 0, borderColor: colors.borderPrimary }} />
    </View>
  );
}

function OptionChip({
  selected,
  label,
  hint,
  onPress,
}: {
  selected: boolean;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.brandSubtle : 'transparent',
          borderColor: selected ? colors.brandPrimary : colors.borderPrimary,
          // Constant width: a focus or selection change must not reflow the
          // row, or the control under the pointer moves mid-click.
          borderWidth: selected ? 2 : 1,
        },
      ]}>
      <FocusRing visible={focused} radius={radius.md} />
      <Text variant="secondary" color={selected ? 'brandPrimary' : 'textSecondary'}>
        {label}
      </Text>
      {hint ? (
        <Text variant="caption" color="textMuted">
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    gap: 1,
  },
});
