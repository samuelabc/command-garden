// src/background/service-worker-logic.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initFromStorage, handleSetEnabled, buildStatusResponse } from './service-worker-logic.js';

const mockStorage: Record<string, unknown> = {};
const mockGet = vi.fn((keys: string | string[], cb: (result: Record<string, unknown>) => void) => {
  const result: Record<string, unknown> = {};
  const keyList = typeof keys === 'string' ? [keys] : keys;
  for (const k of keyList) {
    if (k in mockStorage) result[k] = mockStorage[k];
  }
  cb(result);
});
const mockSet = vi.fn((items: Record<string, unknown>, cb?: () => void) => {
  Object.assign(mockStorage, items);
  cb?.();
});

const mockClient = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  isConnected: vi.fn(() => false),
  waitConnected: vi.fn(() => Promise.resolve(false)),
};

function resetStorage() {
  for (const k of Object.keys(mockStorage)) delete mockStorage[k];
}

describe('initFromStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStorage();
  });

  it('connects when storage has enabled=true', () => {
    mockStorage['enabled'] = true;
    initFromStorage(mockGet as any, mockClient);
    expect(mockClient.connect).toHaveBeenCalled();
  });

  it('connects when storage has no enabled key (defaults true)', () => {
    initFromStorage(mockGet as any, mockClient);
    expect(mockClient.connect).toHaveBeenCalled();
  });

  it('does not connect when storage has enabled=false', () => {
    mockStorage['enabled'] = false;
    initFromStorage(mockGet as any, mockClient);
    expect(mockClient.connect).not.toHaveBeenCalled();
  });
});

describe('handleSetEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStorage();
  });

  it('disconnects and persists when set to false', async () => {
    const sendResponse = vi.fn();
    mockClient.isConnected.mockReturnValue(false);
    await handleSetEnabled(false, mockClient, mockSet as any, sendResponse);
    expect(mockClient.disconnect).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({ enabled: false }, expect.any(Function));
  });

  it('connects and persists when set to true', async () => {
    const sendResponse = vi.fn();
    mockClient.isConnected.mockReturnValue(false);
    mockClient.waitConnected.mockResolvedValue(true);
    await handleSetEnabled(true, mockClient, mockSet as any, sendResponse);
    expect(mockClient.connect).toHaveBeenCalled();
    expect(mockClient.waitConnected).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({ enabled: true }, expect.any(Function));
  });

  it('responds with enabled and connected status', async () => {
    const sendResponse = vi.fn();
    mockClient.isConnected.mockReturnValue(true);
    mockClient.waitConnected.mockResolvedValue(true);
    await handleSetEnabled(true, mockClient, mockSet as any, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, connected: true }),
    );
  });
});

describe('buildStatusResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStorage();
  });

  it('includes enabled from storage and connected from client', async () => {
    mockStorage['enabled'] = true;
    mockClient.isConnected.mockReturnValue(true);
    mockClient.waitConnected.mockResolvedValue(true);
    const sendResponse = vi.fn();
    await buildStatusResponse(mockClient, mockGet as any, [], sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({
      enabled: true,
      connected: true,
      recentActivity: [],
    });
  });

  it('defaults enabled to true when not in storage', async () => {
    mockClient.isConnected.mockReturnValue(false);
    mockClient.waitConnected.mockResolvedValue(false);
    const sendResponse = vi.fn();
    await buildStatusResponse(mockClient, mockGet as any, [], sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({
      enabled: true,
      connected: false,
      recentActivity: [],
    });
  });
});
