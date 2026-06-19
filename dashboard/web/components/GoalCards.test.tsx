import { render, screen } from '@testing-library/react';
import { GoalCards } from './GoalCards';
import type { Goal, TtGroup } from '@/lib/types';

const GOALS: Goal[] = [
  { id: 1, month: '2026-06', projectId: 'P1', targetDays: 16.5, targetHours: 132, createdAt: '', updatedAt: '' },
];

const AGGREGATED: TtGroup[] = [
  { projectId: 'P1', category: 'Dev', totalHours: 60, lineCount: 10 },
  { projectId: 'P1', category: 'Mtg', totalHours: 20, lineCount: 5 },
  { projectId: 'P2', category: 'Dev', totalHours: 40, lineCount: 8 },
];

it('TC-CARD-1: renders one card per goal with correct info', () => {
  render(<GoalCards goals={GOALS} aggregated={AGGREGATED} month="2026-06" today="2026-06-16" />);
  expect(screen.getByText('P1')).toBeInTheDocument();
  expect(screen.getByText(/80/)).toBeInTheDocument();
  expect(screen.getByText(/132h/)).toBeInTheDocument();
});

it('TC-CARD-3: shows Goal reached when actual >= target', () => {
  const reachedGoals: Goal[] = [
    { id: 1, month: '2026-06', projectId: 'P1', targetDays: 5, targetHours: 40, createdAt: '', updatedAt: '' },
  ];
  const agg: TtGroup[] = [{ projectId: 'P1', category: 'Dev', totalHours: 50, lineCount: 10 }];
  render(<GoalCards goals={reachedGoals} aggregated={agg} month="2026-06" today="2026-06-16" />);
  expect(screen.getByText(/Goal reached/i)).toBeInTheDocument();
});

it('TC-CARD-5: no cards when goals empty', () => {
  const { container } = render(<GoalCards goals={[]} aggregated={AGGREGATED} month="2026-06" today="2026-06-16" />);
  expect(container.children).toHaveLength(0);
});
