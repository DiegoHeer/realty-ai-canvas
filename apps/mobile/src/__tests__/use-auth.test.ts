import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { signOut, useAuth } from '@/hooks/use-auth';
import { StorageKeys } from '@/lib/storage';

async function storedSession() {
  const raw = await AsyncStorage.getItem(StorageKeys.session);
  return raw ? JSON.parse(raw) : null;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  signOut();
});

describe('useAuth', () => {
  it('starts signed out', async () => {
    const { result } = await renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('signs in with email, deriving a display name, and persists the session', async () => {
    const { result } = await renderHook(() => useAuth());

    await act(async () => {
      result.current.signInWithEmail('john.doe@example.com');
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual({ name: 'John Doe', email: 'john.doe@example.com' });
    await waitFor(async () =>
      expect(await storedSession()).toEqual({ name: 'John Doe', email: 'john.doe@example.com' }),
    );
  });

  it('registers with an explicit name/email, trimming whitespace', async () => {
    const { result } = await renderHook(() => useAuth());

    await act(async () => {
      result.current.registerWithEmail({ name: '  Alice Smith ', email: 'alice@example.com' });
    });

    expect(result.current.user).toEqual({ name: 'Alice Smith', email: 'alice@example.com' });
  });

  it('establishes provider-specific sessions for Google and Apple', async () => {
    const { result } = await renderHook(() => useAuth());

    await act(async () => {
      result.current.signInWithGoogle();
    });
    expect(result.current.user?.email).toBe('user@gmail.com');

    await act(async () => {
      result.current.signInWithApple();
    });
    expect(result.current.user?.email).toBe('user@privaterelay.appleid.com');
  });

  it('signs out, clearing the in-memory and persisted session', async () => {
    const { result } = await renderHook(() => useAuth());

    await act(async () => {
      result.current.signInWithEmail('jane@example.com');
    });
    await waitFor(async () => expect(await storedSession()).not.toBeNull());

    await act(async () => {
      result.current.signOut();
    });

    expect(result.current.user).toBeNull();
    await waitFor(async () => expect(await storedSession()).toBeNull());
  });
});
