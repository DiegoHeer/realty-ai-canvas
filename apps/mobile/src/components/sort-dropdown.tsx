import type { SortOption } from '@realty/types';
import { Pressable, Text, View } from 'react-native';

import { CheckIcon, ChevronDownIcon } from '@/components/icons';
import { useEffectiveColorScheme } from '@/components/map-style';

/**
 * Height reserved for {@link SortButton}. The explore header anchors the
 * {@link SortMenu} just below the button using this constant, so the card lines
 * up without any runtime measurement.
 */
export const SORT_BUTTON_HEIGHT = 36;

/** Icon stroke per theme — mirrors the search bar's glyph colors. */
function useGlyphColor() {
  return useEffectiveColorScheme() === 'dark' ? '#ffffff' : '#171717';
}

interface SortButtonProps {
  /** Translated label of the current sort option, shown in place of the title. */
  label: string;
  open: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
}

/**
 * The explore header's sort control. Renders as the screen title (2xl bold) with
 * a chevron and toggles the {@link SortMenu} when pressed; the chevron flips
 * while the menu is open.
 */
export function SortButton({ label, open, onPress, accessibilityLabel, testID }: SortButtonProps) {
  const glyph = useGlyphColor();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // Announce the current selection as the control's value, since the
      // accessibilityLabel ("Sort by") otherwise masks the visible label.
      accessibilityValue={{ text: label }}
      accessibilityState={{ expanded: open }}
      hitSlop={8}
      testID={testID}
      style={{ height: SORT_BUTTON_HEIGHT }}
      className="flex-row items-center gap-1 self-start active:opacity-70">
      <Text className="text-2xl font-bold text-neutral-900 dark:text-white">{label}</Text>
      <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
        <ChevronDownIcon color={glyph} size={22} />
      </View>
    </Pressable>
  );
}

interface SortMenuProps {
  /** Sort options in display order, each paired with its translated label. */
  options: readonly { key: SortOption; label: string }[];
  /** Currently selected option, marked with a check. */
  selected: SortOption;
  onSelect: (option: SortOption) => void;
  /** Dismiss without changing the selection (outside tap). */
  onClose: () => void;
  /** Screen-space offset of the card's top-left corner. */
  top: number;
  left: number;
}

/**
 * Anchored dropdown of sort options, plus a full-screen transparent backdrop
 * that dismisses on an outside tap. Rendered at the explore screen's root (a
 * sibling of the feed) so the card floats above the list — mirroring how the
 * search bar hosts its own dropdowns. The app uses no `Modal`; this keeps to
 * that in-tree-overlay house style.
 */
export function SortMenu({ options, selected, onSelect, onClose, top, left }: SortMenuProps) {
  const glyph = useGlyphColor();
  return (
    <>
      {/* Invisible tap-catcher: an outside tap closes the menu, like the search
          bar's own backdrop (no dim). */}
      <Pressable
        className="absolute inset-0"
        onPress={onClose}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View
        style={{ position: 'absolute', top, left, minWidth: 220 }}
        className="overflow-hidden rounded-2xl bg-white shadow-md shadow-black/20 dark:bg-neutral-800">
        {options.map((opt, index) => {
          const isSelected = opt.key === selected;
          return (
            <Pressable
              key={opt.key}
              onPress={() => onSelect(opt.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              testID={`sort-option-${opt.key}`}
              className={`flex-row items-center justify-between gap-3 px-4 py-3 active:bg-neutral-100 dark:active:bg-neutral-700 ${
                index > 0 ? 'border-t border-neutral-100 dark:border-neutral-700' : ''
              }`}>
              <Text
                className={`text-base ${
                  isSelected
                    ? 'font-semibold text-neutral-900 dark:text-white'
                    : 'text-neutral-700 dark:text-neutral-300'
                }`}
                numberOfLines={1}>
                {opt.label}
              </Text>
              {isSelected && <CheckIcon color={glyph} size={18} />}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}
