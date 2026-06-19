import { render, screen } from '@testing-library/react';
import { TimelineView } from './TimelineView';
import type { TimelineRow } from '@/lib/types';

const ROWS: TimelineRow[] = [
  { date: '2026-06-12', state: 'free', start: '00:00', end: '09:00', durationMin: 540 },
  { date: '2026-06-12', state: 'busy', start: '09:00', end: '10:00', durationMin: 60 },
];

it('TC-WEB-3: renders timeline blocks with state labels', () => {
  render(<TimelineView rows={ROWS} />);
  expect(screen.getByText('free')).toBeInTheDocument();
  expect(screen.getByText('busy')).toBeInTheDocument();
  expect(screen.getAllByText('09:00').length).toBeGreaterThanOrEqual(1);
});
