import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManageGoals } from './ManageGoals';
import type { Goal } from '@/lib/types';

const GOALS: Goal[] = [
  { id: 1, month: '2026-06', projectId: 'P1', targetDays: 16.5, targetHours: 132, createdAt: '', updatedAt: '' },
];

const noop = () => {};

it('TC-MGMT-5: section is collapsed by default', () => {
  render(<ManageGoals goals={GOALS} month="2026-06" onGoalChange={noop} knownProjects={[]} />);
  expect(screen.queryByText('P1')).not.toBeInTheDocument();
});

it('TC-MGMT-1: renders existing goals when expanded', async () => {
  render(<ManageGoals goals={GOALS} month="2026-06" onGoalChange={noop} knownProjects={[]} />);
  await userEvent.click(screen.getByRole('button', { name: /goals/i }));
  expect(screen.getByText('P1')).toBeInTheDocument();
  expect(screen.getByText('16.5')).toBeInTheDocument();
  expect(screen.getByText('132')).toBeInTheDocument();
});
