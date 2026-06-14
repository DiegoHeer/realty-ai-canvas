import { useTranslation } from '@realty/i18n';
import { useEffect, useRef, useState } from 'react';
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

import { geocode, lookup, suggest, type GeocodeResult, type GeocodeSuggestion } from '@/lib/pdok';
import { useRecentSearches } from '@/lib/recent-searches';

const SUGGEST_DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;

export interface LocationSearchProps {
  /** Fired with the resolved place when the user submits or picks a suggestion. */
  onResult: (result: GeocodeResult) => void;
}

/**
 * Search bar overlaying the map. As the user types we fetch autocomplete
 * suggestions from PDOK Locatieserver and show them in a dropdown; picking one
 * (or pressing Enter, which takes the top hit) resolves a coordinate and hands
 * it to the parent, which flies the camera there. Built on React Native
 * primitives so the single file serves web and native.
 */
export function LocationSearch({ onResult }: LocationSearchProps) {
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
        <TextInput
          className="flex-1 py-2 text-base text-neutral-900 dark:text-white"
          value={query}
          onChangeText={handleChange}
          onSubmitEditing={handleSubmit}
          onFocus={() => {
            setFocused(true);
            if (suggestions.length > 0) setOpen(true);
          }}
          placeholder={t('search.placeholder')}
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
                className="flex-1 flex-row items-center gap-2 px-4 py-3 active:bg-neutral-100 dark:active:bg-neutral-700">
                <Text className="text-base text-neutral-400">↩</Text>
                <Text className="flex-1 text-base text-neutral-900 dark:text-white" numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => removeRecentSearch(`${item.label}|${item.type}`)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('search.removeRecent')}
                className="px-4 py-3 active:opacity-60">
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
}
