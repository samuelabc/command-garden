const resp = await fetch(
  'https://${{ args.region | lookup(vars.domains) }}/v1/clients/${{ args.clientid }}',
  { headers: { Accept: 'application/json' }, credentials: 'include' }
);
if (!resp.ok) throw new Error('TokenMaster API returned ' + resp.status + ' — check clientid or log in and retry');
const d = await resp.json();

const tokens = Array.isArray(d.tokens) ? d.tokens : [];
const dates = tokens
  .map(t => t && t.generated_at)
  .filter(Boolean)
  .sort();

return [{
  id:          d.id ?? '${{ args.clientid }}',
  name:        d.name ?? '',
  generated_at: dates.length > 0 ? dates[dates.length - 1] : '',
  token_count: tokens.length,
}];
