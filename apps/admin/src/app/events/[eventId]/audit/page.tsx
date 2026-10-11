import Link from 'next/link';
import { formatInZone } from '@nt/shared';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Table, Td, Th } from '@/components/ui/table';
import { getManagedEvent } from '@/lib/event';
import { PAGE_SIZE, pageFromParam } from '@/lib/search';
import { describeAudit } from '@/lib/audit';

const ENTITIES = [
  'check_ins',
  'perk_redemptions',
  'events',
  'ticket_types',
  'perks',
  'ticket_type_perks',
  'lineup_items',
  'event_content',
  'sponsor_activations',
  'staff_assignments',
  'staff_invites',
];

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ entity?: string; page?: string }>;
}) {
  const { eventId } = await params;
  const sp = await searchParams;
  const { supabase, event } = await getManagedEvent(eventId);
  const entity = ENTITIES.includes(sp.entity ?? '') ? sp.entity! : '';
  const page = pageFromParam(sp.page);
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .eq('event_id', eventId)
    .order('at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (entity) query = query.eq('entity', entity);
  const { data: rows, count } = await query;

  const actorIds = [...new Set((rows ?? []).map((r) => r.actor_id).filter((x): x is string => !!x))];
  const { data: actors } = actorIds.length
    ? await supabase.from('profiles').select('id, display_name, email').in('id', actorIds)
    : { data: [] as { id: string; display_name: string | null; email: string }[] };
  const who = (id: string | null) => {
    if (!id) return 'System (Luma sync)';
    const p = (actors ?? []).find((a) => a.id === id);
    return p ? (p.display_name ?? p.email) : 'Unknown user';
  };

  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const link = (p: number) => `?${new URLSearchParams({ ...(entity ? { entity } : {}), page: String(p) })}`;

  return (
    <Card title="Audit log" description="Every check-in, undo, perk adjustment and edit for this event.">
      <form className="mb-4 flex gap-2">
        <Select name="entity" defaultValue={entity} className="max-w-xs">
          <option value="">Everything</option>
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {e.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      <Table>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Who</Th>
            <Th>What</Th>
            <Th>Reason</Th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap">{formatInZone(r.at, event.timezone, { weekday: undefined })}</Td>
              <Td>{who(r.actor_id)}</Td>
              <Td>
                {describeAudit(r)}
                <details className="text-xs text-zinc-500">
                  <summary className="cursor-pointer">Details</summary>
                  <pre className="mt-1 max-w-xl overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify({ before: r.before, after: r.after }, null, 1)}
                  </pre>
                </details>
              </Td>
              <Td>{r.reason ?? ''}</Td>
            </tr>
          ))}
          {(rows ?? []).length === 0 ? (
            <tr>
              <Td colSpan={4} className="text-zinc-500">
                Nothing logged yet.
              </Td>
            </tr>
          ) : null}
        </tbody>
      </Table>
      <div className="mt-4 flex items-center justify-between text-sm text-zinc-600">
        <span>
          Page {page} of {pages}
        </span>
        <div className="flex gap-3">
          {page > 1 ? <Link href={link(page - 1)}>← Newer</Link> : null}
          {page < pages ? <Link href={link(page + 1)}>Older →</Link> : null}
        </div>
      </div>
    </Card>
  );
}
