import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Scroll-spy hook: returns the ID of the section currently in view.
 * Tracks which section heading has scrolled past the top of the viewport.
 * Uses rAF to throttle scroll handler.
 */
export function useActiveSection(sectionIds: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  const rafId = useRef<number>(0);

  const update = useCallback(() => {
    if (sectionIds.length === 0) { setActiveId(null); return; }
    let current = sectionIds[0];
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= 100) current = id;
    }
    setActiveId(current);
  }, [sectionIds]);

  useEffect(() => {
    if (sectionIds.length === 0) return;
    update();
    const onScroll = () => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId.current);
    };
  }, [update, sectionIds]);

  return activeId;
}
