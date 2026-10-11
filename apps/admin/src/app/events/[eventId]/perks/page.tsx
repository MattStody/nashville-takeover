import { utcToLocalInput } from '@nt/shared';
import { ActionForm } from '@/components/action-form';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Table, Td, Th } from '@/components/ui/table';
import { getManagedEvent } from '@/lib/event';
import type { Tables } from '@nt/shared';
import { deletePerk, savePerk, saveTicketTypePerks } from './actions';

export default async function PerksPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { supabase, event } = await getManagedEvent(eventId);
  const [{ data: perks }, { data: types }, { data: mapping }] = await Promise.all([
    supabase.from('perks').select('*').eq('event_id', eventId).order('sort_order').order('name'),
    supabase.from('ticket_types').select('id, name, admits_entry').eq('event_id', eventId).order('sort_order').order('name'),
    supabase.from('ticket_type_perks').select('ticket_type_id, perk_id, quantity').eq('event_id', eventId),
  ]);
  const qty = new Map((mapping ?? []).map((m) => [`${m.ticket_type_id}:${m.perk_id}`, m.quantity]));
  const save = savePerk.bind(null, eventId);

  return (
    <div className="space-y-6">
      <Card title="Perks" description={`Things a ticket unlocks (drinks, lounge access, merch). Times are in ${event.timezone}.`}>
        <div className="space-y-4">
          {(perks ?? []).map((p) => (
            <div key={p.id} className="rounded-md border border-zinc-200 p-4">
              <PerkForm action={save} perk={p} timeZone={event.timezone} />
              <div className="mt-2 flex justify-end">
                <ActionForm
                  action={deletePerk.bind(null, eventId, p.id)}
                  submitLabel="Delete perk"
                  submitVariant="ghost"
                  confirm={`Delete “${p.name}”?`}
                  inline
                />
              </div>
            </div>
          ))}
          <div className="rounded-md border border-dashed border-zinc-300 p-4">
            <h3 className="mb-3 text-sm font-semibold">Add a perk</h3>
            <PerkForm action={save} timeZone={event.timezone} />
          </div>
        </div>
      </Card>

      <Card title="Perks by ticket type" description="How many of each perk a ticket of that type includes. 0 or blank = not included.">
        {(types ?? []).length === 0 || (perks ?? []).length === 0 ? (
          <p className="text-sm text-zinc-600">Add perks and sync ticket types first.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Ticket type</Th>
                {(perks ?? []).map((p) => (
                  <Th key={p.id} className="text-center">
                    {p.name}
                  </Th>
                ))}
                <Th />
              </tr>
            </thead>
            <tbody>
              {(types ?? []).map((t) => {
                const formId = `ttp-${t.id}`;
                return (
                  <tr key={t.id}>
                    <Td className="font-medium">
                      {t.name}
                      {!t.admits_entry ? <span className="block text-xs text-zinc-500">Add-on</span> : null}
                    </Td>
                    {(perks ?? []).map((p) => (
                      <Td key={p.id} className="text-center">
                        <Input
                          form={formId}
                          type="number"
                          min={0}
                          max={1000}
                          name={`qty:${p.id}`}
                          defaultValue={qty.get(`${t.id}:${p.id}`) ?? ''}
                          aria-label={`${p.name} for ${t.name}`}
                          className="mx-auto w-20 text-center"
                        />
                      </Td>
                    ))}
                    <Td>
                      <ActionForm
                        action={saveTicketTypePerks.bind(null, eventId, t.id)}
                        submitLabel="Save"
                        submitVariant="secondary"
                        inline
                        id={formId}
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function PerkForm({
  action,
  perk,
  timeZone,
}: {
  action: Parameters<typeof ActionForm>[0]['action'];
  perk?: Tables<'perks'>;
  timeZone: string;
}) {
  return (
    <ActionForm action={action} submitLabel={perk ? 'Save' : 'Add perk'} submitVariant={perk ? 'secondary' : 'primary'}>
      {perk ? <input type="hidden" name="id" value={perk.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Name" className="sm:col-span-2">
          <Input name="name" defaultValue={perk?.name ?? ''} required />
        </Field>
        <Field label="Icon" hint="Optional icon name">
          <Input name="icon" defaultValue={perk?.icon ?? ''} placeholder="beer" />
        </Field>
        <Field label="Order">
          <Input type="number" name="sort_order" defaultValue={perk?.sort_order ?? 0} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Input name="description" defaultValue={perk?.description ?? ''} />
        </Field>
        <Field label="Valid from" hint="Optional">
          <Input
            type="datetime-local"
            name="valid_from"
            defaultValue={perk?.valid_from ? utcToLocalInput(perk.valid_from, timeZone) : ''}
          />
        </Field>
        <Field label="Valid until" hint="Optional">
          <Input
            type="datetime-local"
            name="valid_until"
            defaultValue={perk?.valid_until ? utcToLocalInput(perk.valid_until, timeZone) : ''}
          />
        </Field>
      </div>
    </ActionForm>
  );
}
