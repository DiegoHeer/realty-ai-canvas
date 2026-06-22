import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Brand } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface SettingsOption {
  /** Stable identity, used for selection comparison and as the React key. */
  key: string;
  label: string;
}

/** Feather-style check mark, shown next to the active option. */
function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * Full-screen single-select list backing the Language and Appearance settings
 * pages. Renders a grouped card of options with a check mark on the active one;
 * the parent owns what selecting does (apply the choice, then navigate back).
 */
export function SettingsOptionsScreen({
  options,
  selectedKey,
  onSelect,
}: {
  options: SettingsOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const scheme = useColorScheme();
  // Accent matching the app's `text-blue-600 dark:text-blue-400` convention.
  const checkColor = scheme === 'dark' ? Brand.blueLight : Brand.blue;

  return (
    <View className="flex-1 bg-neutral-100 dark:bg-black">
      <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
        <View className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-neutral-900">
          {options.map((option, index) => {
            const selected = option.key === selectedKey;
            return (
              <Pressable
                key={option.key}
                onPress={() => onSelect(option.key)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={`flex-row items-center justify-between px-4 py-4 active:opacity-60 ${
                  index > 0 ? 'border-t border-neutral-100 dark:border-neutral-800' : ''
                }`}>
                <Text className="text-lg text-neutral-900 dark:text-white">{option.label}</Text>
                {selected ? <CheckIcon color={checkColor} /> : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
