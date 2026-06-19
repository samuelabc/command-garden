'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { ROOM_OPTIONS } from '@/lib/rooms';

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

  // Close on outside click
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

  // Scroll highlighted item into view
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
        className="input input-bordered w-full"
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
          className="menu dropdown-content bg-base-200 rounded-box z-10 mt-1 max-h-60 w-full overflow-y-auto shadow-lg absolute"
        >
          {filtered.map((room, i) => (
            <li key={room} role="option" aria-selected={i === highlightIndex}>
              <button
                type="button"
                className={i === highlightIndex ? 'active' : ''}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus on input
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
