import { render, waitFor } from '@testing-library/react-native';
import { usePathname, useSegments } from 'expo-router';

import { trackPageview } from '@/lib/analytics/client';
import { useScreenView } from '@/lib/analytics/use-screen-view';

// Mock the event client so we observe the hook's calls without touching config
// or the network; segmentsToPattern (a separate module) stays real.
jest.mock('@/lib/analytics/client');

const mockedUseSegments = useSegments as unknown as jest.Mock;
const mockedUsePathname = usePathname as unknown as jest.Mock;
const mockTrackPageview = trackPageview as jest.Mock;

function Probe() {
  useScreenView();
  return null;
}

describe('useScreenView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tracks a pageview with the route pattern (not a concrete id)', async () => {
    mockedUseSegments.mockReturnValue(['listing', '[id]']);
    mockedUsePathname.mockReturnValue('/listing/123');
    await render(<Probe />);
    await waitFor(() => expect(mockTrackPageview).toHaveBeenCalledWith('/listing/:id'));
    expect(mockTrackPageview).toHaveBeenCalledTimes(1);
  });

  it('does not track before the navigator has mounted (no segments)', async () => {
    mockedUseSegments.mockReturnValue([]);
    mockedUsePathname.mockReturnValue('');
    await render(<Probe />);
    await waitFor(() => expect(mockedUseSegments).toHaveBeenCalled());
    expect(mockTrackPageview).not.toHaveBeenCalled();
  });

  it('tracks both pageviews when navigating listing A → listing B', async () => {
    mockedUseSegments.mockReturnValue(['listing', '[id]']);
    mockedUsePathname.mockReturnValue('/listing/111');
    const { rerender } = await render(<Probe />);

    await waitFor(() => expect(mockTrackPageview).toHaveBeenCalledTimes(1));

    mockedUsePathname.mockReturnValue('/listing/222');
    await rerender(<Probe />);
    await waitFor(() => expect(mockTrackPageview).toHaveBeenCalledTimes(2));
    expect(mockTrackPageview).toHaveBeenNthCalledWith(1, '/listing/:id');
    expect(mockTrackPageview).toHaveBeenNthCalledWith(2, '/listing/:id');
  });
});
