import { useTranslation } from '@realty/i18n';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-100 dark:bg-black">
      <View className="px-4 pb-2 pt-2">
        <Text className="text-2xl font-bold text-neutral-900 dark:text-white">
          {t('profile.title')}
        </Text>
        <Text className="text-sm text-neutral-500">{t('profile.subtitle')}</Text>
      </View>
    </SafeAreaView>
  );
}
