// Runs in page context via js_evaluate step.
// Fetches the Projects API to list all available projects and activities.
//
// Template variables interpolated before execution:
//   ${{ args.month | default("") }}

// Poll for MSAL token (handles SSO redirects + MFA)
// Canonical source: connectors/lib/msal-token.js
const __deadline = Date.now() + 60000;
let token;
while (Date.now() < __deadline) {
  const k = Object.keys(sessionStorage).find(x => x.includes('accesstoken'));
  if (k) {
    try {
      const tokenData = JSON.parse(sessionStorage.getItem(k));
      if (Number(tokenData.expiresOn) > Math.floor(Date.now() / 1000) + 30) {
        token = tokenData.secret;
        break;
      }
    } catch (_) {}
  }
  await new Promise(r => setTimeout(r, 1000));
}
if (!token) throw new Error('No valid MSAL access token after 60s — log in and retry');

let month = '${{ args.month | default("") }}';
if (!month) {
  const now = new Date();
  month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

const resp = await fetch(
  'https://mbti-bam-wzde-prd-ejdchtb0g9afexhr.a01.azurefd.net/api/Projects?date=' + month + '-01',
  { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } }
);
if (!resp.ok) throw new Error('Projects API returned HTTP ' + resp.status);

const projects = await resp.json();
const rows = [];
for (const p of projects) {
  for (const act of p.activities || []) {
    rows.push({
      projectId: p.mserp_projectid || null,
      projectName: p.mserp_projectname || null,
      activityNumber: act.mserp_activitynumber || null,
      activityName: act.mserp_description || null,
      category: act.mserp_category || null,
      linePropertyId: act.mserp_linepropertyid || null,
    });
  }
}
return rows;
