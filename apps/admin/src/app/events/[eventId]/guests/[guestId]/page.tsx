import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatInZone } from '@nt/shared';
import { ActionForm } from '@/components/action-form';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Table, Td, Th } from '@/components/ui/table';
import { getManagedEvent } from '@/lib/event';
import { adjustPerk, checkInTicket, undoCheckIn } from './actions';

export default async function GuestPage({ params }: { params: Promise<{ eventId: string; guestId: string }> }) {
  const { eventId, guestId } = await params;
  const { supabase, event } = await getManagedEvent(eventId);
  const tz = event.timezone;
  const when = (iso: string) => formatInZone(iso, tz, { weekday: undefined });

  const { data: guest } = await supabase.from('guests').select('*').eq('id', guestId).eq('event_id', eventId).maybeSingle();
  if (!guest) notFound();

  const { data: tickets } = await supabase
    .from('tickets')
    .select('id, ticket_type_id, status, luma_ticket_id')
    .eq('guest_id', guestId)
    .order('created_at');
  const ticketIds = (tickets ?? []).map((t) => t.id);
  const none = { data: [] as never[] };
  const [{ data: types }, { data: statuses }, { data: checkIns }, { data: balances }, { data: ledger }, { data: perks }] =
    await Promise.all([
      supabase.from('ticket_types').select('id, name, admits_entry').eq('event_id', eventId),
      ticketIds.length ? supabase.from('ticket_check_in_status').select('*').in('ticket_id', ticketIds) : none,
      ticketIds.length
        ? supabase.from('check_ins').select('*').in('ticket_id', ticketIds).order('scanned_at', { ascending: false })
        : none,
      ticketIds.length ? supabase.from('ticket_perk_balances').select('*').in('ticket_id', ticketIds) : none,
      ticketIds.length
        ? supabase.from('perk_redemption_ledger').select('*').in('ticket_id', ticketIds).order('scanned_at', { ascending: false })
        : none,
      supabase.from('perks').select('id, name').eq('event_id', eventId).order('sort_order'),
    ]);

  const staffIds = [...new Set([...(checkIns ?? []).flatMap((c) => [c.staff_user_id, c.undone_by]), ...(ledger ?? []).map((l) => l.staff_user_id)])]
    .filter((id): id is string => !!id);
  const { data: staff } = staffIds.length
    ? await supabase.from('profiles').select('id, display_name, email').in('id', staffIds)
    : { data: [] as { id: string; display_name: string | null; email: string }[] };
  const who = (id: string | null) => {
    const p = (staff ?? []).find((s) => s.id === id);
    return p ? (p.display_name ?? p.email) : 'Unknown';
  };

  const typeById = new Map((types ?? []).map((t) => [t.id, t]));
  const statusByTicket = new Map((statuses ?? []).map((s) => [s.ticket_id, s]));
  const perkName = new Map((perks ?? []).map((p) => [p.id, p.name]));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/events/${eventId}/guests`} className="text-sm text-zinc-500 hover:text-zinc-800">
          ← Guests
        </Link>
        <h2 className="mt-1 text-xl font-bold">{guest.name || '(no name)'}</h2>
        <p className="text-sm text-zinc-600">
          {guest.email} · Luma status: {guest.approval_status}
          {guest.user_id ? ' · Has app account' : ''}
        </p>
      </div>

      {(tickets ?? []).map((t, i) => {
        const type = typeById.get(t.ticket_type_id);
        const status = statusByTicket.get(t.id);
        const ticketBalances = (balances ?? []).filter((b) => b.ticket_id === t.id);
        const history = (checkIns ?? []).filter((c) => c.ticket_id === t.id);
        const active = t.status === 'active';
        return (
          <Card
            key={t.id}
            title={`Ticket ${i + 1}: ${type?.name ?? 'Unknown type'}`}
            description={t.luma_ticket_id}
            actions={
              <div className="flex gap-2">
                {!active ? <Badge tone="red">Cancelled in Luma</Badge> : null}
                {type && !type.admits_entry ? <Badge>Add-on (no entry)</Badge> : null}
                {status?.check_in_id ? <Badge tone="green">Checked in</Badge> : null}
              </div>
            }
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Entry</h3>
                {type?.admits_entry === false ? (
                  <p className="text-sm text-zinc-600">This ticket type doesn&apos;t admit entry.</p>
                ) : status?.check_in_id ? (
                  <>
                    <p className="text-sm">
                      Checked in {when(status.checked_in_at!)} by {who(status.checked_in_by)} ({status.checked_in_source})
                      {(status.scan_count ?? 0) > 1 ? ` · ${status.scan_count} scans` : ''}
                    </p>
                    <ActionForm
                      action={undoCheckIn.bind(null, eventId, guestId)}
                      submitLabel="Undo check-in"
                      submitVariant="danger"
                      inline
                    >
                      <input type="hidden" name="check_in_id" value={status.check_in_id} />
                      <Input name="reason" required minLength={3} placeholder="Reason (required)" className="max-w-xs" />
                    </ActionForm>
                  </>
                ) : (
                  <ActionForm
                    action={checkInTicket.bind(null, eventId, guestId, t.id)}
                    submitLabel="Check in manually"
                    confirm={`Check in ${guest.name || guest.email}?`}
                    inline
                  />
                )}
                {history.length > 0 ? (
                  <ul className="space-y-1 text-xs text-zinc-600">
                    {history.map((c) => (
                      <li key={c.id} className={c.undone_at ? 'line-through decoration-zinc-400' : undefined}>
                        {when(c.scanned_at)} · {c.source} · {who(c.staff_user_id)}
                        {c.undone_at ? (
                          <span className="ml-1 no-underline">
                            (undone by {who(c.undone_by)}: {c.undo_reason})
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Perks</h3>
                {ticketBalances.length === 0 ? (
                  <p className="text-sm text-zinc-600">No perks for this ticket type.</p>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Perk</Th>
                        <Th className="text-right">Included</Th>
                        <Th className="text-right">Used</Th>
                        <Th className="text-right">Left</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {ticketBalances.map((b) => (
                        <tr key={b.perk_id}>
                          <Td>{b.perk_name}</Td>
                          <Td className="text-right">{b.allowance}</Td>
                          <Td className="text-right">{b.used}</Td>
                          <Td className={(b.remaining ?? 0) < 0 ? 'text-right font-semibold text-red-700' : 'text-right'}>
                            {b.remaining}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
                {(perks ?? []).length > 0 ? (
                  <details className="rounded-md border border-zinc-200 px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium">Adjust a perk balance</summary>
                    <ActionForm action={adjustPerk.bind(null, eventId, guestId)} submitLabel="Apply adjustment" className="pt-3">
                      <input type="hidden" name="ticket_id" value={t.id} />
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Perk">
                          <Select name="perk_id" required>
                            {(perks ?? []).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Change">
                          <Select name="direction" defaultValue="return">
                            <option value="return">Give back</option>
                            <option value="use">Mark used</option>
                          </Select>
                        </Field>
                        <Field label="Quantity">
                          <Input type="number" name="quantity" min={1} max={100} defaultValue={1} required />
                        </Field>
                      </div>
                      <Field label="Reason" hint="Required. Saved to the audit log.">
                        <Input name="reason" required minLength={3} />
                      </Field>
                    </ActionForm>
                  </details>
                ) : null}
              </section>
            </div>

            <RedemptionHistory rows={(ledger ?? []).filter((l) => l.ticket_id === t.id)} perkName={perkName} who={who} when={when} />
          </Card>
        );
      })}
      {(tickets ?? []).length === 0 ? <p className="text-sm text-zinc-600">This guest has no tickets.</p> : null}
    </div>
  );
}

function RedemptionHistory({
  rows,
  perkName,
  who,
  when,
}: {
  rows: { id: string | null; perk_id: string | null; kind: string | null; quantity: number | null; scanned_at: string | null; staff_user_id: string | null; reason: string | null; over_limit: boolean | null; source: string | null }[];
  perkName: Map<string, string>;
  who: (id: string | null) => string;
  when: (iso: string) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm font-medium">Perk history ({rows.length})</summary>
      <ul className="mt-2 space-y-1 text-xs text-zinc-600">
        {rows.map((r) => (
          <li key={r.id}>
            {r.scanned_at ? when(r.scanned_at) : ''} · {perkName.get(r.perk_id ?? '') ?? 'Perk'} ·{' '}
            {r.kind === 'adjust' ? 'adjusted' : 'redeemed'} {r.quantity} · {who(r.staff_user_id)} ({r.source})
            {r.reason ? ` · “${r.reason}”` : ''}
            {r.over_limit ? (
              <span className="ml-1">
                <Badge tone="red">over limit (offline)</Badge>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
