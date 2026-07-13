import { useTranslation } from '@realty/i18n';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSubmitEditingEventData,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useEffectiveColorScheme } from '@/components/map-style';
import { useFadingText } from '@/components/use-fading-text';
import { trackSearch, type SearchMethod } from '@/lib/analytics';
import { useRecentSearches } from '@/lib/recent-searches';
import {
  resolvePick,
  resolveTyped,
  resultKey,
  resultLabel,
  resultType,
  splitSuggestionLabel,
  suggestAll,
  type Origin,
  type SearchResult,
  type SearchSource,
  type SearchSuggestion,
} from '@/lib/search';

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

// Sliders-horizontal — the filters affordance on the right of the bar. Two
// rails with ring knobs (top one left-of-centre, bottom right-of-centre). Drawn
// theme-aware (not the muted ICON_COLOR) so it reads as prominent as the
// reference: `color` strokes the rails/rings, `knobFill` matches the bar's
// background so each knob reads as a ring sitting on its rail.
function FilterIcon({
  size = 22,
  color,
  knobFill,
}: {
  size?: number;
  color: string;
  knobFill: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 9h18" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M3 15h18" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={9} cy={9} r={3} fill={knobFill} stroke={color} strokeWidth={2} />
      <Circle cx={15} cy={15} r={3} fill={knobFill} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

// Leading icons that cue each suggestion's kind, mirroring the stroked-SVG style
// of the settings icons in `app/(tabs)/profile.tsx`. Sized to sit beside a
// `text-base` label (matching the recents `ClockIcon`) and drawn in the muted
// `ICON_COLOR` so they read as a secondary cue, not competing with the label.

// A single dwelling — a home with a house number (a residence) or a PDOK `adres`.
function HouseIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9 22V12h6v10"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// A cluster of two houses — a neighborhood (buurt/wijk).
function NeighborhoodIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 21v-8l4-3 4 3v8"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M13 21v-8l4-3 4 3v8"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M2 21h20" stroke={ICON_COLOR} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// Tall buildings — a city (gemeente/woonplaats).
function CityIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M10 6h4M10 10h4M10 14h4M10 18h4" stroke={ICON_COLOR} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// A road receding to the horizon with a dashed centerline — a street (a PDOK
// `weg`/`postcode`, i.e. an address without a house number).
function StreetIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 20L8 4" stroke={ICON_COLOR} strokeWidth={2} strokeLinecap="round" />
      <Path d="M19 20L16 4" stroke={ICON_COLOR} strokeWidth={2} strokeLinecap="round" />
      <Path
        d="M12 4v3M12 10.5v3M12 17v3"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const SUGGEST_DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;

const DEFAULT_SOURCES: readonly SearchSource[] = ['places'];

export interface LocationSearchProps {
  /** Fired with the resolved place/buurt/home when the user submits or picks a suggestion. */
  onResult: (result: SearchResult) => void;
  /**
   * Which suggestion sources to draw from. Defaults to `['places']` — the
   * original PDOK-only behavior (explore tab). The map screen opts into homes +
   * buurten as well.
   */
  sources?: readonly SearchSource[];
  /**
   * Origin to rank suggestions against — typically the map's current centre.
   * When set, the merged list is ordered nearest-first; omitted (e.g. on the
   * explore tab) it stays in relevance order.
   */
  origin?: Origin;
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
  /** Tapped the filters button on the right of the bar. */
  onOpenFilters?: () => void;
  /**
   * Number of active filters. When > 0 it's shown as a bold count beside the
   * filters icon (as in the Redfin reference); 0 hides the badge.
   */
  activeFilterCount?: number;
}

export interface LocationSearchRef {
  /** Close any dropdown, blur the field, and hide the keyboard. */
  dismiss: () => void;
}

/**
 * Leading icon for a suggestion, chosen by its kind and — for a place — its PDOK
 * type. A residence or an `adres` is a specific house; `weg`/`postcode` a street;
 * a buurt/wijk a neighborhood; everything else (gemeente/woonplaats/…) a city.
 * The place `type` branch also covers the explore tab, where buurt/wijk arrive
 * as unsectioned places rather than in their own section.
 */
function SuggestionIcon({ item }: { item: SearchSuggestion }) {
  if (item.kind === 'residence') return <HouseIcon />;
  if (item.kind === 'buurt') return <NeighborhoodIcon />;
  switch (item.type) {
    case 'adres':
      return <HouseIcon />;
    case 'weg':
    case 'postcode':
      return <StreetIcon />;
    case 'buurt':
    case 'wijk':
      return <NeighborhoodIcon />;
    default:
      return <CityIcon />;
  }
}

/** One tappable suggestion row (shared by every section). */
function SuggestionRow({
  item,
  bordered,
  onPick,
}: {
  item: SearchSuggestion;
  bordered: boolean;
  onPick: (item: SearchSuggestion) => void;
}) {
  // Left: the street + house number (or neighborhood name). Right: the zipcode
  // (if any) and city, in a softer tone, aligned to the row's trailing edge.
  const { primary, secondary } = splitSuggestionLabel(item);
  // A city/town (gemeente or woonplaats) is the headline kind of result — its
  // name is the whole left side — so give it bold weight.
  const isCity = item.kind === 'place' && (item.type === 'gemeente' || item.type === 'woonplaats');
  return (
    <Pressable
      onPress={() => onPick(item)}
      accessibilityRole="button"
      className={`flex-row items-center gap-2 px-4 py-3 active:bg-neutral-100 dark:active:bg-neutral-700 ${
        bordered ? 'border-t border-neutral-100 dark:border-neutral-700' : ''
      }`}>
      <SuggestionIcon item={item} />
      <Text
        className={`flex-1 text-base text-neutral-900 dark:text-white ${isCity ? 'font-semibold' : ''}`}
        numberOfLines={1}>
        {primary}
      </Text>
      {secondary.length > 0 && (
        <Text className="shrink-0 text-base text-neutral-400" numberOfLines={1}>
          {secondary}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Search bar overlaying the map. As the user types we fetch autocomplete
 * suggestions from the configured {@link SearchSource}s — homes (the backend's
 * fuzzy residence search), buurten and places (PDOK) — merge them into one list
 * ranked by distance from {@link origin} (the map centre), and each row's icon
 * cues its kind. Picking one (or pressing Enter, which takes the top place)
 * resolves it and hands a {@link SearchResult} to the parent, which acts per
 * kind. Built on React Native primitives so the single file serves web and native.
 */
export const LocationSearch = forwardRef<LocationSearchRef, LocationSearchProps>(
  function LocationSearch(
    {
      onResult,
      sources = DEFAULT_SOURCES,
      origin,
      onActiveChange,
      placeholder,
      onOpenFilters,
      activeFilterCount = 0,
    },
    ref,
  ) {
  const { t } = useTranslation();
  // The filters affordance is a grey pill, its colours set inline (not via
  // NativeWind classes, so they can't fall foul of an uncompiled class) and
  // driven by the effective theme. `filterColor` strokes the glyph and the
  // count; `filterPillBg` fills the pill and each knob's ring centre, so the
  // rings read as cut-outs in the pill.
  const scheme = useEffectiveColorScheme();
  const filterColor = scheme === 'dark' ? '#ffffff' : '#171717';
  const filterPillBg = scheme === 'dark' ? '#404040' : '#e5e5e5';
  // The visible placeholder is an overlay <Text> (a native placeholder can't
  // animate): when the hint changes — the map screen swaps in the selected
  // city's name — the old text fades out, holds, and the new one fades in.
  const placeholderText = placeholder ?? t('search.placeholder');
  const { displayed: displayedPlaceholder, opacity: placeholderOpacity } =
    useFadingText(placeholderText);
  const { recentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } =
    useRecentSearches();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
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
    suggestAll(q, sources, controller.signal, origin)
      .then((list) => {
        if (controller.signal.aborted) return;
        setSuggestions(list);
        setOpen(list.length > 0);
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

  // Resolve a result via `resolver`, then hand it up and collapse the UI.
  async function resolve(
    label: string,
    resolver: (signal: AbortSignal) => Promise<SearchResult | null>,
    method: SearchMethod,
  ) {
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
        setQuery(resultLabel(result));
        setSuggestions([]);
        addRecentSearch(result);
        onResult(result);
        trackSearch(resultType(result), method);
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
    void resolve(text, (signal) => resolveTyped(text, signal), 'typed');
  }

  function handlePick(item: SearchSuggestion) {
    // Dismiss the soft keyboard on native; no-op on web.
    Keyboard.dismiss();
    void resolve(item.label, (signal) => resolvePick(item, signal), 'suggestion');
  }

  // A recent already carries its coordinate / listing, so skip the network and
  // act directly; re-adding moves it back to the front of the list.
  function handlePickRecent(item: SearchResult) {
    Keyboard.dismiss();
    inFlight.current?.abort();
    suggestCtrl.current?.abort();
    if (debounce.current) clearTimeout(debounce.current);
    setFocused(false);
    setOpen(false);
    setError(null);
    skipNextSuggest.current = true;
    setQuery(resultLabel(item));
    setSuggestions([]);
    addRecentSearch(item);
    onResult(item);
    trackSearch(resultType(item), 'recent');
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
      <View className="flex-row items-center rounded-full bg-white py-1 pl-6 pr-1 shadow-md shadow-black/20 dark:bg-neutral-800">
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
        <View className="flex-1">
          <TextInput
            ref={inputRef}
            className="text-xl py-2 text-base text-neutral-900 dark:text-white"
            value={query}
            onChangeText={handleChange}
            onSubmitEditing={handleSubmit}
            onFocus={() => {
              setFocused(true);
              if (suggestions.length > 0) setOpen(true);
            }}
            placeholder={placeholderText}
            placeholderTextColor="transparent"
            returnKeyType="search"
            autoCapitalize="words"
            autoCorrect={false}
            clearButtonMode="never"
          />
          {/* The native placeholder above is kept but painted transparent, so
              screen readers and the web DOM still see it; this overlay draws
              it instead. Font classes match the input's so they align. */}
          {query.length === 0 && (
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { justifyContent: 'center', opacity: placeholderOpacity },
              ]}
              pointerEvents="none">
              <Text
                className="text-xl text-base"
                style={{ color: '#9ca3af' }}
                numberOfLines={1}>
                {displayedPlaceholder}
              </Text>
            </Animated.View>
          )}
        </View>
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
        {/* Filters affordance: a grey pill inset from the bar, holding the
            sliders glyph and — once any filter is configured — the count. */}
        <Pressable
          onPress={onOpenFilters}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('search.filters')}
          style={{ backgroundColor: filterPillBg }}
          className="ml-1.5 flex-row items-center gap-1.5 rounded-full px-3 py-3">
          <FilterIcon color={filterColor} knobFill={filterPillBg} />
          {activeFilterCount > 0 && (
            <Text style={{ color: filterColor }} className="text-base font-bold">
              {activeFilterCount}
            </Text>
          )}
        </Pressable>
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
              key={resultKey(item)}
              className={`flex-row items-center ${
                index > 0 ? 'border-t border-neutral-100 dark:border-neutral-700' : ''
              }`}>
              <Pressable
                onPress={() => handlePickRecent(item)}
                accessibilityRole="button"
                className="flex-1  text-lg  flex-row items-center gap-2 px-4 py-3 active:bg-neutral-100 dark:active:bg-neutral-700">
                <ClockIcon />
                <Text className="flex-1 text-base text-neutral-900 dark:text-white" numberOfLines={1}>
                  {resultLabel(item)}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => removeRecentSearch(resultKey(item))}
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
            <SuggestionRow key={item.id} item={item} bordered={index > 0} onPick={handlePick} />
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
