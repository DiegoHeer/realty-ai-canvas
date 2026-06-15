import { BottomSheet, Row, Text as NativeText } from '@expo/ui';
import { supportedLanguages, useTranslation, type SupportedLanguage } from '@realty/i18n';
import { Image } from 'expo-image';
import { useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth, type AuthUser } from '@/hooks/use-auth';
import { useAppearance, type Appearance } from '@/lib/appearance';
import { FILL_WIDTH } from '@/lib/sheet-modifiers';

/**
 * Endonyms (each language named in itself) with a flag emoji. Not translated —
 * a language switcher always shows every option in its own language. The
 * `Record` forces a label whenever a new language is added to `supportedLanguages`.
 */
const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: '🇬🇧 English',
  nl: '🇳🇱 Nederlands',
  pt: '🇵🇹 Português',
};

/** Appearance options for the modal picker. `labelKey` is translated; `emoji` is decoration. */
const APPEARANCE_OPTIONS: { value: Appearance; emoji: string; labelKey: string }[] = [
  { value: 'system', emoji: '⚙️', labelKey: 'profile.appearance_system' },
  { value: 'light', emoji: '☀️', labelKey: 'profile.appearance_light' },
  { value: 'dark', emoji: '🌙', labelKey: 'profile.appearance_dark' },
];

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user, isAuthenticated, signIn, signOut } = useAuth();

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
        {isAuthenticated && user ? <IdentityCard user={user} /> : <GuestCard onSignIn={signIn} />}

        <PreferencesCard />

        <AccountCard />

        <SupportCard />

        {isAuthenticated && (
          <Pressable
            onPress={signOut}
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

function GuestCard({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <Text className="text-lg font-semibold text-neutral-900 dark:text-white">
        {t('profile.guestTitle')}
      </Text>
      <Text className="text-sm text-neutral-500">{t('profile.guestSubtitle')}</Text>
      <View className="mt-1 flex-row gap-3">
        <Pressable
          onPress={onSignIn}
          className="flex-1 items-center rounded-xl bg-blue-600 py-3 active:opacity-80">
          <Text className="text-base font-semibold text-white">{t('profile.logIn')}</Text>
        </Pressable>
        <Pressable
          onPress={onSignIn}
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

      <MenuRow emoji="🔔" label={t('profile.notifications')} />
      <MenuRow emoji="❤️" label={t('profile.savedHomes')} />
      <MenuRow emoji="🔍" label={t('profile.savedSearches')} />
      <MenuRow emoji="💳" label={t('profile.paymentMethods')} />
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

      <MenuRow emoji="🔒" label={t('profile.privacy')} />
      <MenuRow emoji="❓" label={t('profile.help')} />
      <MenuRow emoji="ℹ️" label={t('profile.about')} />
    </View>
  );
}

/**
 * A tappable settings row: leading emoji icon, label, and a trailing chevron.
 * `onPress` is optional — without it the row is a visual placeholder that still
 * gives press feedback, matching the dummy entries on the profile screen.
 */
function MenuRow({ emoji, label, onPress }: { emoji: string; label: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center justify-between py-3 active:opacity-60">
      <View className="flex-row items-center gap-3">
        <Text className="text-2xl">{emoji}</Text>
        <Text className="text-lg text-neutral-900 dark:text-white">{label}</Text>
      </View>
      <Text className="text-xl text-neutral-400">›</Text>
    </Pressable>
  );
}

/**
 * A single tappable row inside a picker sheet. Built from `@expo/ui`'s native
 * `Row` + `Text` (not `ListItem`) so we control the vertical padding for a
 * roomier touch target. `NativeText` themes itself from the active color scheme
 * (black in light, white in dark), so labels always contrast with the sheet.
 * The active option gets a checkmark appended to its label — a trailing element
 * can't be used because native `Text` and RN `Text` differ across platforms,
 * but an appended string renders correctly everywhere.
 */
function SheetOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Row
      onPress={onPress}
      alignment="center"
      style={{ paddingVertical: 18, paddingHorizontal: 12 }}
      modifiers={FILL_WIDTH as ComponentProps<typeof Row>['modifiers']}>
      <NativeText>{selected ? `${label}  ✓` : label}</NativeText>
    </Row>
  );
}

/**
 * Language selector: a row that opens a native modal list picker. The sheet is
 * `@expo/ui`'s `BottomSheet` (SwiftUI sheet on iOS, Material 3 modal sheet on
 * Android, vaul drawer on web).
 */
function LanguageField() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const activeLanguage = (
    supportedLanguages.includes(i18n.language as SupportedLanguage)
      ? i18n.language
      : i18n.resolvedLanguage
  ) as SupportedLanguage;

  function select(language: SupportedLanguage) {
    void i18n.changeLanguage(language);
    setOpen(false);
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        className="flex-row items-center justify-between py-3 active:opacity-60">
        <Text className="text-lg text-neutral-900 dark:text-white">{t('profile.language')}</Text>
        <View className="flex-row items-center gap-1.5">
          <Text className="text-lg text-neutral-500">{LANGUAGE_LABELS[activeLanguage]}</Text>
          <Text className="text-xl text-neutral-400">›</Text>
        </View>
      </Pressable>

      <BottomSheet isPresented={open} onDismiss={() => setOpen(false)}>
        {supportedLanguages.map((lng) => (
          <SheetOption
            key={lng}
            label={LANGUAGE_LABELS[lng]}
            selected={lng === activeLanguage}
            onPress={() => select(lng)}
          />
        ))}
      </BottomSheet>
    </>
  );
}

/**
 * Appearance selector: same native modal-list pattern as {@link LanguageField}.
 * Each pick is written to two places so the whole app stays in one theme:
 *   - NativeWind's `setColorScheme` drives every `dark:` class (the GUI).
 *   - RN's `Appearance.setColorScheme` drives the native color scheme, which
 *     themes the `@expo/ui` sheet (including its drag handle), native text, and
 *     the expo-router Stack — they'd otherwise stay on the system theme and
 *     clash with a manual override.
 */
function AppearanceField() {
  const { t } = useTranslation();
  const { appearance, setAppearance } = useAppearance();
  const [open, setOpen] = useState(false);

  function select(next: Appearance) {
    setAppearance(next);
    setOpen(false);
  }

  const label = (value: Appearance) => {
    const option = APPEARANCE_OPTIONS.find((entry) => entry.value === value)!;
    return `${option.emoji} ${t(option.labelKey)}`;
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        className="flex-row items-center justify-between py-3 active:opacity-60">
        <Text className="text-lg text-neutral-900 dark:text-white">
          {t('profile.appearance')}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Text className="text-lg text-neutral-500">{label(appearance)}</Text>
          <Text className="text-xl text-neutral-400">›</Text>
        </View>
      </Pressable>

      <BottomSheet isPresented={open} onDismiss={() => setOpen(false)}>
        {APPEARANCE_OPTIONS.map((option) => (
          <SheetOption
            key={option.value}
            label={label(option.value)}
            selected={option.value === appearance}
            onPress={() => select(option.value)}
          />
        ))}
      </BottomSheet>
    </>
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
