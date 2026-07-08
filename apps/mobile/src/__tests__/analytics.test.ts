import { isOptedOut, setOptedOut } from '@/lib/analytics/opt-out';

describe('analytics opt-out store', () => {
  beforeEach(() => {
    // Reset the module-level store so test order doesn't matter.
    setOptedOut(false);
  });

  it('defaults to not opted out', () => {
    expect(isOptedOut()).toBe(false);
  });

  it('reflects opting out and back in', () => {
    setOptedOut(true);
    expect(isOptedOut()).toBe(true);
    setOptedOut(false);
    expect(isOptedOut()).toBe(false);
  });
});
