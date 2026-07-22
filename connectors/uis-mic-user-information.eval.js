const resp = await fetch(
  'https://uis.query.api.dvb.corpinter.net/v1/users/prod/${{ args.userId }}',
  { headers: { Accept: 'application/json' }, credentials: 'include' }
);
if (!resp.ok) throw new Error('UIS API returned ' + resp.status + ' — check userId or log in and retry');
const d = await resp.json();

return [{
  uid:             d.uid ?? '',
  givenName:       d.givenName ?? '',
  familyName:      d.familyName ?? '',
  mail:            d.mail ?? '',
  department:      d.department ?? '',
  supervisor:      d.supervisor ?? '',
  usertype:        d.usertype ?? '',
  employeeType:    d.employeeType ?? '',
  managementlevel: d.managementlevel ?? '',
  active:          d.active ?? false,
  isClient:        d.isClient ?? false,
  groups:          (d.groups || []).join(', '),
  scopes:          (d.scopes || []).map(s => s.scope_id).join(', '),
}];
