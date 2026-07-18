import { useTranslation } from '@realty/i18n';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useColorScheme } from '@/hooks/use-color-scheme';

const STROKE = { strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Lucide-style "check-circle" — the success mark shown after deletion. */
function CheckCircleIcon({ size = 44, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke={color} {...STROKE} />
      <Path d="m22 4-10 10.01-3-3" stroke={color} {...STROKE} />
    </Svg>
  );
}

/**
 * Terminal confirmation shown after a successful account deletion. By this point
 * the session is already torn down, so the screen needs no auth and offers a
 * single way forward — back to the map — to keep browsing as a guest. Registered
 * with no header and no back gesture (see `_layout.tsx`): the screen it replaced
 * (`settings/delete-account`) is now inert, so there's nothing to go back to.
 */
export default function AccountDeletedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const scheme = useColorScheme();

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-neutral-100 dark:bg-black">
      <View className="flex-1 items-center justify-center gap-5 px-8">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
          <CheckCircleIcon size={44} color={scheme === 'dark' ? '#4ade80' : '#16a34a'} />
        </View>
        <Text className="text-center text-2xl font-bold text-neutral-900 dark:text-white">
          {t('deleteAccountPage.successTitle')}
        </Text>
        <Text className="text-center text-base leading-6 text-neutral-500">
          {t('deleteAccountPage.successSubtitle')}
        </Text>
      </View>

      <View className="px-6 pb-6">
        <Pressable
          testID="account-deleted-continue"
          onPress={() => router.replace('/')}
          accessibilityRole="button"
          className="items-center rounded-full bg-blue-600 py-4 active:opacity-80">
          <Text className="text-base font-semibold text-white">
            {t('deleteAccountPage.successCta')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
