'use client';
import { useState } from 'react';
import { Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import type { Goal } from '@/lib/types';

export function ManageGoals({ goals, month, onGoalChange, knownProjects }: {
  goals: Goal[];
  month: string;
  onGoalChange: () => void;
  knownProjects: string[];
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [targetDays, setTargetDays] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    const days = parseFloat(targetDays);
    if (!projectId.trim() || isNaN(days) || days < 0.5 || days > 31) return;
    setBusy(true);
    try {
      await api.upsertGoal({ month, projectId: projectId.trim(), targetDays: days });
      setProjectId('');
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
    if (isNaN(days) || days < 0.5 || days > 31) { setEditingId(null); return; }
    setBusy(true);
    try {
      await api.upsertGoal({ month: goal.month, projectId: goal.projectId, targetDays: days });
      setEditingId(null);
      onGoalChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        className="btn btn-sm btn-ghost gap-1"
        onClick={() => setOpen((o) => !o)}
        aria-label="Goals"
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        Goals ({goals.length})
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {goals.length > 0 && (
            <div className="overflow-x-auto">
              <table className="table table-xs">
                <thead>
                  <tr><th>Project</th><th className="text-right">Target (days)</th><th className="text-right">Target (hours)</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {goals.map((g) => (
                    <tr key={g.id}>
                      <td className="font-mono text-xs">{g.projectId}</td>
                      <td className="text-right">
                        {editingId === g.id ? (
                          <input
                            type="number"
                            step="0.5"
                            className="input input-bordered input-xs w-20 text-right"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleEditSave(g)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(g); if (e.key === 'Escape') setEditingId(null); }}
                            autoFocus
                          />
                        ) : (
                          g.targetDays
                        )}
                      </td>
                      <td className="text-right">{g.targetHours}</td>
                      <td className="flex gap-1">
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => { setEditingId(g.id); setEditValue(String(g.targetDays)); }}
                          disabled={busy}
                          aria-label={`Edit goal ${g.projectId}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-xs text-error"
                          onClick={() => handleDelete(g.id)}
                          disabled={busy}
                          aria-label={`Delete goal ${g.projectId}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-end gap-2">
            {knownProjects.length > 0 ? (
              <select
                className="select select-bordered select-sm"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">Select project…</option>
                {knownProjects.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="Project ID"
                className="input input-bordered input-sm w-48"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              />
            )}
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
            <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={busy}>
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
