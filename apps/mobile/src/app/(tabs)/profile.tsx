import { useTranslation } from '@realty/i18n';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { type ReactElement, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useAuth, type AuthUser } from '@/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppearance } from '@/lib/appearance';
import { activeLanguage, APPEARANCE_OPTIONS, LANGUAGE_LABELS } from '@/lib/settings-options';

interface IconProps {
  size?: number;
  color: string;
}

// Shared stroke styling so every settings icon keeps Feather/Lucide proportions.
const STROKE = { strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/**
 * Feather/Lucide-style stroked icons for the settings rows, drawn as SVG so they
 * render identically across web/iOS/Android without depending on an icon font —
 * mirrors the icon approach in `components/filter-pills.tsx`.
 */
function StrokeSvg({ size = 22, children }: { size?: number; children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
    </Svg>
  );
}

function BellIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke={color} {...STROKE} />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={color} {...STROKE} />
    </StrokeSvg>
  );
}

function HeartIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"
        stroke={color}
        {...STROKE}
      />
    </StrokeSvg>
  );
}

function SearchIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" stroke={color} {...STROKE} />
      <Path d="M21 21l-4.35-4.35" stroke={color} {...STROKE} />
    </StrokeSvg>
  );
}

function CreditCardIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M22 7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7z"
        stroke={color}
        {...STROKE}
      />
      <Path d="M2 10h20" stroke={color} {...STROKE} />
    </StrokeSvg>
  );
}

function LockIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z"
        stroke={color}
        {...STROKE}
      />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={color} {...STROKE} />
    </StrokeSvg>
  );
}

function HelpIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" stroke={color} {...STROKE} />
      <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke={color} {...STROKE} />
      <Path d="M12 17h.01" stroke={color} {...STROKE} />
    </StrokeSvg>
  );
}

function InfoIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" stroke={color} {...STROKE} />
      <Path d="M12 16v-4" stroke={color} {...STROKE} />
      <Path d="M12 8h.01" stroke={color} {...STROKE} />
    </StrokeSvg>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user, isAuthenticated, signOut } = useAuth();

  // Signing out is destructive (it drops back to the guest state), so confirm
  // with a native dialog instead of acting on the first tap.
  function confirmSignOut() {
    Alert.alert(t('profile.signOutConfirmTitle'), t('profile.signOutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.signOut'), style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-100 dark:bg-black">
      <View className="px-4 pb-2 pt-2">
        <Text className="text-2xl font-bold text-neutral-900 dark:text-white">
          {t('profile.title')}
        </Text>
        <Text className="text-sm text-neutral-500">{t('profile.subtitle')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 128, gap: 16 }}
        showsVerticalScrollIndicator={false}>
        {isAuthenticated && user ? <IdentityCard user={user} /> : <GuestCard />}

        <PreferencesCard />

        <AccountCard />

        <SupportCard />

        {isAuthenticated && (
          <Pressable
            onPress={confirmSignOut}
            accessibilityRole="button"
            className="items-center rounded-2xl bg-white py-3 shadow-sm active:opacity-70 dark:bg-neutral-900">
            <Text className="text-base font-semibold text-red-600 dark:text-red-400">
              {t('profile.signOut')}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function IdentityCard({ user }: { user: AuthUser }) {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <Avatar user={user} />
      <View className="flex-1">
        <Text className="text-lg font-semibold text-neutral-900 dark:text-white">{user.name}</Text>
        <Text numberOfLines={1} className="text-sm text-neutral-500">
          {user.email}
        </Text>
      </View>
    </View>
  );
}

function GuestCard() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View className="gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <Text className="text-lg font-semibold text-neutral-900 dark:text-white">
        {t('profile.guestTitle')}
      </Text>
      <Text className="text-sm text-neutral-500">{t('profile.guestSubtitle')}</Text>
      <View className="mt-1 flex-row gap-3">
        <Pressable
          onPress={() => router.push('/auth/login')}
          accessibilityRole="button"
          className="flex-1 items-center rounded-xl bg-blue-600 py-3 active:opacity-80">
          <Text className="text-base font-semibold text-white">{t('profile.logIn')}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/auth/register')}
          accessibilityRole="button"
          className="flex-1 items-center rounded-xl border border-neutral-300 py-3 active:opacity-60 dark:border-neutral-700">
          <Text className="text-base font-semibold text-neutral-900 dark:text-white">
            {t('profile.register')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function PreferencesCard() {
  const { t } = useTranslation();

  return (
    <View className="gap-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {t('profile.preferences')}
      </Text>

      <LanguageField />
      <AppearanceField />
    </View>
  );
}

/**
 * Account section — a card of navigational rows. These are placeholders for now:
 * each row is a tappable target without a destination wired up yet.
 */
function AccountCard() {
  const { t } = useTranslation();

  return (
    <View className="gap-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {t('profile.account')}
      </Text>

      <MenuRow icon={BellIcon} label={t('profile.notifications')} />
      <MenuRow icon={HeartIcon} label={t('profile.savedHomes')} />
      <MenuRow icon={SearchIcon} label={t('profile.savedSearches')} />
      <MenuRow icon={CreditCardIcon} label={t('profile.paymentMethods')} />
    </View>
  );
}

/**
 * Support section — a card of navigational rows. Placeholders, like {@link AccountCard}.
 */
function SupportCard() {
  const { t } = useTranslation();

  return (
    <View className="gap-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {t('profile.support')}
      </Text>

      <MenuRow icon={LockIcon} label={t('profile.privacy')} />
      <MenuRow icon={HelpIcon} label={t('profile.help')} />
      <MenuRow icon={InfoIcon} label={t('profile.about')} />
    </View>
  );
}

/**
 * A tappable settings row: leading stroked SVG icon, label, and a trailing
 * chevron. `onPress` is optional — without it the row is a visual placeholder
 * that still gives press feedback, matching the dummy entries on the profile
 * screen.
 */
function MenuRow({
  icon: Icon,
  label,
  onPress,
}: {
  icon: (props: IconProps) => ReactElement;
  label: string;
  onPress?: () => void;
}) {
  const scheme = useColorScheme();
  // Match the row label: neutral-900 in light, white in dark.
  const iconColor = scheme === 'dark' ? '#ffffff' : '#171717';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center justify-between py-3 active:opacity-60">
      <View className="flex-row items-center gap-3">
        <Icon color={iconColor} />
        <Text className="text-lg text-neutral-900 dark:text-white">{label}</Text>
      </View>
      <Text className="text-xl text-neutral-400">›</Text>
    </Pressable>
  );
}

/**
 * Language selector row: shows the active language and opens a full-screen
 * selection page (`app/settings/language.tsx`) on press.
 */
function LanguageField() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push('/settings/language')}
      accessibilityRole="button"
      className="flex-row items-center justify-between py-3 active:opacity-60">
      <Text className="text-lg text-neutral-900 dark:text-white">{t('profile.language')}</Text>
      <View className="flex-row items-center gap-1.5">
        <Text className="text-lg text-neutral-500">{LANGUAGE_LABELS[activeLanguage(i18n)]}</Text>
        <Text className="text-xl text-neutral-400">›</Text>
      </View>
    </Pressable>
  );
}

/**
 * Appearance selector row: shows the active appearance and opens a full-screen
 * selection page (`app/settings/appearance.tsx`) on press.
 */
function AppearanceField() {
  const { t } = useTranslation();
  const router = useRouter();
  const { appearance } = useAppearance();

  const active = APPEARANCE_OPTIONS.find((entry) => entry.value === appearance)!;

  return (
    <Pressable
      onPress={() => router.push('/settings/appearance')}
      accessibilityRole="button"
      className="flex-row items-center justify-between py-3 active:opacity-60">
      <Text className="text-lg text-neutral-900 dark:text-white">{t('profile.appearance')}</Text>
      <View className="flex-row items-center gap-1.5">
        <Text className="text-lg text-neutral-500">{`${active.emoji} ${t(active.labelKey)}`}</Text>
        <Text className="text-xl text-neutral-400">›</Text>
      </View>
    </Pressable>
  );
}

function Avatar({ user }: { user: AuthUser }) {
  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (user.avatarUrl) {
    return (
      <Image
        source={{ uri: user.avatarUrl }}
        style={{ width: 56, height: 56, borderRadius: 28 }}
        contentFit="cover"
      />
    );
  }

  return (
    <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
      <Text className="text-lg font-semibold text-blue-700 dark:text-blue-200">{initials}</Text>
    </View>
  );
}
