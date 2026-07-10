import { useId } from 'react';

export type RoomStatus = 'free' | 'busy' | 'unknown';

interface RoomDef {
    id: number;
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
    capacity: number;
}

interface ZoneDef {
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

// Bookable rooms, positioned to mirror the real floor plan.
const ROOMS: RoomDef[] = [
    { id: 1, name: 'The Base Camp', x: 685, y: 75, w: 160, h: 85, capacity: 10 },
    { id: 2, name: 'The Trailhead', x: 880, y: 130, w: 95, h: 100, capacity: 4 },
    { id: 3, name: 'The Foothills', x: 880, y: 255, w: 95, h: 100, capacity: 5 },
    { id: 4, name: 'The Bridge', x: 880, y: 380, w: 95, h: 100, capacity: 4 },
    { id: 5, name: 'The Ridge', x: 650, y: 620, w: 250, h: 110, capacity: 18 },
    { id: 6, name: 'The Meadow', x: 535, y: 480, w: 92, h: 80, capacity: 6 },
    { id: 7, name: 'The Forest', x: 428, y: 480, w: 92, h: 80, capacity: 16 },
    { id: 8, name: 'The Lookout', x: 540, y: 795, w: 110, h: 75, capacity: 4 },
    { id: 9, name: 'The Cliffside', x: 410, y: 795, w: 110, h: 75, capacity: 4 },
    { id: 10, name: 'The Ledge', x: 280, y: 795, w: 110, h: 75, capacity: 4 },
    { id: 11, name: 'The Highpoint', x: 150, y: 795, w: 110, h: 75, capacity: 10 },
    { id: 12, name: 'The Vista', x: 30, y: 750, w: 100, h: 115, capacity: 12 },
    { id: 13, name: 'The Shoulder', x: 30, y: 620, w: 100, h: 110, capacity: 4 },
    { id: 14, name: 'The Pinnacle', x: 30, y: 300, w: 120, h: 260, capacity: 16 },
    { id: 15, name: 'The Descent', x: 30, y: 60, w: 120, h: 170, capacity: 6 },
];

// Open, non-bookable areas (drawn as quiet background regions).
const ZONES: ZoneDef[] = [
    { name: 'The Summit', x: 170, y: 60, w: 230, h: 500 },
    { name: 'The Lodge', x: 670, y: 60, w: 190, h: 500 },
    { name: 'The Plateau', x: 150, y: 620, w: 470, h: 150 },
];

const ENTRIES = [
    { x: 90, y: 48 },
    { x: 355, y: 48 },
    { x: 765, y: 48 },
    { x: 90, y: 596 },
];

const STATUS_CLASS: Record<RoomStatus, string> = {
    free: 'fill-success/15 stroke-success',
    busy: 'fill-error/15 stroke-error',
    unknown: 'fill-base-200/60 stroke-base-300',
};

/** Normalize room names so "MBTMY The Ridge", "the ridge" and "The Ridge" all match. */
function normalizeRoomName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(/^mbtmy/, '')
        .replace(/^the/, '');
}

interface OfficeMapProps {
    /** Availability keyed by room name (any naming variant works, e.g. "MBTMY The Ridge"). */
    statuses?: Record<string, RoomStatus>;
    /** Currently selected room name (any naming variant). */
    selected?: string;
    /** Called with the room's display name (e.g. "The Ridge") when a room is clicked. */
    onSelect?: (name: string) => void;
}

export function OfficeMap({ statuses = {}, selected, onSelect }: OfficeMapProps) {
    const uid = useId();
    const hatchId = `hatch-${uid.replace(/[^a-zA-Z0-9]/g, '')}`;

    const normalizedStatuses = new Map<string, RoomStatus>(
        Object.entries(statuses).map(([k, v]) => [normalizeRoomName(k), v]),
    );
    const selectedNorm = selected ? normalizeRoomName(selected) : null;

    const statusFor = (room: RoomDef): RoomStatus =>
        normalizedStatuses.get(normalizeRoomName(room.name)) ?? 'unknown';

    return (
        <div className="border border-base-300 p-3 sm:p-4">
            <div className="overflow-x-auto">
                <svg
                    viewBox="0 0 1000 900"
                    className="min-w-[560px] w-full h-auto select-none"
                    role="group"
                    aria-label="Office floor plan"
                >
                    <defs>
                        <pattern
                            id={hatchId}
                            width="7"
                            height="7"
                            patternUnits="userSpaceOnUse"
                            patternTransform="rotate(45)"
                        >
                            <line x1="0" y1="0" x2="0" y2="7" strokeWidth="1" className="stroke-base-300" />
                        </pattern>
                    </defs>

                    {/* Floor outline */}
                    <rect x="14" y="40" width="972" height="846" className="fill-base-100 stroke-base-content/60" strokeWidth="2" />

                    {/* Open zones */}
                    {ZONES.map((z) => (
                        <g key={z.name}>
                            <rect
                                x={z.x}
                                y={z.y}
                                width={z.w}
                                height={z.h}
                                className="fill-base-200/30 stroke-base-300"
                                strokeWidth="1"
                                strokeDasharray="4 4"
                            />
                            <text
                                x={z.x + z.w / 2}
                                y={z.y + z.h / 2}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize="13"
                                letterSpacing="2"
                                className="fill-base-content/25 font-mono uppercase"
                            >
                                {z.name}
                            </text>
                        </g>
                    ))}

                    {/* Courtyard */}
                    <g>
                        <rect x="420" y="60" width="232" height="405" fill={`url(#${hatchId})`} className="stroke-base-300" strokeWidth="1" />
                        <rect x="437" y="192" width="198" height="140" className="fill-base-100 stroke-base-300" strokeWidth="1" />
                        <text x="536" y="255" textAnchor="middle" fontSize="12" letterSpacing="2" className="fill-base-content/40 font-mono uppercase">
                            Courtyard
                        </text>
                        <text x="536" y="275" textAnchor="middle" fontSize="8" letterSpacing="1.5" className="fill-base-content/25 font-mono uppercase">
                            Reflective pool
                        </text>
                    </g>

                    {/* Facilities block (restrooms etc.) */}
                    <rect x="680" y="758" width="220" height="112" fill={`url(#${hatchId})`} className="stroke-base-300" strokeWidth="1" />
                    <text x="790" y="818" textAnchor="middle" fontSize="9" letterSpacing="1.5" className="fill-base-content/30 font-mono uppercase">
                        Facilities
                    </text>

                    {/* Entry markers */}
                    {ENTRIES.map((e, i) => (
                        <g key={i}>
                            <path d={`M ${e.x - 6} ${e.y} L ${e.x + 6} ${e.y} L ${e.x} ${e.y + 7} Z`} className="fill-base-content/40" />
                            <text x={e.x} y={e.y - 5} textAnchor="middle" fontSize="8" letterSpacing="1" className="fill-base-content/40 font-mono uppercase">
                                Entry
                            </text>
                        </g>
                    ))}

                    {/* Bookable rooms */}
                    {ROOMS.map((room) => {
                        const status = statusFor(room);
                        const isSelected = selectedNorm !== null && normalizeRoomName(room.name) === selectedNorm;
                        const smallRoom = room.w < 100;
                        return (
                            <g
                                key={room.id}
                                role={onSelect ? 'button' : undefined}
                                tabIndex={onSelect ? 0 : undefined}
                                onClick={onSelect ? () => onSelect(room.name) : undefined}
                                onKeyDown={
                                    onSelect
                                        ? (e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                onSelect(room.name);
                                            }
                                        }
                                        : undefined
                                }
                                className={onSelect ? 'cursor-pointer hover:opacity-75 focus:outline-none transition-opacity' : undefined}
                            >
                                <title>{`${room.name} — ${status === 'unknown' ? 'not checked' : status}`}</title>
                                <rect
                                    x={room.x}
                                    y={room.y}
                                    width={room.w}
                                    height={room.h}
                                    strokeWidth={status === 'unknown' ? 1 : 1.5}
                                    className={STATUS_CLASS[status]}
                                />
                                {isSelected && (
                                    <rect
                                        x={room.x + 3}
                                        y={room.y + 3}
                                        width={room.w - 6}
                                        height={room.h - 6}
                                        className="fill-none stroke-primary"
                                        strokeWidth="2"
                                    />
                                )}
                                {/* Number badge */}
                                <circle cx={room.x + 15} cy={room.y + 15} r="9" className="fill-base-100 stroke-base-content/30" strokeWidth="1" />
                                <text
                                    x={room.x + 15}
                                    y={room.y + 15}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fontSize="8.5"
                                    className="fill-base-content/60 font-mono"
                                >
                                    {room.id}
                                </text>
                                {/* Room name */}
                                <text
                                    x={room.x + room.w / 2}
                                    y={room.y + room.h / 2 + (room.h > 90 ? 10 : 8)}
                                    textAnchor="middle"
                                    fontSize={smallRoom ? 12 : 13.5}
                                    letterSpacing="0.8"
                                    className="fill-base-content/80 font-mono uppercase font-medium"
                                >
                                    {room.name.replace(/^The\s+/i, '')}
                                </text>
                                {/* Capacity */}
                                <text
                                    x={room.x + room.w / 2}
                                    y={room.y + room.h / 2 + (room.h > 90 ? 10 : 8) + (smallRoom ? 9 : 10.5)}
                                    textAnchor="middle"
                                    fontSize={smallRoom ? 10.5 : 10.5}
                                    letterSpacing="0.5"
                                    className="fill-base-content/40 font-mono"
                                >
                                    {room.capacity}p
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 font-mono text-[0.6rem] uppercase tracking-[0.1em] opacity-70">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 inline-block bg-success/15 border border-success" /> Available
        </span>
                <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 inline-block bg-error/15 border border-error" /> Busy
        </span>
                <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 inline-block bg-base-200 border border-base-300" /> Not checked
        </span>
                {onSelect && <span className="opacity-60">Click a room to select it</span>}
            </div>
        </div>
    );
}

export default OfficeMap;