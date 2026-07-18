import { useTranslation } from '@realty/i18n';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { type ReactElement, type ReactNode } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useAuth, type AuthUser } from '@/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppearance } from '@/lib/appearance';
import { resetOnboarding } from '@/lib/onboarding';
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

function MapIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4m0 13V4m0 0L9 7"
        stroke={color}
        {...STROKE}
      />
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

function ReplayIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path d="M3 12a9 9 0 1 0 2.5-6.25" stroke={color} {...STROKE} />
      <Path d="M3 3v4h4" stroke={color} {...STROKE} />
    </StrokeSvg>
  );
}

function FileTextIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke={color}
        {...STROKE}
      />
      <Path d="M14 2v6h6" stroke={color} {...STROKE} />
      <Path d="M16 13H8" stroke={color} {...STROKE} />
      <Path d="M16 17H8" stroke={color} {...STROKE} />
    </StrokeSvg>
  );
}

function MessageIcon({ size, color }: IconProps) {
  return (
    <StrokeSvg size={size}>
      <Path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        stroke={color}
        {...STROKE}
      />
    </StrokeSvg>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user, isAuthenticated, signOut } = useAuth();

  // Signing out is destructive (it drops back to the guest state), so confirm
  // instead of acting on the first tap. react-native-web's Alert.alert is a
  // no-op (it never renders), so on web we fall back to the browser's native
  // confirm dialog; native keeps the OS Alert.
  function confirmSignOut() {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `${t('profile.signOutConfirmTitle')}\n\n${t('profile.signOutConfirmMessage')}`,
      );
      if (confirmed) void signOut();
      return;
    }
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
 * Account section — a card of navigational rows that push their settings pages.
 */
function AccountCard() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View className="gap-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {t('profile.account')}
      </Text>

      <MenuRow
        icon={BellIcon}
        label={t('profile.notifications')}
        onPress={() => router.push('/settings/notifications')}
      />
      <MenuRow
        icon={CreditCardIcon}
        label={t('profile.subscription')}
        onPress={() => router.push('/settings/subscription')}
      />
      <MenuRow
        icon={MapIcon}
        label={t('profile.map')}
        onPress={() => router.push('/settings/map')}
      />
    </View>
  );
}

/**
 * Support section — a card of navigational rows that push their settings pages.
 */
function SupportCard() {
  const { t } = useTranslation();
  const router = useRouter();

  // Re-arm the tour and jump straight into it. On native the root-layout gate
  // would redirect on its own once the status flips, but navigating explicitly
  // keeps it instant and also works on web (where the gate is disabled).
  function replayIntro() {
    resetOnboarding();
    router.replace('/onboarding');
  }

  return (
    <View className="gap-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {t('profile.support')}
      </Text>

      <MenuRow
        icon={LockIcon}
        label={t('profile.privacy')}
        onPress={() => router.push('/settings/privacy')}
      />
      <MenuRow
        icon={FileTextIcon}
        label={t('privacyPolicyPage.title')}
        onPress={() => router.push('/settings/legal/privacy-policy')}
      />
      <MenuRow
        icon={FileTextIcon}
        label={t('termsOfUsePage.title')}
        onPress={() => router.push('/settings/legal/terms-of-use')}
      />
      <MenuRow
        icon={HelpIcon}
        label={t('profile.help')}
        onPress={() => router.push('/settings/help')}
      />
      <MenuRow
        icon={MessageIcon}
        label={t('feedback.title')}
        onPress={() => router.push('/settings/feedback')}
      />
      <MenuRow
        icon={InfoIcon}
        label={t('profile.about')}
        onPress={() => router.push('/settings/about')}
      />
      <MenuRow icon={ReplayIcon} label={t('onboarding.replay')} onPress={replayIntro} />
    </View>
  );
}

/**
 * A tappable settings row: leading stroked SVG icon, label, and a trailing
 * chevron. `onPress` is optional — without it the row is inert but still gives
 * press feedback.
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
