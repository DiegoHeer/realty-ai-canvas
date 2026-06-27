import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useEffectiveColorScheme } from '@/components/map-style';

/** A titled card grouping one filter control, with an optional value summary. */
export function FilterSection({
  title,
  value,
  children,
}: {
  title: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-neutral-900 dark:text-white">{title}</Text>
        {value ? (
          <Text className="text-sm font-medium text-blue-600 dark:text-blue-400">{value}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export interface PillOption {
  key: string;
  label: string;
}

/**
 * A wrapping row of selectable pills. Presentational only: it reflects
 * `selected` and fires `onToggle(key)` — the parent decides single vs. multi.
 * Colours are inline (theme-driven) so they never depend on an uncompiled
 * NativeWind class.
 */
export function SelectPills({
  options,
  selected,
  onToggle,
}: {
  options: PillOption[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  const isDark = useEffectiveColorScheme() === 'dark';
  const borderColor = isDark ? '#404040' : '#d4d4d4';
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt.key);
        const bg = active ? (isDark ? '#ffffff' : '#171717') : isDark ? '#262626' : '#ffffff';
        const fg = active ? (isDark ? '#171717' : '#ffffff') : isDark ? '#ffffff' : '#171717';
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onToggle(opt.key)}
            style={{ backgroundColor: bg, borderColor: active ? bg : borderColor, borderWidth: 1 }}
            className="rounded-full px-4 py-2 active:opacity-80">
            <Text style={{ color: fg }} className="text-base font-medium">
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A −/+ stepper. `formatValue` renders the current value (e.g. 0 → "Any"). */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  formatValue,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  formatValue?: (value: number) => string;
}) {
  const isDark = useEffectiveColorScheme() === 'dark';
  const fg = isDark ? '#ffffff' : '#171717';
  const disabledFg = isDark ? '#525252' : '#d4d4d4';
  const borderColor = isDark ? '#404040' : '#d4d4d4';
  const canDec = value > min;
  const canInc = value < max;
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-base text-neutral-700 dark:text-neutral-300">
        {formatValue ? formatValue(value) : String(value)}
      </Text>
      <View className="flex-row items-center gap-3">
        <StepButton
          label="−"
          color={canDec ? fg : disabledFg}
          borderColor={borderColor}
          onPress={() => canDec && onChange(value - step)}
        />
        <StepButton
          label="+"
          color={canInc ? fg : disabledFg}
          borderColor={borderColor}
          onPress={() => canInc && onChange(value + step)}
        />
      </View>
    </View>
  );
}

function StepButton({
  label,
  color,
  borderColor,
  onPress,
}: {
  label: string;
  color: string;
  borderColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={6}
      style={{ borderColor }}
      className="h-9 w-9 items-center justify-center rounded-full border active:opacity-60">
      <Text style={{ color, lineHeight: 24 }} className="text-2xl">
        {label}
      </Text>
    </Pressable>
  );
}
