import { describe, it, expect } from 'vitest';
import { buildEgressRules, MIN_RULE_ID } from './egress-rules.js';

describe('buildEgressRules', () => {
  it('gives ALLOW rules a higher priority than the catch-all BLOCK', () => {
    const { rules } = buildEgressRules(7, ['example.com'], 1);
    const allow = rules.filter(r => r.action.type === 'allow');
    const block = rules.filter(r => r.action.type === 'block');
    expect(allow).toHaveLength(1);
    expect(block).toHaveLength(1);
    // Higher priority wins in declarativeNetRequest: if BLOCK outranked ALLOW,
    // every request from the tab would be blocked.
    expect(allow[0].priority!).toBeGreaterThan(block[0].priority!);
  });

  it('emits one ALLOW rule per domain plus a single BLOCK rule', () => {
    const { rules, ids } = buildEgressRules(7, ['a.com', 'b.com'], 1);
    expect(rules).toHaveLength(3);
    expect(ids).toHaveLength(3);
    expect(rules.filter(r => r.action.type === 'block')).toHaveLength(1);
  });

  it('scopes every rule to the given tab', () => {
    const { rules } = buildEgressRules(42, ['a.com'], 1);
    for (const rule of rules) {
      expect(rule.condition.tabIds).toEqual([42]);
    }
  });

  it('matches domains and their subdomains', () => {
    const { rules } = buildEgressRules(7, ['example.com'], 1);
    expect(rules[0].condition.urlFilter).toBe('||example.com');
  });

  it('fails closed: still blocks when no domains are allowed', () => {
    const { rules } = buildEgressRules(7, [], 1);
    expect(rules).toHaveLength(1);
    expect(rules[0].action.type).toBe('block');
    expect(rules[0].condition.urlFilter).toBe('*');
  });

  it('allocates sequential ids from the given start and reports the next free id', () => {
    const { ids, nextId } = buildEgressRules(7, ['a.com', 'b.com'], 10);
    expect(ids).toEqual([10, 11, 12]);
    expect(nextId).toBe(13);
  });

  it('never allocates an id below Chrome\'s minimum of 1', () => {
    const { ids } = buildEgressRules(7, ['a.com'], 0);
    expect(Math.min(...ids)).toBeGreaterThanOrEqual(MIN_RULE_ID);
  });

  it('produces ids that do not collide across successive calls', () => {
    const first = buildEgressRules(1, ['a.com'], MIN_RULE_ID);
    const second = buildEgressRules(2, ['b.com'], first.nextId);
    expect(first.ids.some(id => second.ids.includes(id))).toBe(false);
  });
});
