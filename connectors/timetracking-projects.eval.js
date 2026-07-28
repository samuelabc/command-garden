// Runs in page context via js_evaluate step.
// Fetches the Projects API to list all projects and activities the current
// user can book to today. Takes no arguments — see projectsAsOfDate() below.

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

// The Projects `date` is an as-of DAY that only answers for the current date:
// a first-of-month date returns HTTP 200 with an empty array, which this
// connector used to report as a successful run with zero rows. Historical
// dates are equally empty, so there is no month-specific roster to ask for.
// Canonical source: connectors/lib/asof-date.js
function projectsAsOfDate() {
  const d = new Date();
  return d.getFullYear() +
    '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
}

const resp = await fetch(
  'https://mbti-bam-wzde-prd-ejdchtb0g9afexhr.a01.azurefd.net/api/Projects?date=' + projectsAsOfDate(),
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
