/* eslint-disable @typescript-eslint/no-require-imports */

// --- RNTL custom matchers (toBeOnTheScreen, toHaveTextContent, etc.) ---
require('@testing-library/react-native/dist/matchers/extend-expect');

// --- expo-router mocks ---
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockDismissAll = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: mockPush, replace: mockReplace, back: mockBack, dismissAll: mockDismissAll },
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      back: mockBack,
      dismissAll: mockDismissAll,
    }),
    useLocalSearchParams: jest.fn(() => ({})),
    useGlobalSearchParams: jest.fn(() => ({})),
    useNavigation: () => ({ setOptions: jest.fn() }),
    Link: ({ children }: { children: React.ReactNode }) => children,
    Stack: Object.assign(
      ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
      { Screen: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children) },
    ),
    Tabs: Object.assign(
      ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
      { Screen: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children) },
    ),
    DarkTheme: { dark: true, colors: { primary: '#fff', background: '#000', card: '#000', text: '#fff', border: '#333', notification: '#f00' } },
    DefaultTheme: { dark: false, colors: { primary: '#000', background: '#fff', card: '#fff', text: '#000', border: '#ccc', notification: '#f00' } },
    ThemeProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  };
});

// --- expo-image mock ---
jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Image: (props: any) => React.createElement(View, { testID: 'expo-image', ...props }),
  };
});

// --- expo-web-browser mock ---
const mockOpenBrowserAsync = jest.fn();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: mockOpenBrowserAsync,
}));

// --- expo-splash-screen mock ---
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

// --- expo-constants mock ---
// The About screen reads the app version from `Constants.expoConfig`; pin it so
// the rendered version is deterministic in tests.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0' } },
}));

// --- AsyncStorage mock ---
// The native module is null under Jest, so use the library's in-memory mock.
// Screens reach it through `lib/storage` (appearance, recent views, area cache).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// --- expo-secure-store mock (in-memory) ---
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

// --- react-native-safe-area-context mock ---
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) => React.createElement(View, props, children),
    SafeAreaProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// --- react-native-reanimated mock ---
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// --- react-native-gesture-handler mock ---
// Gesture builders (`Gesture.Pan()` …) run during render, so they must be
// chainable; the view wrappers render as plain Views passing children through.
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View, ScrollView } = require('react-native');
  const makeGesture = () => {
    const gesture: Record<string, () => unknown> = {};
    const chain = () => gesture;
    for (const method of [
      'onStart',
      'onUpdate',
      'onEnd',
      'onBegin',
      'onFinalize',
      'enabled',
      'simultaneousWithExternalGesture',
      'requireExternalGestureToFail',
    ]) {
      gesture[method] = chain;
    }
    return gesture;
  };
  return {
    GestureHandlerRootView: ({ children, ...props }: any) =>
      React.createElement(View, props, children),
    GestureDetector: ({ children }: any) => children,
    Gesture: { Pan: makeGesture, Native: makeGesture, Tap: makeGesture },
    ScrollView,
  };
});

// --- MapLibre mock ---
jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Map: ({ children, ...props }: any) => React.createElement(View, { testID: 'maplibre-map', ...props }, children),
    Camera: () => null,
    Marker: ({ children }: any) => children,
    GeoJSONSource: ({ children }: any) => children,
    Layer: () => null,
  };
});

// --- NativeWind mock ---
jest.mock('nativewind', () => ({
  styled: (component: any) => component,
  useColorScheme: () => ({ colorScheme: 'light', toggleColorScheme: jest.fn() }),
  // Imperative API used by `lib/appearance` to drive `dark:` classes.
  colorScheme: { set: jest.fn(), get: jest.fn(() => 'light'), toggle: jest.fn() },
}));

// --- Animated icon mock (avoid Reanimated complexity) ---
jest.mock('@/components/animated-icon', () => ({
  AnimatedSplashOverlay: () => null,
}));

// --- react-native-svg mock (render plain views for SVG icon primitives) ---
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const stub = (name: string) => (props: any) =>
    React.createElement(View, { testID: name, ...props }, props.children);
  return {
    __esModule: true,
    default: stub('svg'),
    Svg: stub('svg'),
    Circle: stub('circle'),
    Path: stub('path'),
    Rect: stub('rect'),
  };
});

// Export mocks for use in tests
export { mockPush, mockReplace, mockBack, mockDismissAll, mockOpenBrowserAsync };
