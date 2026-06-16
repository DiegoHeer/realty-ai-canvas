/* eslint-disable @typescript-eslint/no-require-imports */

// --- RNTL custom matchers (toBeOnTheScreen, toHaveTextContent, etc.) ---
require('@testing-library/react-native/dist/matchers/extend-expect');

// --- expo-router mocks ---
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: mockPush, replace: mockReplace, back: mockBack },
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
    useLocalSearchParams: jest.fn(() => ({})),
    useGlobalSearchParams: jest.fn(() => ({})),
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
}));

// --- Animated icon mock (avoid Reanimated complexity) ---
jest.mock('@/components/animated-icon', () => ({
  AnimatedSplashOverlay: () => null,
}));

// --- expo-symbols mock (avoid loading the Material icon font in tests) ---
jest.mock('expo-symbols', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SymbolView: (props: any) => React.createElement(View, { testID: 'symbol-view', ...props }),
  };
});

// Export mocks for use in tests
export { mockPush, mockReplace, mockBack, mockOpenBrowserAsync };
