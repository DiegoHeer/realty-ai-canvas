import { type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

/**
 * Presentational primitives shared by the text-based settings pages (Privacy,
 * About, Help). They mirror the card styling used across the profile screen so
 * the pushed pages feel like the same surface — a neutral page background with
 * grouped white cards.
 */

/** Scrollable page container with the standard settings background + padding. */
export function SettingsContentScreen({ children }: { children: ReactNode }) {
  return (
    <View className="flex-1 bg-neutral-100 dark:bg-black">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

/** A grouped white card; the optional `title` renders as a heading above the body. */
export function InfoCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View className="gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      {title ? (
        <Text className="text-lg font-semibold text-neutral-900 dark:text-white">{title}</Text>
      ) : null}
      {children}
    </View>
  );
}

/** Body paragraph with comfortable line height for longer copy. */
export function Paragraph({ children }: { children: ReactNode }) {
  return (
    <Text className="text-base leading-6 text-neutral-600 dark:text-neutral-300">{children}</Text>
  );
}

/**
 * Full-screen centered placeholder for pages whose feature isn't built yet
 * (Subscription, Notifications). Keeps the row tappable with a real destination
 * instead of a dead end.
 */
export function ComingSoon({ message }: { message: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-neutral-100 px-10 dark:bg-black">
      <Text className="text-center text-lg text-neutral-500 dark:text-neutral-400">{message}</Text>
    </View>
  );
}
