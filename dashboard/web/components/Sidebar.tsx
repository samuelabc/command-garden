'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, DoorOpen, ScrollText, BookOpen, GraduationCap } from 'lucide-react';

const JOURNAL_CHILDREN = [
  { href: '/journal/daily', label: 'Daily' },
  { href: '/journal/weekly', label: 'Weekly' },
];

const NAV = [
  { href: '/journal', label: 'Dev Journal', icon: BookOpen },
  { href: '/timetracking', label: 'Time Tracking', icon: Clock },
  { href: '/rooms', label: 'Room Availability', icon: DoorOpen },
  { href: '/training', label: 'Training', icon: GraduationCap },
  { href: '/audit', label: 'Audit Log', icon: ScrollText },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <ul className="menu bg-base-200 w-64 min-h-full p-4 gap-1">
      <li className="menu-title text-lg">personal dashboard</li>
      {NAV.map(({ href, label, icon: Icon }) => (
        <li key={href}>
          <Link href={href === '/journal' ? '/journal/daily' : href} className={pathname?.startsWith(href) ? 'active' : ''}>
            <Icon className="h-4 w-4" /> {label}
          </Link>
          {href === '/journal' && (
            <div className="ml-3 border-l border-base-300 py-0.5">
              {JOURNAL_CHILDREN.map(({ href: childHref, label: childLabel }) => (
                <Link
                  key={childHref}
                  href={childHref}
                  className={`block pl-3 py-1 text-sm transition-colors rounded ${
                    pathname?.startsWith(childHref)
                      ? 'opacity-100 font-medium'
                      : 'opacity-50 hover:opacity-80'
                  }`}
                >
                  {childLabel}
                </Link>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
