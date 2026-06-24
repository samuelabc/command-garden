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

  it('disconnects and persists when set to false', () => {
    const sendResponse = vi.fn();
    mockClient.isConnected.mockReturnValue(false);
    handleSetEnabled(false, mockClient, mockSet as any, sendResponse);
    expect(mockClient.disconnect).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({ enabled: false }, expect.any(Function));
  });

  it('connects and persists when set to true', () => {
    const sendResponse = vi.fn();
    mockClient.isConnected.mockReturnValue(false);
    handleSetEnabled(true, mockClient, mockSet as any, sendResponse);
    expect(mockClient.connect).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({ enabled: true }, expect.any(Function));
  });

  it('responds with enabled and connected status', () => {
    const sendResponse = vi.fn();
    mockClient.isConnected.mockReturnValue(true);
    handleSetEnabled(true, mockClient, mockSet as any, sendResponse);
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

  it('includes enabled from storage and connected from client', () => {
    mockStorage['enabled'] = true;
    mockClient.isConnected.mockReturnValue(true);
    const sendResponse = vi.fn();
    buildStatusResponse(mockClient, mockGet as any, [], sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({
      enabled: true,
      connected: true,
      recentActivity: [],
    });
  });

  it('defaults enabled to true when not in storage', () => {
    mockClient.isConnected.mockReturnValue(false);
    const sendResponse = vi.fn();
    buildStatusResponse(mockClient, mockGet as any, [], sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({
      enabled: true,
      connected: false,
      recentActivity: [],
    });
  });
});
