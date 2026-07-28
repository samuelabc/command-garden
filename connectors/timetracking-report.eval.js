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

const now = new Date();
const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

let month = '${{ args.month | default("") }}';
if (!month) month = currentMonth;

// ReportFAK takes a period start, but Projects treats `date` as an as-of DAY
// that only answers for the current date. Sending the period start to both
// left every projectName/activityName null; so does any historical date, so
// Projects is queried as of today and used purely as a name lookup table.
// A project no longer on today's roster resolves to null, as it did before.
// Canonical source: connectors/lib/asof-date.js
function projectsAsOfDate() {
  const d = new Date();
  return d.getFullYear() +
    '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
}

const apiBase = 'https://mbti-bam-wzde-prd-ejdchtb0g9afexhr.a01.azurefd.net/api/';
const authHeaders = { Authorization: 'Bearer ' + token, Accept: 'application/json' };

const [resp, projResp] = await Promise.all([
  fetch(apiBase + 'ReportFAK?date=' + month + '-01', { headers: authHeaders }),
  fetch(apiBase + 'Projects?date=' + projectsAsOfDate(), { headers: authHeaders }).catch(() => null),
]);
if (!resp.ok) throw new Error('ReportFAK returned HTTP ' + resp.status);

const projectNames = new Map();
const activityNames = new Map(); // key: "projectId\0activityNumber" → description
if (projResp && projResp.ok) {
  for (const p of await projResp.json()) {
    projectNames.set(p.mserp_projectid, p.mserp_projectname);
    for (const act of p.activities || []) {
      if (act.mserp_activitynumber && act.mserp_description) {
        activityNames.set(act.mserp_projectid + '\0' + act.mserp_activitynumber, act.mserp_description);
      }
    }
  }
}

const days = await resp.json();
const rows = [];
for (const day of days) {
  const header = day.calendarHeader || {};
  const dayDate = (day.date || '').slice(0, 10);
  for (const line of day.calendarLines || []) {
    const pid = line.mserp_projectid || null;
    const actNum = line.mserp_activitynumber || null;
    rows.push({
      month: month,
      date: dayDate,
      projectId: pid,
      projectName: projectNames.get(pid) || null,
      category: line.mserp_category || null,
      activity: actNum,
      activityName: (pid && actNum) ? (activityNames.get(pid + '\0' + actNum) || null) : null,
      hours: typeof line.mserp_hours === 'number' ? line.mserp_hours : null,
      status: header.status || null,
      journalId: line.mserp_journalid || null,
      lineNumber: typeof line.mserp_linenumber === 'number' ? line.mserp_linenumber : null,
    });
  }
}
return rows;
