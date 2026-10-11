import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { Table, Td, Th } from '@/components/ui/table';
import { getManagedEvent } from '@/lib/event';
import { summarizeTypes } from '@/lib/format';
import { PAGE_SIZE, pageFromParam, sanitizeSearch } from '@/lib/search';

export default async function GuestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { eventId } = await params;
  const sp = await searchParams;
  const { supabase } = await getManagedEvent(eventId);
  const q = sanitizeSearch(sp.q);
  const page = pageFromParam(sp.page);
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from('guests')
    .select('id, name, email, approval_status', { count: 'exact' })
    .eq('event_id', eventId)
    .order('name', { ascending: true, nullsFirst: false })
    .order('id')
    .range(from, from + PAGE_SIZE - 1);
  if (q) query = query.or(`name.ilike.*${q}*,email.ilike.*${q}*`);
  const { data: guests, count } = await query;

  const guestIds = (guests ?? []).map((g) => g.id);
  const [{ data: tickets }, { data: types }] = await Promise.all([
    guestIds.length
      ? supabase.from('tickets').select('id, guest_id, ticket_type_id, status').in('guest_id', guestIds)
      : Promise.resolve({ data: [] as { id: string; guest_id: string; ticket_type_id: string; status: string }[] }),
    supabase.from('ticket_types').select('id, name, admits_entry').eq('event_id', eventId),
  ]);
  const ticketIds = (tickets ?? []).map((t) => t.id);
  const { data: statuses } = ticketIds.length
    ? await supabase.from('ticket_check_in_status').select('ticket_id, check_in_id').in('ticket_id', ticketIds)
    : { data: [] as { ticket_id: string | null; check_in_id: string | null }[] };

  const typeById = new Map((types ?? []).map((t) => [t.id, t]));
  const checkedIn = new Set((statuses ?? []).filter((s) => s.check_in_id).map((s) => s.ticket_id));
  const ticketsByGuest = new Map<string, typeof tickets>();
  for (const t of tickets ?? []) ticketsByGuest.set(t.guest_id, [...(ticketsByGuest.get(t.guest_id) ?? []), t]);

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <Card title="Guests" description="Imported from Luma (read-only). Open a guest to check them in manually or adjust perks.">
      <form className="mb-4 flex gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Search name or email" className="max-w-sm" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {q ? (
          <Link href="?" className="self-center text-sm text-zinc-600 hover:text-zinc-900">
            Clear
          </Link>
        ) : null}
      </form>

      <Table>
        <thead>
          <tr>
            <Th>Guest</Th>
            <Th>Tickets</Th>
            <Th>Entry</Th>
          </tr>
        </thead>
        <tbody>
          {(guests ?? []).map((g) => {
            const own = ticketsByGuest.get(g.id) ?? [];
            const entry = own.filter((t) => t.status === 'active' && typeById.get(t.ticket_type_id)?.admits_entry);
            const inCount = entry.filter((t) => checkedIn.has(t.id)).length;
            return (
              <tr key={g.id} className="hover:bg-zinc-50">
                <Td>
                  <Link href={`/events/${eventId}/guests/${g.id}`} className="font-medium hover:underline">
                    {g.name || '(no name)'}
                  </Link>
                  <span className="block text-xs text-zinc-500">{g.email}</span>
                  {g.approval_status !== 'approved' ? <Badge tone="amber">{g.approval_status}</Badge> : null}
                </Td>
                <Td className="text-zinc-700">
                  {summarizeTypes(own.filter((t) => t.status === 'active').map((t) => typeById.get(t.ticket_type_id)?.name ?? '?'))}
                </Td>
                <Td>
                  {entry.length === 0 ? (
                    <span className="text-zinc-400">—</span>
                  ) : (
                    <Badge tone={inCount === entry.length ? 'green' : inCount > 0 ? 'blue' : 'neutral'}>
                      {inCount}/{entry.length} in
                    </Badge>
                  )}
                </Td>
              </tr>
            );
          })}
          {(guests ?? []).length === 0 ? (
            <tr>
              <Td colSpan={3} className="text-zinc-500">
                No guests found.
              </Td>
            </tr>
          ) : null}
        </tbody>
      </Table>

      <div className="mt-4 flex items-center justify-between text-sm text-zinc-600">
        <span>
          {total.toLocaleString()} guests · page {page} of {pages}
        </span>
        <div className="flex gap-3">
          {page > 1 ? <Link href={link(page - 1)}>← Previous</Link> : null}
          {page < pages ? <Link href={link(page + 1)}>Next →</Link> : null}
        </div>
      </div>
    </Card>
  );
}
