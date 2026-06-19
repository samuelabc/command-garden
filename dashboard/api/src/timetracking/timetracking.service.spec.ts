import { TimetrackingService } from './timetracking.service';
import { OpencliResult } from '../opencli/opencli.types';

function makeOpencli(result: Partial<OpencliResult>) {
  return { run: jest.fn().mockResolvedValue({ status: 'success', data: [], rowCount: 0, durationMs: 5, exitCode: 0, ...result }) } as any;
}
const audit = () => ({ record: jest.fn().mockResolvedValue(undefined) } as any);
const goals = () => ({ findByMonth: jest.fn().mockResolvedValue([]) } as any);

const ROWS = [
  { month: '2026-05', date: '2026-05-04', projectId: 'P1', category: 'Dev', hours: 4 },
  { month: '2026-05', date: '2026-05-04', projectId: 'P1', category: 'Dev', hours: 2 },
  { month: '2026-05', date: '2026-05-05', projectId: 'P1', category: 'Mtg', hours: 1 },
  { month: '2026-05', date: '2026-05-05', projectId: 'P2', category: 'Dev', hours: 3 },
];

describe('TimetrackingService', () => {
  it('TC-AGG-1/2: aggregates by project+category with grand total', async () => {
    const svc = new TimetrackingService(makeOpencli({ data: ROWS, rowCount: 4 }), audit(), goals());
    const res = await svc.report({ month: '2026-05' });
    const p1dev = res.aggregated.find((g) => g.projectId === 'P1' && g.category === 'Dev');
    expect(p1dev).toMatchObject({ totalHours: 6, lineCount: 2 });
    expect(res.grandTotalHours).toBe(10);
    expect(res.totalLines).toBe(4);
    expect(res.aggregated).toHaveLength(3);
  });

  it('TC-AGG-3: empty rows -> empty aggregated, zero total', async () => {
    const svc = new TimetrackingService(makeOpencli({ data: [], rowCount: 0, status: 'empty' }), audit(), goals());
    const res = await svc.report({ months: 1 });
    expect(res.aggregated).toEqual([]);
    expect(res.grandTotalHours).toBe(0);
    expect(res.status).toBe('empty');
  });

  it('TC-AGG-4: null/missing hours treated as 0 (no NaN)', async () => {
    const svc = new TimetrackingService(makeOpencli({ data: [{ projectId: 'P1', category: 'Dev', hours: null }], rowCount: 1 }), audit(), goals());
    const res = await svc.report({ month: '2026-05' });
    expect(res.grandTotalHours).toBe(0);
    expect(Number.isNaN(res.grandTotalHours)).toBe(false);
  });

  it('builds argv from month and records audit', async () => {
    const opencli = makeOpencli({ data: ROWS, rowCount: 4 });
    const auditSvc = audit();
    const svc = new TimetrackingService(opencli, auditSvc, goals());
    await svc.report({ month: '2026-05' });
    expect(opencli.run).toHaveBeenCalledWith(['timetracking', 'report', '--month', '2026-05']);
    expect(auditSvc.record).toHaveBeenCalledWith(expect.objectContaining({ command: 'timetracking report', status: 'success', rowCount: 4 }));
  });

  it('builds argv from months', async () => {
    const opencli = makeOpencli({ data: [], rowCount: 0 });
    const svc = new TimetrackingService(opencli, audit(), goals());
    await svc.report({ months: 3 });
    expect(opencli.run).toHaveBeenCalledWith(['timetracking', 'report', '--months', '3']);
  });
});
