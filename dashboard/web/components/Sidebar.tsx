'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, DoorOpen, ScrollText, BookOpen } from 'lucide-react';

const NAV = [
  { href: '/journal', label: 'Dev Journal', icon: BookOpen },
  { href: '/timetracking', label: 'Time Tracking', icon: Clock },
  { href: '/rooms', label: 'Room Availability', icon: DoorOpen },
  { href: '/audit', label: 'Audit Log', icon: ScrollText },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <ul className="menu bg-base-200 w-64 min-h-full p-4 gap-1">
      <li className="menu-title text-lg">personal dashboard</li>
      {NAV.map(({ href, label, icon: Icon }) => (
        <li key={href}>
          <Link href={href} className={pathname?.startsWith(href) ? 'active' : ''}>
            <Icon className="h-4 w-4" /> {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
