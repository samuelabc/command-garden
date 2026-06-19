import { render, screen } from '@testing-library/react';
import { AuditTable } from './AuditTable';
import type { AuditItem } from '@/lib/types';

const ITEMS: AuditItem[] = [
  { id: 2, timestamp: '2026-06-16T01:00:00Z', command: 'teams roomfreebusy', argsJson: '{"room":"X"}', status: 'error', exitCode: 1, durationMs: 50, rowCount: 0, errorCode: 'UPSTREAM', errorMessage: 'boom' },
  { id: 1, timestamp: '2026-06-16T00:00:00Z', command: 'timetracking report', argsJson: '{"month":"2026-05"}', status: 'success', exitCode: 0, durationMs: 1200, rowCount: 30, errorCode: null, errorMessage: null },
];

it('TC-WEB-4: renders rows with status badges', () => {
  render(<AuditTable items={ITEMS} total={2} />);
  expect(screen.getByText('teams roomfreebusy')).toBeInTheDocument();
  expect(screen.getByText('timetracking report')).toBeInTheDocument();
  expect(screen.getByText('error')).toBeInTheDocument();
  expect(screen.getByText('success')).toBeInTheDocument();
});
