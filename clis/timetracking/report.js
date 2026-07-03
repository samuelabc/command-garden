/**
 * MBTI Time Tracking — monthly report (one row per booking line).
 *
 * The app is an Azure AD / MSAL SPA. The ReportFAK API lives on a separate
 * Azure Front Door origin and requires the MSAL access token as a Bearer
 * header. We reuse the live browser session: read the cached access token from
 * sessionStorage and fetch the report from page context (same session/runtime).
 *
 * Strategy: COOKIE (reuse authenticated browser session) + page-context fetch.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, EmptyResultError, CliError } from '@jackwener/opencli/errors';

const DOMAIN = 'timetracking.mercedes-benz-techinnovation.com';
const API_BASE = 'https://mbti-bam-wzde-prd-ejdchtb0g9afexhr.a01.azurefd.net/api/ReportFAK?date=';
const MAX_MONTHS = 6;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function lastNMonths(n) {
  const out = [];
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth(); // 0-indexed
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m + 1).padStart(2, '0')}-01`);
    m--;
    if (m < 0) { m = 11; y--; }
  }
  return out;
}

function resolveMonthDates(args) {
  const month = String(args.month || '').trim();
  if (month) {
    if (!MONTH_RE.test(month)) {
      throw new ArgumentError(`Invalid --month "${month}"`, 'Use YYYY-MM, e.g. 2026-06');
    }
    return [`${month}-01`];
  }
  if (args.months !== undefined && args.months !== null && String(args.months) !== '') {
    const n = Number(args.months);
    if (!Number.isInteger(n) || n < 1 || n > MAX_MONTHS) {
      throw new ArgumentError(`Invalid --months "${args.months}"`, `Use an integer 1-${MAX_MONTHS}`);
    }
    return lastNMonths(n);
  }
  return lastNMonths(1);
}

async function waitForToken(page, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await page.evaluate(() => {
      try {
        const k = Object.keys(sessionStorage).find((x) => x.includes('accesstoken'));
        if (!k) return false;
        const t = JSON.parse(sessionStorage.getItem(k));
        return Number(t.expiresOn) > Math.floor(Date.now() / 1000) + 30;
      } catch (_e) { return false; }
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

cli({
  site: 'timetracking',
  name: 'report',
  access: 'read',
  description: 'MBTI Time Tracking monthly report — one row per booking line',
  example: 'opencli timetracking report --month 2026-06',
  domain: DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'month', type: 'string', default: '', help: 'Single month YYYY-MM (default: current month)' },
    { name: 'months', type: 'int', help: 'Fetch the last N months ending this month (1-6)' },
  ],
  columns: ['month', 'date', 'weekday', 'projectId', 'projectName', 'category', 'activity', 'activityName', 'hours', 'status', 'journalId', 'lineNumber'],
  func: async (page, args) => {
    const monthDates = resolveMonthDates(args);

    if (!(await waitForToken(page))) {
      throw new AuthRequiredError(DOMAIN, 'No valid Time Tracking access token in the browser session');
    }

    const result = await page.evaluate(async (dates, apiBase, projApiBase) => {
      const k = Object.keys(sessionStorage).find((x) => x.includes('accesstoken'));
      if (!k) return { error: 'AUTH' };
      let token;
      try { token = JSON.parse(sessionStorage.getItem(k)).secret; } catch (_e) { return { error: 'AUTH' }; }
      if (!token) return { error: 'AUTH' };

      const authHeaders = { Authorization: 'Bearer ' + token, Accept: 'application/json' };

      // Fetch project names and activity descriptions for the first month date
      const pnames = new Map();
      const anames = new Map(); // key: "projectId\0activityNumber" → description
      try {
        const projRes = await fetch(projApiBase + dates[0], { headers: authHeaders });
        if (projRes.ok) {
          for (const p of await projRes.json()) {
            pnames.set(p.mserp_projectid, p.mserp_projectname);
            for (const a of p.activities || []) {
              if (a.mserp_activitynumber && a.mserp_description) {
                anames.set(p.mserp_projectid + '\0' + a.mserp_activitynumber, a.mserp_description);
              }
            }
          }
        }
      } catch (_e) { /* graceful degradation */ }

      const rows = [];
      for (const date of dates) {
        const res = await fetch(apiBase + date, { headers: authHeaders });
        if (res.status === 401 || res.status === 403) return { error: 'AUTH' };
        if (!res.ok) return { error: 'HTTP', status: res.status, date };
        const days = await res.json();
        const ym = date.slice(0, 7);
        for (const day of days) {
          const header = day.calendarHeader || {};
          const dayDate = (day.date || '').slice(0, 10);
          for (const line of day.calendarLines || []) {
            const pid = line.mserp_projectid ?? null;
            const actNum = line.mserp_activitynumber ?? null;
            rows.push({
              ym,
              d: dayDate,
              pid,
              pname: pnames.get(pid) || null,
              cat: line.mserp_category ?? null,
              act: actNum,
              aname: (pid && actNum) ? (anames.get(pid + '\0' + actNum) || null) : null,
              hrs: typeof line.mserp_hours === 'number' ? line.mserp_hours : null,
              st: header.status ?? null,
              jid: line.mserp_journalid ?? null,
              ln: typeof line.mserp_linenumber === 'number' ? line.mserp_linenumber : null,
            });
          }
        }
      }
      return { rows };
    }, monthDates, API_BASE, 'https://mbti-bam-wzde-prd-ejdchtb0g9afexhr.a01.azurefd.net/api/Projects?date=');

    if (result && result.error === 'AUTH') {
      throw new AuthRequiredError(DOMAIN, 'Time Tracking access token missing or rejected (401/403)');
    }
    if (result && result.error === 'HTTP') {
      throw new CliError('UPSTREAM', `ReportFAK returned HTTP ${result.status} for ${result.date}`, 'The API may be down or the month is out of range');
    }

    const raw = (result && result.rows) || [];
    if (raw.length === 0) {
      const span = monthDates.length === 1
        ? monthDates[0].slice(0, 7)
        : `${monthDates[0].slice(0, 7)}..${monthDates[monthDates.length - 1].slice(0, 7)}`;
      throw new EmptyResultError('timetracking report', `No booking lines for ${span}`);
    }

    return raw.map(({ ym, d, pid, pname, cat, act, aname, hrs, st, jid, ln }) => ({
      month: ym,
      date: d,
      weekday: d ? WEEKDAYS[new Date(d + 'T00:00:00').getDay()] : null,
      projectId: pid,
      projectName: pname,
      category: cat,
      activity: act,
      activityName: aname,
      hours: hrs,
      status: st,
      journalId: jid,
      lineNumber: ln,
    }));
  },
});
