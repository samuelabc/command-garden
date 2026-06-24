// src/content/dom-executor.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { waitForSelector, extractData, clickElement, typeIntoElement } from './dom-executor.js';

describe('waitForSelector', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('resolves immediately when element exists', async () => {
    document.body.innerHTML = '<div class="target">hello</div>';
    await expect(waitForSelector('.target', 1000)).resolves.toBeUndefined();
  });

  it('rejects on timeout when element missing', async () => {
    await expect(waitForSelector('.missing', 100)).rejects.toThrow('timed out');
  });

  it('resolves when element appears later', async () => {
    setTimeout(() => { document.body.innerHTML = '<div class="later"></div>'; }, 50);
    await expect(waitForSelector('.later', 2000)).resolves.toBeUndefined();
  });
});

describe('extractData', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <table><tbody>
        <tr><td class="name">Alice</td><td class="age">30</td></tr>
        <tr><td class="name">Bob</td><td class="age">25</td></tr>
      </tbody></table>`;
  });

  it('extracts data from matching rows', () => {
    const data = extractData('tbody tr', { name: '.name', age: '.age' });
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({ name: 'Alice', age: '30' });
    expect(data[1]).toEqual({ name: 'Bob', age: '25' });
  });

  it('returns empty array when no rows match', () => {
    expect(extractData('.missing', { a: 'td' })).toEqual([]);
  });

  it('returns empty string for missing field selector', () => {
    const data = extractData('tbody tr', { name: '.name', email: '.email' });
    expect(data[0].email).toBe('');
  });
});

describe('clickElement', () => {
  it('clicks the element', async () => {
    let clicked = false;
    document.body.innerHTML = '<button id="btn">Click</button>';
    document.getElementById('btn')!.addEventListener('click', () => { clicked = true; });
    await clickElement('#btn');
    expect(clicked).toBe(true);
  });

  it('throws for missing element', async () => {
    document.body.innerHTML = '';
    await expect(clickElement('#missing')).rejects.toThrow('not found');
  });
});

describe('typeIntoElement', () => {
  it('sets value on input', async () => {
    document.body.innerHTML = '<input id="inp" />';
    await typeIntoElement('#inp', 'hello');
    expect((document.getElementById('inp') as HTMLInputElement).value).toBe('hello');
  });

  it('throws for missing element', async () => {
    document.body.innerHTML = '';
    await expect(typeIntoElement('#missing', 'x')).rejects.toThrow('not found');
  });
});
