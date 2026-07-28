// Shared as-of date snippet for the timetracking Projects endpoint.
// Paste this into any eval.js that queries Projects — it is self-contained.
//
// The two timetracking endpoints interpret `date` differently:
//   ReportFAK?date=  — a period start, so YYYY-MM-01 is correct
//   Projects?date=   — an as-of DAY that only answers for the current date
//
// Verified 2026-07-28: ?date=2026-07-28 returned 5 rows, while ?date=2026-07-01
// and ?date=2026-06-30 both returned HTTP 200 with [] — even though June had
// bookings against a project still on that day's roster. Historical as-of
// queries do not work, so there is no month-specific roster to fetch. Always
// ask as of today and treat the result as a name lookup table.
//
// The empty array is the dangerous part: it is indistinguishable from a
// successful run with no data, so a wrong date fails silently rather than
// erroring. That is how this endpoint stayed broken unnoticed.

function projectsAsOfDate() {
  const d = new Date();
  return d.getFullYear() +
    '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
}
