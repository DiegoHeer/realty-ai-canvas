describe('AUTH_ENABLED', () => {
  const original = process.env.EXPO_PUBLIC_AUTH_ENABLED;
  afterEach(() => {
    process.env.EXPO_PUBLIC_AUTH_ENABLED = original;
    jest.resetModules();
  });

  it('is true only when the env var is exactly "true"', () => {
    process.env.EXPO_PUBLIC_AUTH_ENABLED = 'true';
    jest.resetModules();
    expect(require('../env').AUTH_ENABLED).toBe(true);
  });

  it('is false when unset', () => {
    delete process.env.EXPO_PUBLIC_AUTH_ENABLED;
    jest.resetModules();
    expect(require('../env').AUTH_ENABLED).toBe(false);
  });
});
