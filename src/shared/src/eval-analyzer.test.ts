import { describe, it, expect } from 'vitest';
import { detectNetworkEgress } from './eval-analyzer';

describe('detectNetworkEgress', () => {
  it('detects fetch()', () => {
    expect(detectNetworkEgress('const data = await fetch("https://example.com")')).toBe(true);
  });

  it('detects new XMLHttpRequest', () => {
    expect(detectNetworkEgress('const xhr = new XMLHttpRequest();')).toBe(true);
  });

  it('detects navigator.sendBeacon', () => {
    expect(detectNetworkEgress('navigator.sendBeacon("/log", data);')).toBe(true);
  });

  it('detects axios', () => {
    expect(detectNetworkEgress('const resp = await axios.get("/api")')).toBe(true);
  });

  it('detects $.ajax', () => {
    expect(detectNetworkEgress('$.ajax({ url: "/data" })')).toBe(true);
  });

  it('detects XMLHttpRequest .open with HTTP method', () => {
    expect(detectNetworkEgress('xhr.open("POST", "/submit")')).toBe(true);
  });

  it('returns false for code without network calls', () => {
    expect(detectNetworkEgress('const x = document.querySelector(".items");')).toBe(false);
  });

  it('returns false for empty code', () => {
    expect(detectNetworkEgress('')).toBe(false);
  });

  it('returns false when fetch is part of a variable name', () => {
    expect(detectNetworkEgress('const fetchResult = data.filter(x => x);')).toBe(false);
  });

  it('detects new WebSocket', () => {
    expect(detectNetworkEgress('const ws = new WebSocket("wss://example.com");')).toBe(true);
  });

  it('detects new EventSource', () => {
    expect(detectNetworkEgress('const es = new EventSource("/events");')).toBe(true);
  });
});
