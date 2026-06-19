import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimetrackingTable } from './TimetrackingTable';
import type { TtReportResponse } from '@/lib/types';

const DATA: TtReportResponse = {
  status: 'success',
  aggregated: [
    { projectId: 'P1', category: 'Dev', totalHours: 6, lineCount: 2 },
    { projectId: 'P2', category: 'Mtg', totalHours: 4, lineCount: 1 },
  ],
  grandTotalHours: 10,
  totalLines: 3,
  raw: [{ date: '2026-05-04', projectId: 'P1', category: 'Dev', hours: 6 }],
  goals: [],
};

const DATA_WITH_GOALS: TtReportResponse = {
  ...DATA,
  goals: [
    { id: 1, month: '2026-06', projectId: 'P1', targetDays: 16.5, targetHours: 132, createdAt: '', updatedAt: '' },
  ],
};

it('TC-WEB-1: renders group totals and grand total', () => {
  render(<TimetrackingTable data={DATA} month="2026-06" />);
  expect(screen.getByText('P1')).toBeInTheDocument();
  expect(screen.getByText('6')).toBeInTheDocument();
  expect(screen.getByText(/10/)).toBeInTheDocument(); // grand total
});

it('TC-WEB-2: raw rows expand on toggle', async () => {
  render(<TimetrackingTable data={DATA} month="2026-06" />);
  expect(screen.queryByText('2026-05-04')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /raw rows/i }));
  expect(screen.getByText('2026-05-04')).toBeInTheDocument();
});

it('TC-INLINE-1: Goal column appears when goals exist', () => {
  render(<TimetrackingTable data={DATA_WITH_GOALS} month="2026-06" />);
  expect(screen.getByText('Goal')).toBeInTheDocument();
});

it('TC-INLINE-2: no Goal column when goals empty', () => {
  render(<TimetrackingTable data={DATA} month="2026-06" />);
  expect(screen.queryByText('Goal')).not.toBeInTheDocument();
});
