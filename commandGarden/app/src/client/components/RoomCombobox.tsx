import { useState, useRef, useEffect, useCallback } from 'react';

export const ROOM_EMAIL_MAP: Record<string, string> = {
  'MBTMY THE BASE CAMP': 'res-rere-m6vz23ty@mercedes-benz.com',
  'MBTMY THE TRAILHEAD': 'res-rere-m6vc2q4d@mercedes-benz.com',
  'MBTMY THE FOOTHILLS': 'res-rere-m6vcb79c@mercedes-benz.com',
  'MBTMY THE BRIDGE': 'res-rere-m6vgcah6@mercedes-benz.com',
  'MBTMY THE RIDGE': 'res-rere-m6vjxdkc@mercedes-benz.com',
  'MBTMY THE MEADOW': 'res-rere-m6vhkzmd@mercedes-benz.com',
  'MBTMY THE FOREST': 'res-rere-m6vhsc6h@mercedes-benz.com',
  'MBTMY THE LOOKOUT': 'res-rere-m6vjqgrq@mercedes-benz.com',
  'MBTMY THE CLIFFSIDE': 'res-rere-m6vjl2tw@mercedes-benz.com',
  'MBTMY THE LEDGE': 'res-rere-m6vjfbmr@mercedes-benz.com',
  'MBTMY THE HIGHPOINT': 'res-rere-m6vjblgb@mercedes-benz.com',
  'MBTMY THE VISTA': 'RES-RERE-M6VJ7ZUW@mercedes-benz.com',
  'MBTMY THE SHOULDER': 'res-rere-m6vj3tuq@mercedes-benz.com',
  'MBTMY THE PINNACLE': 'res-rere-m6vhxd4c@mercedes-benz.com',
  'MBTMY THE DESCENT': 'res-rere-m6vzgysp@mercedes-benz.com',
};

const ROOM_OPTIONS = Object.keys(ROOM_EMAIL_MAP);

interface RoomComboboxProps {
  value: string;
  onChange: (value: string) => void;
}

export function RoomCombobox({ value, onChange }: RoomComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = ROOM_OPTIONS.filter((r) =>
    r.toLowerCase().includes(value.toLowerCase()),
  );

  const select = useCallback(
    (room: string) => {
      onChange(room);
      setOpen(false);
      setHighlightIndex(-1);
    },
    [onChange],
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlightIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement | undefined;
      item?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [highlightIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      setHighlightIndex(0);
      e.preventDefault();
      return;
    }

    if (!open) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          select(filtered[highlightIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setHighlightIndex(-1);
        break;
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        className="input input-bordered input-sm w-full"
        placeholder="Search or type a room name…"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlightIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="room-listbox"
      />

      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          id="room-listbox"
          role="listbox"
          className="menu dropdown-content bg-base-200 z-10 mt-1 max-h-60 w-full overflow-y-auto border border-base-300 absolute"
        >
          {filtered.map((room, i) => (
            <li key={room} role="option" aria-selected={i === highlightIndex}>
              <button
                type="button"
                className={i === highlightIndex ? 'active' : ''}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(room);
                }}
                onMouseEnter={() => setHighlightIndex(i)}
              >
                {room}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
