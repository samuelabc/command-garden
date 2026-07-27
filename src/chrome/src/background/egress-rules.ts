// Construction of declarativeNetRequest rules for the network_egress
// capability, kept free of the chrome.* API surface so it can be unit tested.

export interface EgressRuleSet {
  rules: chrome.declarativeNetRequest.Rule[];
  ids: number[];
  nextId: number;
}

// Chrome requires rule IDs to be integers >= 1.
export const MIN_RULE_ID = 1;

// Higher priority wins. The per-domain ALLOW rules must outrank the catch-all
// BLOCK rule, otherwise every request from the tab is blocked including the
// domains the connector declared.
const ALLOW_PRIORITY = 2;
const BLOCK_PRIORITY = 1;

export function buildEgressRules(
  tabId: number,
  allowedDomains: string[],
  startId: number,
): EgressRuleSet {
  // Chrome validates the rule schema and reports a bare "expected integer,
  // found number" that names neither the tab nor the step. A js_evaluate step
  // with no preceding navigate leaves tabId at -1, and chrome.tabs can hand
  // back a tab without an id, so check here where we can say what went wrong.
  if (!Number.isSafeInteger(tabId) || tabId < 0) {
    throw new Error(
      `network_egress cannot be applied: invalid tab id (${tabId}). ` +
      'A js_evaluate step that declares network_egress must follow a navigate step.',
    );
  }
  if (!Number.isSafeInteger(startId)) {
    throw new Error(`network_egress cannot be applied: invalid rule id counter (${startId})`);
  }

  let nextId = Math.max(startId, MIN_RULE_ID);
  const ids: number[] = [];

  const rules: chrome.declarativeNetRequest.Rule[] = allowedDomains.map((domain) => {
    const id = nextId++;
    ids.push(id);
    return {
      id,
      priority: ALLOW_PRIORITY,
      action: { type: 'allow' as chrome.declarativeNetRequest.RuleActionType },
      condition: {
        urlFilter: `||${domain}`,
        tabIds: [tabId],
      },
    };
  });

  // Emitted even when no domains are allowed, so an empty allowlist fails
  // closed rather than leaving the tab unrestricted.
  const blockId = nextId++;
  ids.push(blockId);
  rules.push({
    id: blockId,
    priority: BLOCK_PRIORITY,
    action: { type: 'block' as chrome.declarativeNetRequest.RuleActionType },
    condition: {
      urlFilter: '*',
      tabIds: [tabId],
    },
  });

  return { rules, ids, nextId };
}
