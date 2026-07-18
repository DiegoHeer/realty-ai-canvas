import { useListings, useListingsCount } from '@realty/data';
import { useTranslation } from '@realty/i18n';
import { ListingCard } from '@realty/ui';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LikeButton } from '@/components/like-button';
import { LocationSearch, type LocationSearchRef } from '@/components/location-search';
import { SORT_BUTTON_HEIGHT, SortButton, SortMenu } from '@/components/sort-dropdown';
import { countActiveFilters, filtersToQuery, SORT_OPTIONS, useFilters } from '@/lib/filters';
import { useRecentViews } from '@/lib/recent-views';

// Vertical room the absolutely-positioned search bar needs: its 8px top offset,
// the bar itself (~54px: py-1 around the 46px filters pill), and a small gap
// before the title. The bar overlays the page (like on the map screen) so its
// dropdowns can cover the feed instead of pushing it down.
const SEARCH_BAR_CLEARANCE = 72;

function openListing(id: string) {
  router.push({ pathname: '/listing/[id]', params: { id } });
}

/**
 * Horizontal carousel of recently opened listings, pulled from persistent
 * storage. Rendered as the list header so it scrolls away with the feed;
 * renders nothing until the user has viewed at least one listing.
 */
function RecentlyViewed() {
  const { recentViews, clearRecentViews } = useRecentViews();
  const { t } = useTranslation();

  if (recentViews.length === 0) return null;

  return (
    <View className="mb-4">
      <View className="mb-2 flex-row items-center justify-between px-1">
        <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {t('listings.recentlyViewed')}
        </Text>
        <Pressable onPress={clearRecentViews} hitSlop={8} accessibilityRole="button">
          <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
            {t('listings.clearRecent')}
          </Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {recentViews.map((listing) => (
          <View key={listing.id} className="mr-3 w-72">
            <ListingCard
              listing={listing}
              onPress={() => openListing(listing.id)}
              likeButton={<LikeButton listing={listing} />}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export default function ListingsScreen() {
  const { filters, setFilters } = useFilters();
  // Same filtered query as the map screen — the shared filters store keeps the
  // list, the map, and the bar's count badge in lock-step.
  const query = useMemo(() => filtersToQuery(filters), [filters]);
  const { data: listings = [], isLoading, refetch, isRefetching } = useListings(query);
  // The feed only ever holds one fetched page (capped server-side), so its
  // length understates the true match count — mirror the filters screen's
  // "Show N homes" badge and ask the server directly (limit=0 count-only mode).
  const { data: totalCount, isLoading: isCountLoading } = useListingsCount(query);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const searchRef = useRef<LocationSearchRef>(null);
  const [searchActive, setSearchActive] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  // Reuse the filters screen's curated option set and its translated labels, so
  // the header dropdown and the Filters page always agree.
  const sortOptions = SORT_OPTIONS.map((key) => ({
    key,
    label: t(`filtersPage.sortOptions.${key}` as const),
  }));
  const currentSortLabel = t(`filtersPage.sortOptions.${filters.sort}` as const);

  return (
    <View className="flex-1 bg-neutral-100 dark:bg-black">
      <View className="px-4 pb-2" style={{ paddingTop: insets.top + SEARCH_BAR_CLEARANCE }}>
        <SortButton
          label={currentSortLabel}
          open={sortOpen}
          onPress={() => {
            // Opening the sort menu and the search dropdown at once would stack
            // two overlays; collapse the search first.
            searchRef.current?.dismiss();
            setSortOpen((open) => !open);
          }}
          accessibilityLabel={t('listings.sortBy')}
          testID="sort-button"
        />
        <Text className="text-sm text-neutral-500">
          {isLoading || isCountLoading
            ? t('common.loading')
            : t('listings.count', { count: totalCount ?? listings.length })}
        </Text>
      </View>
      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 128 }}
        showsVerticalScrollIndicator={false}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListHeaderComponent={RecentlyViewed}
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            onPress={() => openListing(item.id)}
            likeButton={<LikeButton listing={item} />}
          />
        )}
      />
      {/* Full-screen backdrop: while the search is active, a tap anywhere
          outside the field/dropdown collapses it and hides the keyboard.
          Rendered above the feed but below the search overlay (which keeps its
          own taps), so only "outside" taps reach it. */}
      {searchActive && (
        <Pressable
          className="absolute inset-0"
          onPress={() => searchRef.current?.dismiss()}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <View
        className="absolute inset-x-0 px-4"
        style={{ top: insets.top + 8 }}
        pointerEvents="box-none">
        <LocationSearch
          ref={searchRef}
          onActiveChange={(active) => {
            setSearchActive(active);
            // Focusing the search collapses the sort menu, so the two overlays
            // never show at once.
            if (active) setSortOpen(false);
          }}
          activeFilterCount={countActiveFilters(filters)}
          onOpenFilters={() => router.push('/settings/filters')}
          // The listings API can't narrow by place yet, so picking a result only
          // records it as a recent search; the feed stays unchanged. Wire the
          // result into `query` once the backend request lands — see
          // docs/backend/residences-location-search.md.
          onResult={() => {}}
        />
      </View>
      {/* Anchored under the header's sort button; rendered here at the screen
          root (after the search overlay) so the card floats above the feed and
          its backdrop can cover the whole screen. */}
      {sortOpen && (
        <SortMenu
          options={sortOptions}
          selected={filters.sort}
          onSelect={(sort) => {
            setFilters({ ...filters, sort });
            setSortOpen(false);
          }}
          onClose={() => setSortOpen(false)}
          top={insets.top + SEARCH_BAR_CLEARANCE + SORT_BUTTON_HEIGHT + 4}
          left={16}
        />
      )}
    </View>
  );
}
