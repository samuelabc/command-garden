import { useState, useCallback } from 'react';
import { api, type RunResponse } from '../api';
import { Spinner } from '../components/Spinner';
import { AuthRequiredCallout } from '../components/AuthRequiredCallout';
import { RoomCombobox } from '../components/RoomCombobox';
import { TimelineView } from '../components/TimelineView';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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

  const isAuthRequired = error?.includes('auth_required') || error?.includes('sign in');

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Room Availability</h2>

      <div className="flex items-end gap-4 mb-6">
        <label className="form-control w-80">
          <span className="label-text mb-1 text-sm">Room</span>
          <RoomCombobox value={room} onChange={setRoom} />
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-sm">Date</span>
          <input
            type="date"
            className="input input-bordered input-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button className="btn btn-primary btn-sm" onClick={handleRun} disabled={running || !room}>
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

      {result && rows.length > 0 && (
        <TimelineView rows={rows} />
      )}

      {result && rows.length === 0 && !error && (
        <p className="text-sm opacity-50">No availability data found for this room and date.</p>
      )}
    </div>
  );
}
