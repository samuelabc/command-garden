import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Spinner } from '../components/Spinner';
import { AuthRequiredCallout } from '../components/AuthRequiredCallout';
import { ROOM_EMAIL_MAP, EMAIL_TO_ROOM_NAME } from '../components/RoomCombobox';
import { TimelineView } from '../components/TimelineView';
import { OfficeMap, type RoomStatus } from '../components/Officemap';
import { useApprovalRun } from '../hooks/useApprovalRun';
import { api } from '../api';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Common meeting durations.
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 420, 480, 540];

type TimeMode = 'duration' | 'endtime';

const MIN_DURATION = 15;

// 15-minute increments across the full day: "00:00", "00:15", ..., "23:45".
const TIME_OPTIONS: string[] = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

function nearestQuarterHour(): string {
  const d = new Date();
  const total = d.getHours() * 60 + Math.round(d.getMinutes() / 15) * 15;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTimeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDurationLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
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

/** Parse a slot boundary that may be an ISO datetime or a bare "HH:mm" time. */
function parseSlotTime(value: string, dateIso: string): Date | null {
  if (!value) return null;
  let d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d;
  d = new Date(`${dateIso}T${value}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface SlotRow { start: string; end: string; state: string; durationMin?: number }

/** Whether the room is free for the entire [time, time+durationMin) window on dateIso. */
function isFreeForDuration(rows: SlotRow[], dateIso: string, time: string, durationMin: number): boolean {
  const start = new Date(`${dateIso}T${time}:00`);
  const end = new Date(start.getTime() + durationMin * 60_000);
  const overlapsBusy = rows.some((r) => {
    if (r.state === 'free') return false;
    const s = parseSlotTime(r.start, dateIso);
    const e = parseSlotTime(r.end, dateIso);
    if (s === null || e === null) return false;
    return s < end && start < e;
  });
  return !overlapsBusy;
}

const DAY_TOTAL_MIN = 24 * 60;

function clampStartMinutes(v: number, durationMin: number): number {
  return Math.max(0, Math.min(DAY_TOTAL_MIN - durationMin, v));
}

function roundToQuarterHour(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

/**
 * A draggable bar on a 24h track: position = start time, width = duration.
 * Click/drag anywhere on the track to move the bar; its width visually reflects
 * how long the meeting will occupy the room.
 */
function MeetingTimeBar({
  startMinutes,
  durationMinutes,
  onChange,
}: {
  startMinutes: number;
  durationMinutes: number;
  onChange: (startMinutes: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const minutesFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return startMinutes;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = pct * DAY_TOTAL_MIN;
    return roundToQuarterHour(raw);
  };

  const moveTo = (clientX: number) => {
    // Center the bar on the pointer for a natural "grab" feel.
    const raw = minutesFromClientX(clientX) - durationMinutes / 2;
    onChange(clampStartMinutes(roundToQuarterHour(raw), durationMinutes));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e.clientX);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    moveTo(e.clientX);
  };
  const handlePointerUp = () => {
    draggingRef.current = false;
  };

  const leftPct = (startMinutes / DAY_TOTAL_MIN) * 100;
  const widthPct = (durationMinutes / DAY_TOTAL_MIN) * 100;
  const endMinutes = startMinutes + durationMinutes;

  return (
    <div>
      <div
        ref={trackRef}
        className="relative h-10 bg-base-200 border border-base-300 rounded cursor-pointer select-none touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Hour gridlines every 3h */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex-1 border-r border-base-300/60 last:border-r-0" />
          ))}
        </div>
        <div
          className="absolute top-0 h-full bg-primary/20 border border-primary/50 rounded cursor-grab active:cursor-grabbing"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
        <div
          className="absolute top-0 h-full flex items-center text-xs font-mono font-semibold text-base-content whitespace-nowrap pointer-events-none"
          style={{
            left: widthPct < 10 ? `${leftPct + widthPct + 0.5}%` : `${leftPct}%`,
            width: widthPct < 10 ? 'auto' : `${widthPct}%`,
            justifyContent: widthPct < 10 ? 'flex-start' : 'center',
          }}
        >
          <span className={widthPct < 10 ? 'text-base-content/80' : ''}>
            {formatTimeLabel(minutesToTime(startMinutes))}–{formatTimeLabel(minutesToTime(endMinutes))}
          </span>
        </div>
      </div>
      <div className="flex justify-between font-mono text-[0.55rem] opacity-50 mt-1">
        <span>12 AM</span>
        <span>3 AM</span>
        <span>6 AM</span>
        <span>9 AM</span>
        <span>12 PM</span>
        <span>3 PM</span>
        <span>6 PM</span>
        <span>9 PM</span>
        <span>12 AM</span>
      </div>
    </div>
  );
}

export default function Rooms() {
  const [date, setDate] = useState(todayStr());
  const [timeMinutes, setTimeMinutes] = useState(() => timeToMinutes(nearestQuarterHour()));
  const time = minutesToTime(timeMinutes);
  const [duration, setDuration] = useState(120);
  const [timeMode, setTimeMode] = useState<TimeMode>('duration');
  const [endTimeMinutes, setEndTimeMinutes] = useState(() => timeToMinutes(nearestQuarterHour()) + 120);
  const [people, setPeople] = useState(1);

  const effectiveDuration = timeMode === 'endtime'
    ? Math.max(MIN_DURATION, endTimeMinutes - timeMinutes)
    : duration;

  const handleTimeModeChange = useCallback((mode: TimeMode) => {
    if (mode === timeMode) return;
    if (mode === 'endtime') {
      setEndTimeMinutes(Math.min(DAY_TOTAL_MIN, timeMinutes + duration));
    } else {
      const computed = Math.max(MIN_DURATION, endTimeMinutes - timeMinutes);
      const nearest = DURATION_OPTIONS.reduce((prev, cur) =>
        Math.abs(cur - computed) < Math.abs(prev - computed) ? cur : prev
      );
      setDuration(nearest);
    }
    setTimeMode(mode);
  }, [timeMode, timeMinutes, duration, endTimeMinutes]);

  const handleEndTimeChange = useCallback((newEnd: number) => {
    const clamped = Math.max(timeMinutes + MIN_DURATION, Math.min(DAY_TOTAL_MIN, newEnd));
    setEndTimeMinutes(clamped);
  }, [timeMinutes]);

  const handleStartTimeChange = useCallback((newStart: number) => {
    const clampedStart = clampStartMinutes(newStart, timeMode === 'endtime' ? MIN_DURATION : duration);
    setTimeMinutes(clampedStart);
    if (timeMode === 'endtime') {
      setEndTimeMinutes((prev) => Math.max(clampedStart + MIN_DURATION, Math.min(DAY_TOTAL_MIN, prev)));
    }
  }, [timeMode, duration]);

  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [cachedData, setCachedData] = useState<Record<string, unknown>[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const fetchDateRef = useRef(date);

  const {
    running: floorRunning, result: floorResult, error: floorError,
    approvalPending: floorApprovalPending, approvalId: floorApprovalId,
    run: runFloor, handleApproval: handleFloorApproval,
  } = useApprovalRun();

  // Load cached data when date changes
  useEffect(() => {
    let stale = false;
    api.getCachedRoomAvailability(date).then((res) => {
      if (stale) return;
      if (res.data && res.data.length > 0) {
        setCachedData(res.data);
        setFetchedAt(res.fetchedAt);
        setIsCached(true);
      } else {
        setCachedData(null);
        setFetchedAt(null);
        setIsCached(false);
      }
    }).catch(() => {});
    return () => { stale = true; };
  }, [date]);

  // Save to cache when a fresh fetch completes
  useEffect(() => {
    if (floorResult?.data && floorResult.data.length > 0) {
      const now = new Date().toISOString();
      setFetchedAt(now);
      setIsCached(false);
      setCachedData(floorResult.data);
      api.cacheRoomAvailability(fetchDateRef.current, floorResult.data as unknown as Record<string, unknown>[]).catch(() => {});
    }
  }, [floorResult]);

  const handleCheckFloor = useCallback(async () => {
    setIsCached(false);
    fetchDateRef.current = date;
    const rooms = Object.entries(ROOM_EMAIL_MAP).map(([n, e]) => `${n}:${e}`).join(',');
    await runFloor('teams/rooms-availability', { rooms, date });
  }, [runFloor, date]);

  const isAuthRequired = floorError?.includes('auth_required') || floorError?.includes('sign in');

  const rawData = floorResult?.data ?? cachedData ?? [];

  // Floor-plan check results, grouped by room.
  const floorRows = useMemo(
    () =>
        rawData.map((r) => ({
          room: String(r.roomEmail ?? r.room ?? ''),
          capacity: r.capacity === null || r.capacity === undefined || r.capacity === '' ? null : Number(r.capacity),
          start: String(r.start ?? ''),
          end: String(r.end ?? ''),
          state: String(r.state ?? ''),
          durationMin: Number(r.durationMin ?? 0),
        })),
    [rawData],
  );

  const roomsByName = useMemo(() => {
    const byEmail = new Map<string, typeof floorRows>();
    for (const r of floorRows) {
      const key = r.room.toLowerCase();
      if (!byEmail.has(key)) byEmail.set(key, []);
      byEmail.get(key)!.push(r);
    }
    const out = new Map<string, typeof floorRows>();
    for (const [email, roomRows] of byEmail) {
      out.set(EMAIL_TO_ROOM_NAME[email] ?? email, roomRows);
    }
    return out;
  }, [floorRows]);

  // Status per room at the selected time+duration, gated by capacity if known.
  const floorStatuses = useMemo<Record<string, RoomStatus>>(() => {
    const out: Record<string, RoomStatus> = {};
    for (const [name, roomRows] of roomsByName) {
      const capacity = roomRows.find((r) => r.capacity !== null)?.capacity ?? null;
      const bigEnough = capacity === null || capacity >= people;
      const free = isFreeForDuration(roomRows, date, time, effectiveDuration);
      out[name] = free && bigEnough ? 'free' : 'busy';
    }
    return out;
  }, [roomsByName, date, time, effectiveDuration, people]);

  const selectedRows = selectedRoom ? roomsByName.get(selectedRoom) ?? [] : [];
  const selectedCapacity = selectedRows.find((r) => r.capacity !== null)?.capacity ?? null;

  const handleMapSelect = useCallback((name: string) => {
    setSelectedRoom((prev) => (prev === name ? null : name));
  }, []);

  return (
      <div className="max-w-4xl mx-auto">
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-5">Room Availability</h2>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-6">
          <label className="form-control w-full sm:w-auto">
            <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Date</span>
            <input
                type="date"
                className="input input-bordered input-sm w-full sm:w-auto"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
            />
          </label>
          <label className="form-control w-full sm:w-auto">
            <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Start time</span>
            <select
                className="select select-bordered select-sm w-full sm:w-auto"
                value={time}
                onChange={(e) => handleStartTimeChange(timeToMinutes(e.target.value))}
            >
              {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{formatTimeLabel(t)}</option>
              ))}
            </select>
          </label>
          <div className="form-control w-full sm:w-auto">
            <div className="join mb-1">
              <button
                  type="button"
                  className={`join-item btn btn-xs px-3 font-mono text-[0.6rem] uppercase tracking-[0.1em] ${
                    timeMode === 'duration' ? 'btn-primary' : 'btn-ghost opacity-40'
                  }`}
                  onClick={() => handleTimeModeChange('duration')}
              >
                Duration
              </button>
              <button
                  type="button"
                  className={`join-item btn btn-xs px-3 font-mono text-[0.6rem] uppercase tracking-[0.1em] ${
                    timeMode === 'endtime' ? 'btn-primary' : 'btn-ghost opacity-40'
                  }`}
                  onClick={() => handleTimeModeChange('endtime')}
              >
                End time
              </button>
            </div>
            {timeMode === 'duration' ? (
              <select
                  className="select select-bordered select-sm w-full sm:w-auto"
                  value={duration}
                  onChange={(e) => {
                    const nextDuration = Number(e.target.value);
                    setDuration(nextDuration);
                    setTimeMinutes((prev) => clampStartMinutes(prev, nextDuration));
                  }}
              >
                {DURATION_OPTIONS.map((d) => (
                    <option key={d} value={d}>{formatDurationLabel(d)}</option>
                ))}
              </select>
            ) : (
              <select
                  className="select select-bordered select-sm w-full sm:w-auto"
                  value={endTimeMinutes === DAY_TOTAL_MIN ? '24:00' : minutesToTime(endTimeMinutes)}
                  onChange={(e) => {
                    const v = e.target.value;
                    handleEndTimeChange(v === '24:00' ? DAY_TOTAL_MIN : timeToMinutes(v));
                  }}
              >
                {TIME_OPTIONS.filter((t) => timeToMinutes(t) > timeMinutes).map((t) => (
                    <option key={t} value={t}>{formatTimeLabel(t)}</option>
                ))}
                <option key="eod" value="24:00">End of day</option>
              </select>
            )}
          </div>
          <label className="form-control w-full sm:w-24">
            <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">People</span>
            <input
                type="number"
                min={1}
                className="input input-bordered input-sm w-full sm:w-24"
                value={people}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setPeople(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <button className="btn btn-primary btn-sm w-full sm:w-auto" onClick={handleCheckFloor} disabled={floorRunning}>
            {floorRunning ? 'Checking floor...' : 'Check floor plan'}
          </button>
        </div>

        <div className="mb-6">
          <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1 block">
            Drag to pick a time &middot; bar width = duration
          </span>
          <MeetingTimeBar
              startMinutes={timeMinutes}
              durationMinutes={effectiveDuration}
              onChange={(newStart) => {
                setTimeMinutes(newStart);
                if (timeMode === 'endtime') {
                  setEndTimeMinutes(Math.min(DAY_TOTAL_MIN, newStart + effectiveDuration));
                }
              }}
          />
        </div>

        {floorRunning && !floorApprovalPending && (
            <Spinner label="Checking all rooms on the floor plan (this drives Outlook UI and can take a few minutes)..." />
        )}

        {floorApprovalPending && (
            <div className="alert alert-warning mb-4">
              <span>This connector requires approval before proceeding.</span>
              <div className="flex gap-2">
                <button className="btn btn-sm btn-success" onClick={() => handleFloorApproval(true)} disabled={!floorApprovalId}>
                  Approve
                </button>
                <button className="btn btn-sm btn-error" onClick={() => handleFloorApproval(false)} disabled={!floorApprovalId}>
                  Reject
                </button>
              </div>
            </div>
        )}

        {isAuthRequired && (
            <AuthRequiredCallout message="Sign in to Microsoft Teams in Chrome, then try again." />
        )}

        {floorError && !isAuthRequired && (
            <div className="alert alert-error mb-4"><span>{floorError}</span></div>
        )}

        {fetchedAt && (
            <div className="flex items-center gap-2 mb-4 font-mono text-xs opacity-50">
              {isCached && (
                  <span className="badge badge-sm badge-outline">cached</span>
              )}
              <span>Last fetched {new Date(fetchedAt).toLocaleString()}</span>
            </div>
        )}

        {!floorResult && !cachedData && !floorRunning && !floorError && (
            <div className="border border-base-300 p-8 text-center mb-8">
              <p className="text-sm opacity-50 mb-1">Pick a date, time, duration and party size, then check the floor plan</p>
              <p className="font-mono text-xs opacity-30">Rooms that are free and big enough will show green; everything else red.</p>
            </div>
        )}

        {/* Floor plan */}
        <div className="mt-2">
          <h3 className="font-display text-base font-semibold mb-3">
            Floor plan &middot; {formatTimeLabel(time)}–{formatTimeLabel((() => {
              const [h, m] = time.split(':').map(Number);
              const total = (h * 60 + m + effectiveDuration) % (24 * 60);
              return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
            })())} &middot; {formatDateLabel(date)} &middot; {people} {people === 1 ? 'person' : 'people'}
          </h3>
          <OfficeMap statuses={floorStatuses} selected={selectedRoom ?? undefined} onSelect={handleMapSelect} />
        </div>

        {/* Selected room detail */}
        {selectedRoom && selectedRows.length > 0 && (
            <div className="mt-8">
              <h3 className="font-display text-base font-semibold mb-3">
                {selectedRoom}
                {selectedCapacity !== null && (
                    <span className="ml-2 font-mono text-xs font-normal opacity-50 uppercase tracking-[0.08em]">
                      Capacity {selectedCapacity}
                    </span>
                )}
                {' '}&middot; {formatDateLabel(date)}
              </h3>
              <TimelineView rows={selectedRows} />
            </div>
        )}

        {selectedRoom && selectedRows.length === 0 && (
            <div className="mt-8 border border-base-300 p-6 text-center">
              <p className="text-sm opacity-50">No data for {selectedRoom} yet — run "Check floor plan" first.</p>
            </div>
        )}
      </div>
  );
}