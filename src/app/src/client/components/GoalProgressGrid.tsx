import { useState, useMemo } from 'react';
import { api, type Goal } from '../api';
import type { PaceStatus } from '../lib/goals';
import { computeGoalProgress } from '../lib/goals';
import { GoalProgressBar } from './GoalProgressBar';
import { GoalSparkline } from './GoalSparkline';
import { TrendingUp, CircleCheckBig, Clock, AlertTriangle, Pencil, Trash2, Plus, Target } from 'lucide-react';

interface ProjectActivity {
  projectId: string;
  activity: string;
}

interface ActivityHours {
  projectId: string;
  activity: string;
  totalHours: number;
}

const statusIcon: Record<PaceStatus, typeof TrendingUp> = {
  reached: CircleCheckBig,
  on_track: TrendingUp,
  behind: Clock,
  at_risk: AlertTriangle,
};

const statusIconColor: Record<PaceStatus, string> = {
  reached: 'text-success',
  on_track: 'text-success',
  behind: 'text-warning',
  at_risk: 'text-error',
};

const statusRowTint: Record<PaceStatus, string> = {
  reached: 'bg-success/10',
  on_track: 'bg-success/5',
  behind: 'bg-warning/10',
  at_risk: 'bg-error/10',
};

function surplusBadge(surplusHours: number, status: PaceStatus): { text: string; className: string } {
  if (status === 'reached') return { text: 'reached', className: 'text-success' };
  const abs = Math.round(Math.abs(surplusHours) * 10) / 10;
  if (surplusHours >= 0) {
    return { text: `+${abs}h ahead`, className: 'text-success' };
  }
  return { text: `−${abs}h behind`, className: status === 'at_risk' ? 'text-error' : 'text-warning' };
}

function actualHoursForGoal(projectId: string, activity: string, activityHours: ActivityHours[]): number {
  const entry = activityHours.find((a) => a.projectId === projectId && a.activity === activity);
  return entry?.totalHours ?? 0;
}

function AddGoalForm({
  showAddForm,
  setShowAddForm,
  selectedCombo,
  setSelectedCombo,
  targetDays,
  setTargetDays,
  comboOptions,
  comboLabel,
  handleAdd,
  busy,
  onRefreshProjects,
  refreshingProjects,
  variant,
}: {
  showAddForm: boolean;
  setShowAddForm: (v: boolean) => void;
  selectedCombo: string;
  setSelectedCombo: (v: string) => void;
  targetDays: string;
  setTargetDays: (v: string) => void;
  comboOptions: ProjectActivity[];
  comboLabel: (pid: string, act: string) => string;
  handleAdd: () => void;
  busy: boolean;
  onRefreshProjects: () => void;
  refreshingProjects: boolean;
  variant: 'primary' | 'ghost';
}) {
  if (!showAddForm) {
    return (
      <button className={`btn btn-${variant} btn-sm`} onClick={() => setShowAddForm(true)}>
        <Plus size={14} /> Add goal
      </button>
    );
  }
  return (
    <div className="flex items-end gap-2">
      <select
        className="select select-bordered select-sm"
        value={selectedCombo}
        onChange={(e) => setSelectedCombo(e.target.value)}
      >
        <option value="">Select project / activity...</option>
        {comboOptions.map((c) => (
          <option key={`${c.projectId}\0${c.activity}`} value={`${c.projectId}\0${c.activity}`}>
            {comboLabel(c.projectId, c.activity)}
          </option>
        ))}
      </select>
      <input
        type="number"
        step="0.5"
        min="0.5"
        max="31"
        placeholder="Days"
        className="input input-bordered input-sm w-24"
        value={targetDays}
        onChange={(e) => setTargetDays(e.target.value)}
      />
      <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={busy || !selectedCombo}>
        Add
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => setShowAddForm(false)}>
        Cancel
      </button>
      <button
        className="btn btn-ghost btn-sm font-mono text-xs opacity-60"
        onClick={onRefreshProjects}
        disabled={refreshingProjects}
      >
        {refreshingProjects ? 'Refreshing...' : 'Refresh projects'}
      </button>
    </div>
  );
}

export function GoalProgressGrid({
  goals,
  activityHours,
  dailyHoursByGoal,
  projectNames,
  activityNames,
  month,
  today,
  onGoalChange,
  knownCombos,
  onRefreshProjects,
  refreshingProjects,
  hasData,
}: {
  goals: Goal[];
  activityHours: ActivityHours[];
  dailyHoursByGoal: Map<string, Map<string, number>>;
  projectNames: Map<string, string>;
  activityNames: Map<string, string>;
  month: string;
  today: string;
  onGoalChange: () => void;
  knownCombos: ProjectActivity[];
  onRefreshProjects: () => void;
  refreshingProjects: boolean;
  hasData: boolean;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCombo, setSelectedCombo] = useState('');
  const [targetDays, setTargetDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const comboOptions = useMemo(() => {
    const existingKeys = new Set(goals.map((g) => `${g.projectId}\0${g.activity}`));
    return knownCombos.filter((c) => !existingKeys.has(`${c.projectId}\0${c.activity}`));
  }, [knownCombos, goals]);

  function displayName(pid: string): string {
    return projectNames.get(pid) ?? pid;
  }

  function comboLabel(pid: string, act: string): string {
    const actName = activityNames.get(`${pid}\0${act}`);
    return actName ? `${displayName(pid)} / ${actName}` : `${displayName(pid)} / ${act}`;
  }

  function parseCombo(val: string): ProjectActivity | null {
    const idx = val.indexOf('\0');
    if (idx < 0) return null;
    return { projectId: val.slice(0, idx), activity: val.slice(idx + 1) };
  }

  async function handleEditSave(goal: Goal) {
    const days = parseFloat(editValue);
    if (isNaN(days) || days < 0.5 || days > 31) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    try {
      await api.upsertGoal({ month: goal.month, projectId: goal.projectId, activity: goal.activity, targetDays: days });
      setEditingId(null);
      setError(null);
      onGoalChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update goal');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    setBusy(true);
    try {
      await api.deleteGoal(id);
      setConfirmDeleteId(null);
      setError(null);
      onGoalChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete goal');
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    const combo = parseCombo(selectedCombo);
    const days = parseFloat(targetDays);
    if (!combo || isNaN(days) || days < 0.5 || days > 31) return;
    setBusy(true);
    try {
      await api.upsertGoal({ month, projectId: combo.projectId, activity: combo.activity, targetDays: days });
      setSelectedCombo('');
      setTargetDays('');
      setShowAddForm(false);
      setError(null);
      onGoalChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add goal');
    } finally {
      setBusy(false);
    }
  }

  // Empty state
  if (goals.length === 0) {
    return (
      <div className="mb-6">
        <h3 className="font-display text-base font-semibold mb-3">Goals</h3>
        {hasData ? (
          <div className="border border-base-300 p-6">
            <div className="flex items-start gap-4">
              <Target size={24} className="opacity-30 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="font-display font-semibold text-sm mb-1">Set your first goal</div>
                <p className="text-sm opacity-60 mb-4 max-w-md">
                  Track how your hours distribute across projects and get daily pace guidance.
                </p>
                <AddGoalForm
                  showAddForm={showAddForm} setShowAddForm={setShowAddForm}
                  selectedCombo={selectedCombo} setSelectedCombo={setSelectedCombo}
                  targetDays={targetDays} setTargetDays={setTargetDays}
                  comboOptions={comboOptions} comboLabel={comboLabel}
                  handleAdd={handleAdd} busy={busy}
                  onRefreshProjects={onRefreshProjects} refreshingProjects={refreshingProjects}
                  variant="primary"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-base-300 p-4">
            <p className="text-sm opacity-40">Load a report to set goals and track progress.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-6">
      <h3 className="font-display text-base font-semibold mb-3">Goals</h3>
      {error && (
        <div className="alert alert-error mb-3">
          <span>{error}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      <div className="overflow-x-auto border border-base-300">
        {goals.map((goal, i) => {
          const actual = actualHoursForGoal(goal.projectId, goal.activity, activityHours);
          const progress = computeGoalProgress({
            targetHours: goal.targetHours,
            actualHours: actual,
            month,
            today,
          });
          const name = projectNames.get(goal.projectId);
          const Icon = statusIcon[progress.status];
          const badge = surplusBadge(progress.surplusHours, progress.status);
          const goalKey = `${goal.projectId}\0${goal.activity}`;
          const dailyHours = dailyHoursByGoal.get(goalKey) ?? new Map<string, number>();

          return (
            <div
              key={goal.id}
              className={`grid grid-cols-[auto_1fr_auto_auto_1fr_auto] gap-0 ${statusRowTint[progress.status]} ${i > 0 ? 'border-t border-base-300' : ''}`}
            >
              {/* Status icon */}
              <div className="p-3 border-r border-base-300 flex items-center justify-center">
                <Icon size={18} className={statusIconColor[progress.status]} />
              </div>

              {/* Project + activity */}
              <div className="p-3 border-r border-base-300 min-w-0">
                <div className="font-display font-semibold text-sm truncate">
                  {name ?? goal.projectId}
                </div>
                <div className="font-mono text-[0.6rem] opacity-50 mt-0.5 truncate">
                  {name ? `${goal.projectId} · ` : ''}{activityNames.get(`${goal.projectId}\0${goal.activity}`) ?? goal.activity}
                </div>
              </div>

              {/* Hours + surplus/deficit */}
              <div className="p-3 border-r border-base-300 text-right min-w-[8rem]">
                <div className="font-display font-semibold text-sm">
                  {editingId === goal.id ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="number"
                        step="0.5"
                        className="input input-bordered input-xs w-16 text-right"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleEditSave(goal)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditSave(goal);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                      />
                      <span className="opacity-40">d</span>
                      <span className="font-mono text-[0.6rem] opacity-30">= {Math.round(parseFloat(editValue || '0') * 8 * 10) / 10}h</span>
                    </span>
                  ) : (
                    <>{Math.round(actual * 10) / 10}/{goal.targetHours}h</>
                  )}
                </div>
                <div className={`font-mono text-[0.6rem] font-medium uppercase tracking-[0.1em] mt-0.5 ${badge.className}`}>
                  {editingId !== goal.id && badge.text}
                </div>
              </div>

              {/* Sparkline */}
              <div className="p-3 border-r border-base-300 flex items-center">
                <GoalSparkline month={month} today={today} dailyHours={dailyHours} />
              </div>

              {/* Progress bar + pace */}
              <div className="p-3 border-r border-base-300">
                <div className="flex items-center gap-2 mb-1">
                  <GoalProgressBar
                    percentage={progress.percentage}
                    status={progress.status}
                    className="flex-1"
                  />
                  <span className="font-mono text-xs font-medium min-w-[3rem] text-right">
                    {Math.round(progress.percentage)}%
                  </span>
                </div>
                {progress.status === 'reached' ? (
                  <div className="font-mono text-[0.6rem] font-medium text-success uppercase tracking-[0.1em]">
                    Goal reached
                  </div>
                ) : (
                  <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">
                    {progress.workingDaysRemaining > 0
                      ? `Book ${Math.round(progress.hoursPerDayNeeded * 10) / 10}h/day · ${progress.workingDaysRemaining} days left`
                      : `${Math.round(progress.daysRemaining * 10) / 10} days remaining`}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="p-3 flex items-center gap-1">
                {confirmDeleteId === goal.id ? (
                  <>
                    <button
                      className="btn btn-ghost btn-xs text-error font-mono"
                      onClick={() => handleDelete(goal.id)}
                      disabled={busy}
                    >
                      Confirm
                    </button>
                    <button
                      className="btn btn-ghost btn-xs font-mono"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn-ghost btn-xs btn-square"
                      onClick={() => {
                        setEditingId(goal.id);
                        setEditValue(String(goal.targetDays));
                      }}
                      disabled={busy}
                      aria-label={`Edit goal ${displayName(goal.projectId)}`}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="btn btn-ghost btn-xs btn-square text-error/60 hover:text-error"
                      onClick={() => setConfirmDeleteId(goal.id)}
                      disabled={busy}
                      aria-label={`Delete goal ${displayName(goal.projectId)}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add goal */}
      <div className="mt-3">
        <AddGoalForm
          showAddForm={showAddForm} setShowAddForm={setShowAddForm}
          selectedCombo={selectedCombo} setSelectedCombo={setSelectedCombo}
          targetDays={targetDays} setTargetDays={setTargetDays}
          comboOptions={comboOptions} comboLabel={comboLabel}
          handleAdd={handleAdd} busy={busy}
          onRefreshProjects={onRefreshProjects} refreshingProjects={refreshingProjects}
          variant="ghost"
        />
      </div>
    </div>
  );
}
