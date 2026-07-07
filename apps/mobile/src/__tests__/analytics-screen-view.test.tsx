import { render, waitFor } from '@testing-library/react-native';
import { useSegments } from 'expo-router';

import { trackPageview } from '@/lib/analytics/client';
import { useScreenView } from '@/lib/analytics/use-screen-view';

// Mock the event client so we observe the hook's calls without touching config
// or the network; segmentsToPattern (a separate module) stays real.
jest.mock('@/lib/analytics/client');

const mockedUseSegments = useSegments as unknown as jest.Mock;
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
    render(<Probe />);
    await waitFor(() => expect(mockTrackPageview).toHaveBeenCalledWith('/listing/:id'));
    expect(mockTrackPageview).toHaveBeenCalledTimes(1);
    expect(mockedUseSegments).toHaveBeenCalled();
  });

  it('does not track before the navigator has mounted (no segments)', async () => {
    mockedUseSegments.mockReturnValue([]);
    render(<Probe />);
    await waitFor(() => expect(mockedUseSegments).toHaveBeenCalled());
    expect(mockTrackPageview).not.toHaveBeenCalled();
  });
});
