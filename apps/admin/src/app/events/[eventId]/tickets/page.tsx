import { ActionForm } from '@/components/action-form';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { getManagedEvent } from '@/lib/event';
import { updateTicketType } from './actions';

export default async function TicketTypesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { supabase } = await getManagedEvent(eventId);
  const { data: types } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order')
    .order('name');
  // Head-only counts: the API caps row results at 1,000.
  const counts = new Map(
    await Promise.all(
      (types ?? []).map(async (t) => {
        const { count } = await supabase
          .from('tickets')
          .select('id', { count: 'exact', head: true })
          .eq('ticket_type_id', t.id)
          .eq('status', 'active');
        return [t.id, count ?? 0] as const;
      }),
    ),
  );

  const save = updateTicketType.bind(null, eventId);
  return (
    <Card
      title="Ticket types"
      description="Imported from Luma. Untick “Admits entry” for add-ons (e.g. After Party Upgrade): they still unlock perks but can't be checked in."
    >
      {(types ?? []).length === 0 ? (
        <p className="text-sm text-zinc-600">No ticket types yet. Run a sync from the Overview tab.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {(types ?? []).map((t) => (
            <li key={t.id} className="py-3">
              <ActionForm action={save} submitLabel="Save" submitVariant="secondary" inline>
                <input type="hidden" name="id" value={t.id} />
                <div className="min-w-56 flex-1">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-zinc-500">
                    {(counts.get(t.id) ?? 0).toLocaleString()} active tickets · {t.luma_ticket_type_id}
                  </p>
                </div>
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="admits_entry" defaultChecked={t.admits_entry} /> Admits entry
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="is_hidden" defaultChecked={t.is_hidden} /> Hidden
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  Order
                  <Input type="number" name="sort_order" defaultValue={t.sort_order} className="w-20" />
                </label>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
