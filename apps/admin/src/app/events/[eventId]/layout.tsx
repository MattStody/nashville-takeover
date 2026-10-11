import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatInZone } from '@nt/shared';
import { EventTabs } from '@/components/event-tabs';
import { Badge } from '@/components/ui/badge';
import { getManagedEvent } from '@/lib/event';

const statusTone = { draft: 'amber', published: 'green', archived: 'neutral' } as const;

export default async function EventLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { event } = await getManagedEvent(eventId);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/events" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← Events
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <Badge tone={statusTone[event.status]}>{event.status}</Badge>
        </div>
        <p className="text-sm text-zinc-600">
          {formatInZone(event.starts_at, event.timezone)} · {event.timezone}
          {event.luma_event_id ? ` · Luma ${event.luma_event_id}` : ''}
        </p>
      </div>
      <EventTabs eventId={eventId} />
      {children}
    </div>
  );
}
