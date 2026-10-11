'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '', label: 'Overview' },
  { href: '/tickets', label: 'Ticket types' },
  { href: '/perks', label: 'Perks' },
  { href: '/content', label: 'Content' },
  { href: '/guests', label: 'Guests' },
  { href: '/audit', label: 'Audit log' },
];

export function EventTabs({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const base = `/events/${eventId}`;
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-zinc-200">
      {TABS.map((tab) => {
        const href = base + tab.href;
        const active = tab.href === '' ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={tab.href}
            href={href}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
              active ? 'border-brand text-zinc-950' : 'border-transparent text-zinc-600 hover:text-zinc-950',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
