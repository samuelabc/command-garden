// Runs in page context via js_evaluate step.
// Reads the MSAL access token from sessionStorage, fetches the ReportFAK API,
// and flattens day objects into one row per booking line.
//
// SSO/MFA: polls sessionStorage for up to 60s, giving the user time to
// complete login and get redirected back to the app.
//
// Template variables interpolated before execution:
//   ${{ args.month | default("") }}

// Poll for MSAL token (handles SSO redirects + MFA)
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
  'https://mbti-bam-wzde-prd-ejdchtb0g9afexhr.a01.azurefd.net/api/ReportFAK?date=' + month + '-01',
  { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } }
);
if (!resp.ok) throw new Error('ReportFAK returned HTTP ' + resp.status);

const days = await resp.json();
const rows = [];
for (const day of days) {
  const header = day.calendarHeader || {};
  const dayDate = (day.date || '').slice(0, 10);
  for (const line of day.calendarLines || []) {
    rows.push({
      month: month,
      date: dayDate,
      projectId: line.mserp_projectid || null,
      category: line.mserp_category || null,
      activity: line.mserp_activitynumber || null,
      hours: typeof line.mserp_hours === 'number' ? line.mserp_hours : null,
      status: header.status || null,
      journalId: line.mserp_journalid || null,
      lineNumber: typeof line.mserp_linenumber === 'number' ? line.mserp_linenumber : null,
    });
  }
}
return rows;
