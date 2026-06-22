import { useTranslation } from '@realty/i18n';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSubmitEditingEventData,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { geocode, lookup, suggest, type GeocodeResult, type GeocodeSuggestion } from '@/lib/pdok';
import { useRecentSearches } from '@/lib/recent-searches';

const ICON_COLOR = '#9ca3af';

// Feather-style stroked icons, drawn as SVG so they render identically across
// web/iOS/Android without depending on an icon font.
function SearchIcon({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle
        cx={11}
        cy={11}
        r={8}
        stroke={ICON_COLOR}
        strokeWidth={2}
      />
      <Path
        d="M21 21l-4.35-4.35"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function BackIcon({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 12H5M12 19l-7-7 7-7"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Clock face + hands — marks a recent search as a past/history entry.
function ClockIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={ICON_COLOR} strokeWidth={2} />
      <Path
        d="M12 7v5l3 2"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const SUGGEST_DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;

export interface LocationSearchProps {
  /** Fired with the resolved place when the user submits or picks a suggestion. */
  onResult: (result: GeocodeResult) => void;
  /**
   * Fired when the field gains/loses focus or a dropdown opens/closes. The
   * parent uses this to render a full-screen, tap-catching backdrop while the
   * search is active (see `dismiss`).
   */
  onActiveChange?: (active: boolean) => void;
  /**
   * Overrides the field's placeholder. The map screen passes the selected
   * city's name while its neighborhoods are shown; falls back to the default
   * "Search" hint when omitted.
   */
  placeholder?: string;
}

export interface LocationSearchRef {
  /** Close any dropdown, blur the field, and hide the keyboard. */
  dismiss: () => void;
}

/**
 * Search bar overlaying the map. As the user types we fetch autocomplete
 * suggestions from PDOK Locatieserver and show them in a dropdown; picking one
 * (or pressing Enter, which takes the top hit) resolves a coordinate and hands
 * it to the parent, which flies the camera there. Built on React Native
 * primitives so the single file serves web and native.
 */
export const LocationSearch = forwardRef<LocationSearchRef, LocationSearchProps>(
  function LocationSearch({ onResult, onActiveChange, placeholder }, ref) {
  const { t } = useTranslation();
  const { recentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } =
    useRecentSearches();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Show the recents dropdown while the field is focused and empty. Set on
  // focus and cleared when the user acts (resolve), mirroring how `open` is
  // managed — we deliberately don't hide on blur so a recent stays tappable.
  const [focused, setFocused] = useState(false);

  const inputRef = useRef<TextInput>(null);
  // Abort an in-flight resolve (submit / suggestion pick) if a newer one starts.
  const inFlight = useRef<AbortController | null>(null);
  // Separate controller + timer for the debounced suggest stream.
  const suggestCtrl = useRef<AbortController | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // After a pick/submit we suppress the suggestion fetch the value change triggers.
  const skipNextSuggest = useRef(false);

  useEffect(() => {
    return () => {
      inFlight.current?.abort();
      suggestCtrl.current?.abort();
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, []);

  // The field/dropdown is "active" whenever it's focused or showing a panel.
  // The parent overlays a tap-catching backdrop while active so a tap anywhere
  // outside collapses the search (see `dismiss`).
  useEffect(() => {
    onActiveChange?.(focused || open);
  }, [focused, open, onActiveChange]);

  // Close any dropdown, blur the field, and hide the keyboard. Shared by the
  // imperative handle (backdrop tap) and the left-side back-arrow button.
  function dismiss() {
    Keyboard.dismiss();
    inputRef.current?.blur();
    setOpen(false);
    setFocused(false);
  }

  useImperativeHandle(ref, () => ({ dismiss }), []);

  function fetchSuggestions(text: string) {
    suggestCtrl.current?.abort();
    const q = text.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    suggestCtrl.current = controller;
    suggest(q, controller.signal)
      .then((results) => {
        if (controller.signal.aborted) return;
        setSuggestions(results);
        setOpen(results.length > 0);
      })
      .catch((err) => {
        if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return;
        setSuggestions([]);
        setOpen(false);
      });
  }

  function handleChange(text: string) {
    setQuery(text);
    if (error) setError(null);
    if (debounce.current) clearTimeout(debounce.current);
    if (skipNextSuggest.current) {
      skipNextSuggest.current = false;
      return;
    }
    debounce.current = setTimeout(() => fetchSuggestions(text), SUGGEST_DEBOUNCE_MS);
  }

  // Resolve a coordinate via `resolver`, then hand it up and collapse the UI.
  async function resolve(label: string, resolver: (signal: AbortSignal) => Promise<GeocodeResult | null>) {
    inFlight.current?.abort();
    suggestCtrl.current?.abort();
    if (debounce.current) clearTimeout(debounce.current);
    const controller = new AbortController();
    inFlight.current = controller;

    setLoading(true);
    setError(null);
    setOpen(false);
    setFocused(false);
    skipNextSuggest.current = true;
    setQuery(label);
    try {
      const result = await resolver(controller.signal);
      if (controller.signal.aborted) return;
      if (result) {
        skipNextSuggest.current = true;
        setQuery(result.label);
        setSuggestions([]);
        addRecentSearch(result);
        onResult(result);
      } else {
        setError(t('search.noResults'));
      }
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return;
      setError(t('search.error'));
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setLoading(false);
      }
    }
  }

  function handleSubmit(e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) {
    const text = e.nativeEvent.text.trim();
    if (!text) return;
    void resolve(text, (signal) => geocode(text, signal));
  }

  function handlePick(item: GeocodeSuggestion) {
    // Dismiss the soft keyboard on native; no-op on web.
    Keyboard.dismiss();
    void resolve(item.label, (signal) => lookup(item.id, signal));
  }

  // A recent already carries its coordinate, so skip the network and fly there
  // directly; re-adding moves it back to the front of the list.
  function handlePickRecent(item: GeocodeResult) {
    Keyboard.dismiss();
    inFlight.current?.abort();
    suggestCtrl.current?.abort();
    if (debounce.current) clearTimeout(debounce.current);
    setFocused(false);
    setOpen(false);
    setError(null);
    skipNextSuggest.current = true;
    setQuery(item.label);
    setSuggestions([]);
    addRecentSearch(item);
    onResult(item);
  }

  function handleClear() {
    inFlight.current?.abort();
    suggestCtrl.current?.abort();
    if (debounce.current) clearTimeout(debounce.current);
    inFlight.current = null;
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    setError(null);
    setLoading(false);
  }

  return (
    <View>
      <View className="flex-row items-center rounded-2xl bg-white px-4 py-1 shadow-md shadow-black/20 dark:bg-neutral-800">
        {/* Left affordance: a search glyph that focuses the field, swapping to a
            back arrow while focused that collapses the search (mirrors the
            backdrop-tap dismiss). */}
        <Pressable
          onPress={() => (focused ? dismiss() : inputRef.current?.focus())}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={focused ? t('search.back') : t('search.focus')}
          className="mr-2">
          {focused ? <BackIcon /> : <SearchIcon />}
        </Pressable>
        <TextInput
          ref={inputRef}
          className="flex-1 text-xl py-2 text-base text-neutral-900 dark:text-white"
          value={query}
          onChangeText={handleChange}
          onSubmitEditing={handleSubmit}
          onFocus={() => {
            setFocused(true);
            if (suggestions.length > 0) setOpen(true);
          }}
          placeholder={placeholder ?? t('search.placeholder')}
          placeholderTextColor="#9ca3af"
          returnKeyType="search"
          autoCapitalize="words"
          autoCorrect={false}
          clearButtonMode="never"
        />
        {loading ? (
          <ActivityIndicator className="ml-2" />
        ) : query.length > 0 ? (
          <Pressable
            onPress={handleClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('search.clear')}>
            <Text className="ml-2 text-lg text-neutral-400">✕</Text>
          </Pressable>
        ) : null}
      </View>

      {focused && query.trim().length === 0 && recentSearches.length > 0 && (
        <View className="mt-1 overflow-hidden rounded-2xl bg-white shadow-md shadow-black/20 dark:bg-neutral-800">
          <View className="flex-row items-center justify-between px-4 pb-1 pt-3">
            <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {t('search.recentTitle')}
            </Text>
            <Pressable onPress={clearRecentSearches} hitSlop={8} accessibilityRole="button">
              <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
                {t('search.clearRecent')}
              </Text>
            </Pressable>
          </View>
          {recentSearches.map((item, index) => (
            <View
              key={`${item.label}-${item.type}`}
              className={`flex-row items-center ${
                index > 0 ? 'border-t border-neutral-100 dark:border-neutral-700' : ''
              }`}>
              <Pressable
                onPress={() => handlePickRecent(item)}
                accessibilityRole="button"
                className="flex-1  text-lg  flex-row items-center gap-2 px-4 py-3 active:bg-neutral-100 dark:active:bg-neutral-700">
                <ClockIcon />
                <Text className="flex-1 text-base text-neutral-900 dark:text-white" numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => removeRecentSearch(`${item.label}|${item.type}`)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('search.removeRecent')}
                className="px-4 text-lg py-3 active:opacity-60">
                <Text className="text-base text-neutral-400">✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {open && suggestions.length > 0 && (
        <View className="mt-1 overflow-hidden rounded-2xl bg-white shadow-md shadow-black/20 dark:bg-neutral-800">
          {suggestions.map((item, index) => (
            <Pressable
              key={item.id}
              onPress={() => handlePick(item)}
              accessibilityRole="button"
              className={`px-4 py-3 active:bg-neutral-100 dark:active:bg-neutral-700 ${
                index > 0 ? 'border-t border-neutral-100 dark:border-neutral-700' : ''
              }`}>
              <Text className="text-base text-neutral-900 dark:text-white" numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {error && (
        <Text className="mt-1 px-3 text-sm text-red-500" accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
});
