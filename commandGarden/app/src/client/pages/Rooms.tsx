import { useState, useCallback, useMemo } from 'react';
import { api, type RunResponse } from '../api';
import { Spinner } from '../components/Spinner';
import { AuthRequiredCallout } from '../components/AuthRequiredCallout';
import { RoomCombobox } from '../components/RoomCombobox';
import { TimelineView } from '../components/TimelineView';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = d.getTime() - today.getTime();
    const days = Math.round(diff / 86_400_000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days === -1) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export default function Rooms() {
  const [room, setRoom] = useState('');
  const [date, setDate] = useState(todayStr());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = useCallback(async () => {
    if (!room) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const args: Record<string, string> = { room };
      if (date) args.date = date;
      const resp = await api.run('teams/room-availability', args);
      if (!resp.ok && resp.error) {
        setError(resp.error);
      } else {
        setResult(resp);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setRunning(false);
    }
  }, [room, date]);

  const rows = (result?.data ?? []).map((r) => ({
    start: String(r.start ?? ''),
    end: String(r.end ?? ''),
    state: String(r.state ?? ''),
    durationMin: Number(r.durationMin ?? 0),
  }));

  const stats = useMemo(() => {
    if (rows.length === 0) return null;
    const totalMin = rows.reduce((s, r) => s + r.durationMin, 0);
    const freeMin = rows.filter((r) => r.state === 'free').reduce((s, r) => s + r.durationMin, 0);
    const busyMin = rows.filter((r) => r.state === 'busy').reduce((s, r) => s + r.durationMin, 0);
    const freeSlots = rows.filter((r) => r.state === 'free').length;
    const pct = totalMin > 0 ? Math.round((freeMin / totalMin) * 100) : 0;
    return { totalMin, freeMin, busyMin, freeSlots, pct };
  }, [rows]);

  const isAuthRequired = error?.includes('auth_required') || error?.includes('sign in');

  // Short room display name (strip common prefix)
  const roomShort = room.replace(/^MBTMY\s+/i, '');

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-5">Room Availability</h2>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-6">
        <label className="form-control flex-1 min-w-0">
          <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Room</span>
          <RoomCombobox value={room} onChange={setRoom} />
        </label>
        <label className="form-control w-full sm:w-auto">
          <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Date</span>
          <input
            type="date"
            className="input input-bordered input-sm w-full sm:w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button className="btn btn-primary btn-sm w-full sm:w-auto" onClick={handleRun} disabled={running || !room}>
          {running ? 'Loading...' : 'Check availability'}
        </button>
      </div>

      {running && <Spinner label="Checking room availability..." />}

      {isAuthRequired && (
        <AuthRequiredCallout message="Sign in to Microsoft Teams in Chrome, then try again." />
      )}

      {error && !isAuthRequired && (
        <div className="alert alert-error mb-4"><span>{error}</span></div>
      )}

      {result && rows.length > 0 && stats && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 border border-base-300 mb-6">
            <div className="p-3 border-r border-b border-base-300 md:border-b-0">
              <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Available</div>
              <div className="font-display text-xl font-bold text-success">{stats.pct}%</div>
            </div>
            <div className="p-3 border-b border-base-300 md:border-r md:border-b-0">
              <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Free time</div>
              <div className="font-display text-xl font-bold">{Math.floor(stats.freeMin / 60)}h {stats.freeMin % 60}m</div>
            </div>
            <div className="p-3 border-r border-base-300">
              <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Busy time</div>
              <div className="font-display text-xl font-bold">{Math.floor(stats.busyMin / 60)}h {stats.busyMin % 60}m</div>
            </div>
            <div className="p-3">
              <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Free slots</div>
              <div className="font-display text-xl font-bold">{stats.freeSlots}</div>
            </div>
          </div>

          {/* Section heading */}
          <h3 className="font-display text-base font-semibold mb-3">
            {roomShort || 'Room'} &middot; {formatDateLabel(date)}
          </h3>

          <TimelineView rows={rows} />
        </>
      )}

      {result && rows.length === 0 && !error && (
        <div className="border border-base-300 p-6 text-center">
          <p className="text-sm opacity-50 mb-1">No availability data found</p>
          <p className="font-mono text-xs opacity-30">Try a different room or date.</p>
        </div>
      )}

      {!result && !running && !error && (
        <div className="border border-base-300 p-8 text-center">
          <p className="text-sm opacity-50 mb-1">Select a room and date to check availability</p>
          <p className="font-mono text-xs opacity-30">Free/busy slots will appear as a visual timeline.</p>
        </div>
      )}
    </div>
  );
}
