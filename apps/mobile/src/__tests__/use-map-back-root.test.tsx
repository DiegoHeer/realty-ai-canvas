import { renderHook } from '@testing-library/react-native';
import { BackHandler, Platform } from 'react-native';

import { useMapBackRoot } from '@/hooks/use-map-back-root';

import { mockNavigate, mockUsePathname } from '../../test-setup';

type BackPressHandler = () => boolean;

// Capture what the hook registers so tests can fire the back press themselves.
const addListener = jest.spyOn(BackHandler, 'addEventListener');

function registeredHandler(): BackPressHandler | undefined {
  return addListener.mock.calls.at(-1)?.[1] as BackPressHandler | undefined;
}

describe('useMapBackRoot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  it('sends the back press on a non-map tab to the map', async () => {
    mockUsePathname.mockReturnValue('/explore');
    await renderHook(() => useMapBackRoot());

    const handler = registeredHandler();
    expect(handler).toBeDefined();
    expect(handler!()).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('covers the profile tab too', async () => {
    mockUsePathname.mockReturnValue('/profile');
    await renderHook(() => useMapBackRoot());

    expect(registeredHandler()).toBeDefined();
  });

  it('leaves the back press alone on the map itself', async () => {
    mockUsePathname.mockReturnValue('/');
    await renderHook(() => useMapBackRoot());

    expect(addListener).not.toHaveBeenCalled();
  });

  it('leaves the back press alone on pushed stack screens', async () => {
    mockUsePathname.mockReturnValue('/listing/abc123');
    await renderHook(() => useMapBackRoot());

    expect(addListener).not.toHaveBeenCalled();
  });

  it('does nothing on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockUsePathname.mockReturnValue('/explore');
    await renderHook(() => useMapBackRoot());

    expect(addListener).not.toHaveBeenCalled();
  });

  it('unregisters when the route moves off a re-rooted tab', async () => {
    mockUsePathname.mockReturnValue('/explore');
    const removeSpy = jest.fn();
    addListener.mockReturnValueOnce({ remove: removeSpy });
    const { rerender } = await renderHook(() => useMapBackRoot());

    mockUsePathname.mockReturnValue('/');
    await rerender(undefined);

    expect(removeSpy).toHaveBeenCalled();
  });
});
