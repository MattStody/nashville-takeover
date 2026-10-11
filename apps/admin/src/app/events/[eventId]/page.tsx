import { formatInZone, utcToLocalInput } from '@nt/shared';
import { ActionForm } from '@/components/action-form';
import { SyncButton } from '@/components/sync-button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Table, Td, Th } from '@/components/ui/table';
import { mediaUrl } from '@/lib/env';
import { getManagedEvent } from '@/lib/event';
import { syncStep, updateBranding, updateEventDetails } from './actions';

const runTone = { running: 'blue', succeeded: 'green', failed: 'red' } as const;

export default async function EventOverviewPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event, supabase } = await getManagedEvent(eventId);

  const [{ data: runs }, { count: guestCount }, { count: ticketCount }, { count: checkedIn }] = await Promise.all([
    supabase
      .from('luma_sync_runs')
      .select('id, trigger, status, started_at, finished_at, guests_upserted, tickets_upserted, error')
      .eq('event_id', eventId)
      .order('started_at', { ascending: false })
      .limit(10),
    supabase.from('guests').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'active'),
    supabase
      .from('ticket_check_in_status')
      .select('ticket_id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .not('check_in_id', 'is', null),
  ]);

  const tz = event.timezone;
  const hero = mediaUrl(event.hero_image_path);
  const logo = mediaUrl(event.logo_path);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card title="Details" description={`Times are in the event's timezone (${tz}).`}>
          <ActionForm action={updateEventDetails.bind(null, eventId)} submitLabel="Save details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <Input name="name" defaultValue={event.name} required />
              </Field>
              <Field label="Slug" hint="Used in links. Lowercase and dashes.">
                <Input name="slug" defaultValue={event.slug} required />
              </Field>
              <Field label="Starts">
                <Input type="datetime-local" name="starts_at" defaultValue={utcToLocalInput(event.starts_at, tz)} required />
              </Field>
              <Field label="Ends">
                <Input type="datetime-local" name="ends_at" defaultValue={utcToLocalInput(event.ends_at, tz)} required />
              </Field>
              <Field label="Timezone" hint="IANA name, e.g. America/Chicago">
                <Input name="timezone" defaultValue={tz} required />
              </Field>
              <Field label="Status" hint="Guests only see published events in the app.">
                <Select name="status" defaultValue={event.status}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </Select>
              </Field>
              <Field label="Venue">
                <Input name="venue_name" defaultValue={event.venue_name ?? ''} />
              </Field>
              <Field label="Venue address">
                <Input name="venue_address" defaultValue={event.venue_address ?? ''} />
              </Field>
            </div>
            <Field label="Description">
              <Textarea name="description" rows={5} defaultValue={event.description ?? ''} />
            </Field>
          </ActionForm>
        </Card>

        <Card title="Branding" description="Colours and images used by the guest app.">
          <ActionForm action={updateBranding.bind(null, eventId)} submitLabel="Save branding">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Primary colour" hint="Hex, e.g. #b3202a">
                <Input name="primary_color" defaultValue={event.primary_color ?? ''} placeholder="#b3202a" />
              </Field>
              <Field label="Accent colour">
                <Input name="accent_color" defaultValue={event.accent_color ?? ''} placeholder="#f5c518" />
              </Field>
              <ImageField label="Hero image" name="hero" url={hero} />
              <ImageField label="Logo" name="logo" url={logo} />
            </div>
          </ActionForm>
        </Card>
      </div>

      <div className="space-y-6">
        <Card title="At a glance">
          <dl className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Guests" value={guestCount ?? 0} />
            <Stat label="Active tickets" value={ticketCount ?? 0} />
            <Stat label="Checked in" value={checkedIn ?? 0} />
          </dl>
        </Card>

        <Card
          title="Luma sync"
          description="Imports guests and tickets from Luma. Read-only: nothing is sent to guests. Also runs hourly near the event and on Luma webhooks."
        >
          {event.luma_event_id ? (
            <SyncButton step={syncStep.bind(null, eventId)} />
          ) : (
            <p className="text-sm text-zinc-600">This event is not linked to Luma.</p>
          )}
          <Table className="mt-4">
            <thead>
              <tr>
                <Th>Started</Th>
                <Th>Status</Th>
                <Th className="text-right">Guests</Th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((r) => (
                <tr key={r.id}>
                  <Td>
                    {formatInZone(r.started_at, tz, { weekday: undefined, timeZoneName: undefined })}
                    <span className="block text-xs text-zinc-500">{r.trigger}</span>
                  </Td>
                  <Td>
                    <Badge tone={runTone[r.status]}>{r.status}</Badge>
                    {r.error ? <span className="block text-xs text-red-700">{r.error}</span> : null}
                  </Td>
                  <Td className="text-right">{r.guests_upserted}</Td>
                </tr>
              ))}
              {(runs ?? []).length === 0 ? (
                <tr>
                  <Td colSpan={3} className="text-zinc-500">
                    No syncs yet.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="text-2xl font-bold">{value.toLocaleString()}</dd>
      <dt className="text-xs text-zinc-500">{label}</dt>
    </div>
  );
}

function ImageField({ label, name, url }: { label: string; name: string; url: string | null }) {
  return (
    <div className="space-y-2">
      <Field label={label} hint="JPEG, PNG, WebP, GIF or SVG, up to 5 MB.">
        <Input type="file" name={name} accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml" />
      </Field>
      {url ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-16 w-auto rounded border border-zinc-200 object-contain" />
          <label className="flex items-center gap-1 text-sm text-zinc-600">
            <input type="checkbox" name={`remove_${name}`} /> Remove
          </label>
        </div>
      ) : null}
    </div>
  );
}
