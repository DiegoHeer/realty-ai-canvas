import { useTranslation } from '@realty/i18n';
import type { NeighborhoodStats } from '@realty/types';
import { useColorScheme } from 'nativewind';
import { useMemo, type ReactNode } from 'react';
import { Text, View, type DimensionValue } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import {
  deriveNeighborhoodStats,
  type AgeRow,
  type StatFormat,
  type StatSegment,
} from '@/lib/neighborhood-stats';

// Chart palettes mirror the design mockup. SEQ is a light→dark sequential ramp
// (age, construction year); CAT is a categorical set (household, tenure, type,
// origin). These are data colors, so they're constants, not theme-aware.
const SEQ = ['#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a'];
const CAT = ['#2563eb', '#0891b2', '#f59e0b', '#9333ea'];
const ACCENT = '#2563eb';
const BUILD_YEAR_COLORS = [SEQ[3], SEQ[1]]; // before 2000 (dark) → from 2000 (light)

const DONUT = { size: 132, r: 52, c: 66, sw: 17 };
const CIRC = 2 * Math.PI * DONUT.r;

const widthPct = (n: number): DimensionValue => `${n}%` as DimensionValue;

/** Locale-aware number formatters, rebuilt only when the language changes. */
function useFmt() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return useMemo(() => {
    const grouped = new Intl.NumberFormat(lang);
    const dec1 = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return {
      count: (n: number) => grouped.format(n),
      grouped: (n: number) => grouped.format(n),
      euroK: (n: number) => `€${grouped.format(Math.round(n))}k`,
      euroKDec: (n: number) => `€${dec1.format(n)}k`,
      percent1: (n: number) => `${dec1.format(n)}%`,
      decimal1: (n: number) => dec1.format(n),
    };
  }, [lang]);
}

type Fmt = ReturnType<typeof useFmt>;

/** Render a value+format pair, or an em dash when the figure is suppressed. */
function formatStat(fmt: Fmt, value: number | null, format: StatFormat): string {
  if (value == null) return '—';
  switch (format) {
    case 'count':
      return fmt.count(value);
    case 'euroK':
      return fmt.euroK(value);
    case 'euroKDec':
      return fmt.euroKDec(value);
    case 'percent':
      return fmt.percent1(value);
  }
}

// --- Building blocks ---------------------------------------------------------

function TileBox({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[46%] flex-1 rounded-2xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700/60 dark:bg-neutral-800/80">
      <Text
        numberOfLines={1}
        className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </Text>
      <Text className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white">{value}</Text>
    </View>
  );
}

function StatCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700/60 dark:bg-neutral-800/50">
      <Text className="text-[15px] font-semibold text-neutral-900 dark:text-white">{title}</Text>
      {hint ? (
        <Text className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{hint}</Text>
      ) : null}
      <View className="mt-3">{children}</View>
    </View>
  );
}

function Legend({
  items,
  column,
}: {
  items: { label: string; percent: number; color: string }[];
  column?: boolean;
}) {
  return (
    <View className={column ? 'gap-2' : 'mt-3 flex-row flex-wrap gap-x-4 gap-y-2'}>
      {items.map((it) => (
        <View key={it.label} className="flex-row items-center gap-2">
          <View className="h-3 w-3 rounded-sm" style={{ backgroundColor: it.color }} />
          <Text className="text-xs text-neutral-600 dark:text-neutral-300">
            {it.label}{' '}
            <Text className="font-bold text-neutral-900 dark:text-white">{it.percent}%</Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Stacked horizontal bar for independent or normalized part-to-whole shares. */
function SegmentedBar({ segments, colors }: { segments: StatSegment[]; colors: string[] }) {
  const { t } = useTranslation();
  const legendItems = segments.map((seg, i) => ({
    label: t(`area.stats.${seg.labelKey}`),
    percent: seg.percent,
    color: colors[i % colors.length]!,
  }));
  return (
    <View>
      <View className="h-7 flex-row overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-700">
        {segments.map((seg, i) => (
          <View
            key={seg.labelKey}
            style={{ width: widthPct(seg.weight), backgroundColor: colors[i % colors.length] }}
          />
        ))}
      </View>
      <Legend items={legendItems} />
    </View>
  );
}

/** Centered horizontal bars; widths are relative to the largest bucket. */
function AgeBars({ rows }: { rows: AgeRow[] }) {
  const { t } = useTranslation();
  const max = Math.max(...rows.map((r) => r.percent), 1);
  return (
    <View className="gap-3">
      {rows.map((row, i) => (
        <View key={row.labelKey} className="flex-row items-center gap-3">
          <Text className="w-16 text-right text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            {t(`area.stats.${row.labelKey}`)}
          </Text>
          <View className="h-5 flex-1 justify-center">
            <View
              className="h-5 rounded-md"
              style={{
                width: widthPct((row.percent / max) * 100),
                minWidth: 4,
                backgroundColor: SEQ[SEQ.length - 1 - i] ?? SEQ[0],
              }}
            />
          </View>
          <Text className="w-9 text-xs font-bold text-neutral-900 dark:text-white">
            {row.percent}%
          </Text>
        </View>
      ))}
    </View>
  );
}

/** SVG donut whose arcs are drawn with stroke-dasharray, plus a center stat. */
function Donut({ segments, center }: { segments: StatSegment[]; center?: string }) {
  const { colorScheme } = useColorScheme();
  const track = colorScheme === 'dark' ? '#3f3f46' : '#eceef1';
  const arcs = segments.map((seg, i) => {
    const len = (seg.weight / 100) * CIRC;
    // Cumulative length of the preceding arcs, so each arc starts where the last
    // ended. Computed via slice+reduce (no mutation) to satisfy the React
    // Compiler immutability lint; the segment count is tiny.
    const offset = segments
      .slice(0, i)
      .reduce((sum, prev) => sum + (prev.weight / 100) * CIRC, 0);
    return { len, offset, color: CAT[i % CAT.length]!, key: seg.labelKey };
  });
  return (
    <View style={{ width: DONUT.size, height: DONUT.size }}>
      <Svg width={DONUT.size} height={DONUT.size}>
        <Circle
          cx={DONUT.c}
          cy={DONUT.c}
          r={DONUT.r}
          fill="none"
          stroke={track}
          strokeWidth={DONUT.sw}
        />
        {arcs.map((arc) => (
          <Circle
            key={arc.key}
            cx={DONUT.c}
            cy={DONUT.c}
            r={DONUT.r}
            fill="none"
            stroke={arc.color}
            strokeWidth={DONUT.sw}
            strokeDasharray={`${arc.len} ${CIRC - arc.len}`}
            strokeDashoffset={-arc.offset}
            rotation={-90}
            originX={DONUT.c}
            originY={DONUT.c}
          />
        ))}
      </Svg>
      {center ? (
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <Text className="text-2xl font-bold text-neutral-900 dark:text-white">{center}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ShareBar({ label, value, fmt }: { label: string; value: number; fmt: Fmt }) {
  return (
    <View>
      <View className="flex-row items-baseline justify-between">
        <Text className="text-[13px] text-neutral-700 dark:text-neutral-300">{label}</Text>
        <Text className="text-[13px] font-bold text-neutral-900 dark:text-white">
          {fmt.percent1(value)}
        </Text>
      </View>
      <View className="mt-1.5 h-3 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <View
          className="h-3 rounded-full"
          style={{ width: widthPct(value), backgroundColor: ACCENT }}
        />
      </View>
    </View>
  );
}

function MissingState() {
  const { t } = useTranslation();
  return (
    <View className="h-12 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800">
      <Text className="text-xs italic text-neutral-500 dark:text-neutral-400">
        {t('area.stats.missing')}
      </Text>
    </View>
  );
}

// --- Composed sheet ----------------------------------------------------------

export interface AreaStatsProps {
  /** Stats for the selected area, or null when none are available. */
  stats?: NeighborhoodStats | null;
}

/**
 * Renders one neighborhood's CBS statistics as the curated set of charts from
 * the design: a KPI strip, age bars, a household-composition donut, segmented
 * bars (tenure, dwelling type, origin, construction year), income tiles + share
 * bars, energy tiles, and a district-heating card that demonstrates the
 * suppressed-data state. Each section is omitted when its data is absent;
 * district heating always renders so the "not disclosed" state stays visible.
 */
export function AreaStats({ stats }: AreaStatsProps) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const view = useMemo(() => deriveNeighborhoodStats(stats), [stats]);

  if (!view || !stats) {
    return (
      <Text className="mt-2 text-base leading-6 text-neutral-600 dark:text-neutral-300">
        {t('area.noStats')}
      </Text>
    );
  }

  return (
    <View className="mt-3 gap-3">
      <View className="flex-row">
        <View className="self-start rounded-full bg-blue-50 px-2.5 py-1 dark:bg-blue-950">
          <Text className="text-xs font-semibold text-blue-600 dark:text-blue-300">
            {`CBS ${stats.statsYear}`}
          </Text>
        </View>
      </View>

      <View className="flex-row flex-wrap gap-3">
        {view.kpis.map((kpi) => (
          <TileBox
            key={kpi.labelKey}
            label={t(`area.stats.${kpi.labelKey}`)}
            value={formatStat(fmt, kpi.value, kpi.format)}
          />
        ))}
      </View>

      {view.age ? (
        <StatCard title={t('area.stats.ageTitle')} hint={t('area.stats.ageHint')}>
          <AgeBars rows={view.age} />
        </StatCard>
      ) : null}

      {view.household ? (
        <StatCard title={t('area.stats.householdTitle')} hint={t('area.stats.householdHint')}>
          <View className="flex-row items-center gap-4">
            <Donut
              segments={view.household.segments}
              center={view.household.size != null ? fmt.decimal1(view.household.size) : undefined}
            />
            <View className="flex-1">
              <Legend
                column
                items={view.household.segments.map((seg, i) => ({
                  label: t(`area.stats.${seg.labelKey}`),
                  percent: seg.percent,
                  color: CAT[i % CAT.length]!,
                }))}
              />
              <Text className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                {t('area.stats.householdSizeUnit')}
              </Text>
            </View>
          </View>
        </StatCard>
      ) : null}

      {view.tenure ? (
        <StatCard title={t('area.stats.tenureTitle')} hint={t('area.stats.tenureHint')}>
          <SegmentedBar segments={view.tenure} colors={CAT} />
        </StatCard>
      ) : null}

      {view.dwellingType ? (
        <StatCard
          title={t('area.stats.dwellingTypeTitle')}
          hint={t('area.stats.dwellingTypeHint')}>
          <SegmentedBar segments={view.dwellingType} colors={CAT} />
        </StatCard>
      ) : null}

      {view.origin ? (
        <StatCard title={t('area.stats.originTitle')} hint={t('area.stats.originHint')}>
          <SegmentedBar segments={view.origin} colors={CAT} />
        </StatCard>
      ) : null}

      {view.buildYear ? (
        <StatCard title={t('area.stats.buildYearTitle')} hint={t('area.stats.buildYearHint')}>
          <SegmentedBar segments={view.buildYear} colors={BUILD_YEAR_COLORS} />
        </StatCard>
      ) : null}

      {view.income ? (
        <StatCard title={t('area.stats.incomeTitle')} hint={t('area.stats.incomeHint')}>
          <View className="flex-row flex-wrap gap-3">
            {view.income.tiles.map((tile) => (
              <TileBox
                key={tile.labelKey}
                label={t(`area.stats.${tile.labelKey}`)}
                value={formatStat(fmt, tile.value, tile.format)}
              />
            ))}
          </View>
          {view.income.shares.length > 0 ? (
            <View className="mt-4 gap-3">
              {view.income.shares.map((share) => (
                <ShareBar
                  key={share.labelKey}
                  label={t(`area.stats.${share.labelKey}`)}
                  value={share.value}
                  fmt={fmt}
                />
              ))}
            </View>
          ) : null}
        </StatCard>
      ) : null}

      {view.energy ? (
        <StatCard title={t('area.stats.energyTitle')} hint={t('area.stats.energyHint')}>
          <View className="flex-row flex-wrap gap-3">
            {view.energy.map((e) => (
              <TileBox
                key={e.labelKey}
                label={t(`area.stats.${e.labelKey}`)}
                value={`${fmt.grouped(e.value)} ${e.unit === 'm3' ? 'm³' : 'kWh'}`}
              />
            ))}
          </View>
        </StatCard>
      ) : null}

      <StatCard
        title={t('area.stats.districtHeatingTitle')}
        hint={t('area.stats.districtHeatingHint')}>
        {view.districtHeating != null ? (
          <Text className="text-2xl font-bold text-neutral-900 dark:text-white">
            {`${Math.round(view.districtHeating)}%`}
          </Text>
        ) : (
          <MissingState />
        )}
      </StatCard>
    </View>
  );
}
