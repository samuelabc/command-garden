import { useState, useMemo } from 'react';
import { api, type Goal } from '../api';

interface ProjectActivity {
  projectId: string;
  activity: string;
}

export function ManageGoals({
  goals,
  month,
  onGoalChange,
  knownCombos,
  projectNames,
  activityNames,
  onRefreshProjects,
  refreshingProjects,
}: {
  goals: Goal[];
  month: string;
  onGoalChange: () => void;
  knownCombos: ProjectActivity[];
  projectNames: Map<string, string>;
  activityNames: Map<string, string>;
  onRefreshProjects: () => void;
  refreshingProjects: boolean;
}) {
  const [selectedCombo, setSelectedCombo] = useState('');
  const [targetDays, setTargetDays] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);

  const comboOptions = useMemo(() => {
    const existingKeys = new Set(goals.map((g) => `${g.projectId}\0${g.activity}`));
    return knownCombos.filter((c) => !existingKeys.has(`${c.projectId}\0${c.activity}`));
  }, [knownCombos, goals]);

  function parseCombo(val: string): ProjectActivity | null {
    const idx = val.indexOf('\0');
    if (idx < 0) return null;
    return { projectId: val.slice(0, idx), activity: val.slice(idx + 1) };
  }

  function displayName(pid: string): string {
    return projectNames.get(pid) ?? pid;
  }

  function comboLabel(pid: string, act: string): string {
    const actName = activityNames.get(`${pid}\0${act}`);
    return actName ? `${displayName(pid)} / ${actName}` : `${displayName(pid)} / ${act}`;
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
      onGoalChange();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    setBusy(true);
    try {
      await api.deleteGoal(id);
      onGoalChange();
    } finally {
      setBusy(false);
    }
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
      onGoalChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold mb-2">
        Manage goals ({goals.length})
      </summary>
      <div className="mt-2 space-y-3">
        {goals.length > 0 && (
          <div className="overflow-x-auto border border-base-300">
            <table className="table table-xs">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Activity</th>
                  <th className="text-right">Target (days)</th>
                  <th className="text-right">Target (hours)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {goals.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <div className="text-sm">{displayName(g.projectId)}</div>
                      {projectNames.has(g.projectId) && (
                        <div className="font-mono text-[0.6rem] opacity-50">{g.projectId}</div>
                      )}
                    </td>
                    <td>
                      <div className="text-sm">{activityNames.get(`${g.projectId}\0${g.activity}`) ?? g.activity}</div>
                      <div className="font-mono text-[0.6rem] opacity-50">{g.activity}</div>
                    </td>
                    <td className="text-right">
                      {editingId === g.id ? (
                        <input
                          type="number"
                          step="0.5"
                          className="input input-bordered input-xs w-20 text-right"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleEditSave(g)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEditSave(g);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        g.targetDays
                      )}
                    </td>
                    <td className="text-right">{g.targetHours}</td>
                    <td className="flex gap-1">
                      <button
                        className="btn btn-ghost btn-xs font-mono"
                        onClick={() => {
                          setEditingId(g.id);
                          setEditValue(String(g.targetDays));
                        }}
                        disabled={busy}
                        aria-label={`Edit goal ${g.projectId} ${g.activity}`}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-ghost btn-xs text-error font-mono"
                        onClick={() => handleDelete(g.id)}
                        disabled={busy}
                        aria-label={`Delete goal ${g.projectId} ${g.activity}`}
                      >
                        Del
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-end gap-2">
          <select
            className="select select-bordered select-sm"
            value={selectedCombo}
            onChange={(e) => setSelectedCombo(e.target.value)}
          >
            <option value="">Select project / activity…</option>
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
          <button
            className="btn btn-ghost btn-sm font-mono text-xs opacity-60"
            onClick={onRefreshProjects}
            disabled={refreshingProjects}
          >
            {refreshingProjects ? 'Refreshing…' : 'Refresh projects'}
          </button>
        </div>
      </div>
    </details>
  );
}
