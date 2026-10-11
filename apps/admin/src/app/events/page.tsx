import Link from 'next/link';
import { formatInZone } from '@nt/shared';
import { ActionForm } from '@/components/action-form';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { eventRole, requireDashboardAccess } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { linkLumaEvent } from './actions';

const statusTone = { draft: 'amber', published: 'green', archived: 'neutral' } as const;

export default async function EventsPage() {
  const viewer = await requireDashboardAccess();
  const supabase = await supabaseServer();
  const { data: events } = await supabase
    .from('events')
    .select('id, name, starts_at, timezone, status, venue_name, luma_event_id')
    .order('starts_at', { ascending: false });

  const manageable = (events ?? []).filter((e) => {
    const role = eventRole(viewer, e.id);
    return role === 'admin' || role === 'manager';
  });

  const counts = await Promise.all(
    manageable.map(async (e) => {
      const { count } = await supabase.from('guests').select('id', { count: 'exact', head: true }).eq('event_id', e.id);
      return [e.id, count ?? 0] as const;
    }),
  );
  const guestCount = new Map(counts);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Events</h1>

      {manageable.length === 0 ? (
        <p className="text-sm text-zinc-600">No events yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {manageable.map((e) => (
            <li key={e.id}>
              <Link
                href={`/events/${e.id}`}
                className="block rounded-lg border border-zinc-200 bg-white p-4 shadow-xs hover:border-zinc-400"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{e.name}</h2>
                  <Badge tone={statusTone[e.status]}>{e.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-zinc-600">{formatInZone(e.starts_at, e.timezone)}</p>
                <p className="mt-1 text-sm text-zinc-500">
                  {e.venue_name ?? 'No venue set'} · {guestCount.get(e.id) ?? 0} guests
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {viewer.isAdmin ? (
        <Card
          title="Link a Luma event"
          description="Creates a draft event from Luma and imports its guests and tickets. Nothing is sent to guests."
        >
          <ActionForm action={linkLumaEvent} submitLabel="Link and import">
            <Field label="Luma event ID or link" hint="e.g. evt-sjZpNrnBWMYQFwm or luma.com/event/manage/evt-…">
              <Input name="luma" required placeholder="evt-…" />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
