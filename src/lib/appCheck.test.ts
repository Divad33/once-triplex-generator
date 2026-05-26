import { describe, it, expect, vi, beforeEach } from 'vitest';

const isNativePlatformMock = vi.fn();
const initializeMock = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatformMock(),
  },
}));

vi.mock('@capacitor-firebase/app-check', () => ({
  FirebaseAppCheck: {
    initialize: (...args: unknown[]) => initializeMock(...args),
  },
}));

describe('initAppCheck', () => {
  beforeEach(() => {
    vi.resetModules();
    isNativePlatformMock.mockReset();
    initializeMock.mockReset();
  });

  it('does nothing on web platform', async () => {
    isNativePlatformMock.mockReturnValue(false);
    const { initAppCheck } = await import('./appCheck');

    await initAppCheck();

    expect(initializeMock).not.toHaveBeenCalled();
  });

  it('initializes FirebaseAppCheck once on native platform', async () => {
    isNativePlatformMock.mockReturnValue(true);
    initializeMock.mockResolvedValue(undefined);
    const { initAppCheck } = await import('./appCheck');

    await initAppCheck();
    await initAppCheck();

    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(initializeMock).toHaveBeenCalledWith({ isTokenAutoRefreshEnabled: true });
  });

  it('does not throw if FirebaseAppCheck.initialize rejects', async () => {
    isNativePlatformMock.mockReturnValue(true);
    initializeMock.mockRejectedValue(new Error('boom'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { initAppCheck } = await import('./appCheck');

    await expect(initAppCheck()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
