'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { RoomFreeBusyResponse } from '@/lib/types';
import { Spinner } from '@/components/Spinner';
import { AuthRequiredCallout } from '@/components/AuthRequiredCallout';
import { TimelineView } from '@/components/TimelineView';
import { RoomCombobox } from '@/components/RoomCombobox';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function RoomsPage() {
  const [room, setRoom] = useState('');
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RoomFreeBusyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!room.trim()) { setError('Enter a room name or email.'); return; }
    setLoading(true); setError(null); setData(null);
    try {
      setData(await api.roomFreeBusy({ room: room.trim(), date }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Room Availability</h1>
      <div className="flex flex-wrap items-end gap-3">
        <label className="form-control grow">
          <span className="label-text mb-1">Room (name or email)</span>
          <RoomCombobox value={room} onChange={setRoom} />
        </label>
        <label className="form-control">
          <span className="label-text mb-1">Date</span>
          <input type="date" className="input input-bordered" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={run} disabled={loading}>Check availability</button>
      </div>

      {loading && <Spinner label="Checking room (this drives your browser)…" />}
      {error && <div role="alert" className="alert alert-error"><span>{error}</span></div>}
      {data?.status === 'auth_required' && <AuthRequiredCallout message={data.errorMessage} />}
      {data?.status === 'empty' && <div className="alert"><span>No timeline data for that room/day.</span></div>}
      {data?.status === 'success' && <TimelineView rows={data.timeline} />}
    </div>
  );
}
