import type { ReactNode } from 'react';
import { formatInZone, utcToLocalInput, type Tables } from '@nt/shared';
import { ActionForm } from '@/components/action-form';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { mediaUrl } from '@/lib/env';
import { getManagedEvent } from '@/lib/event';
import { deleteContentItem, saveContent, saveLineupItem, saveSponsor } from './actions';

type Action = Parameters<typeof ActionForm>[0]['action'];

export default async function ContentPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { supabase, event } = await getManagedEvent(eventId);
  const tz = event.timezone;
  const [{ data: lineup }, { data: content }, { data: sponsors }] = await Promise.all([
    supabase.from('lineup_items').select('*').eq('event_id', eventId).order('starts_at'),
    supabase.from('event_content').select('*').eq('event_id', eventId).order('kind').order('sort_order'),
    supabase.from('sponsor_activations').select('*').eq('event_id', eventId).order('sort_order'),
  ]);

  const saveSet = saveLineupItem.bind(null, eventId);
  const saveInfo = saveContent.bind(null, eventId);
  const saveSpon = saveSponsor.bind(null, eventId);
  const kindLabel = { faq: 'FAQ', info: 'Info', map: 'Map' } as const;

  return (
    <div className="space-y-6">
      <Card title="Lineup" description={`Sets by stage. Times are in ${tz}.`}>
        <ItemList>
          {(lineup ?? []).map((item) => (
            <Item
              key={item.id}
              summary={`${formatInZone(item.starts_at, tz, { weekday: 'short', timeZoneName: undefined })} · ${item.stage} · ${item.artist}`}
              onDelete={deleteContentItem.bind(null, eventId, 'lineup', item.id)}
            >
              <LineupForm action={saveSet} item={item} tz={tz} />
            </Item>
          ))}
        </ItemList>
        <AddBlock title="Add a set">
          <LineupForm action={saveSet} tz={tz} />
        </AddBlock>
      </Card>

      <Card title="FAQs, info and maps" description="Shown in the guest app's Info tab. Maps are an image with an optional caption.">
        <ItemList>
          {(content ?? []).map((item) => (
            <Item
              key={item.id}
              summary={`${kindLabel[item.kind]} · ${item.title}`}
              onDelete={deleteContentItem.bind(null, eventId, 'content', item.id)}
            >
              <ContentForm action={saveInfo} item={item} />
            </Item>
          ))}
        </ItemList>
        <AddBlock title="Add an FAQ, info page or map">
          <ContentForm action={saveInfo} />
        </AddBlock>
      </Card>

      <Card title="Sponsors" description="Sponsor activations shown in the guest app.">
        <ItemList>
          {(sponsors ?? []).map((item) => (
            <Item
              key={item.id}
              summary={item.sponsor_name}
              onDelete={deleteContentItem.bind(null, eventId, 'sponsor', item.id)}
            >
              <SponsorForm action={saveSpon} item={item} />
            </Item>
          ))}
        </ItemList>
        <AddBlock title="Add a sponsor">
          <SponsorForm action={saveSpon} />
        </AddBlock>
      </Card>
    </div>
  );
}

function ItemList({ children }: { children: ReactNode }) {
  return <ul className="mb-4 divide-y divide-zinc-100 rounded-md border border-zinc-200">{children}</ul>;
}

function Item({ summary, onDelete, children }: { summary: string; onDelete: Action; children: ReactNode }) {
  return (
    <li>
      <details className="group">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm hover:bg-zinc-50">
          <span className="mr-2 inline-block text-zinc-400 transition-transform group-open:rotate-90">›</span>
          {summary}
        </summary>
        <div className="space-y-2 border-t border-zinc-100 px-4 py-4">
          {children}
          <div className="flex justify-end">
            <ActionForm action={onDelete} submitLabel="Delete" submitVariant="ghost" confirm="Delete this item?" inline />
          </div>
        </div>
      </details>
    </li>
  );
}

function AddBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-md border border-dashed border-zinc-300 px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold">{title}</summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}

function ImageInput({ path, label = 'Image' }: { path: string | null | undefined; label?: string }) {
  const url = mediaUrl(path);
  return (
    <div className="space-y-2">
      <Field label={label} hint="JPEG, PNG, WebP, GIF or SVG, up to 5 MB.">
        <Input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml" />
      </Field>
      {url ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-14 w-auto rounded border border-zinc-200 object-contain" />
          <label className="flex items-center gap-1 text-sm text-zinc-600">
            <input type="checkbox" name="remove_image" /> Remove
          </label>
        </div>
      ) : null}
    </div>
  );
}

function LineupForm({ action, item, tz }: { action: Action; item?: Tables<'lineup_items'>; tz: string }) {
  return (
    <ActionForm action={action} submitLabel={item ? 'Save' : 'Add set'}>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Artist">
          <Input name="artist" defaultValue={item?.artist ?? ''} required />
        </Field>
        <Field label="Stage">
          <Input name="stage" defaultValue={item?.stage ?? ''} required />
        </Field>
        <Field label="Starts">
          <Input type="datetime-local" name="starts_at" defaultValue={item ? utcToLocalInput(item.starts_at, tz) : ''} required />
        </Field>
        <Field label="Ends">
          <Input type="datetime-local" name="ends_at" defaultValue={item ? utcToLocalInput(item.ends_at, tz) : ''} required />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea name="description" rows={2} defaultValue={item?.description ?? ''} />
        </Field>
        <ImageInput path={item?.image_path} />
      </div>
    </ActionForm>
  );
}

function ContentForm({ action, item }: { action: Action; item?: Tables<'event_content'> }) {
  return (
    <ActionForm action={action} submitLabel={item ? 'Save' : 'Add'}>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Type">
          <Select name="kind" defaultValue={item?.kind ?? 'faq'}>
            <option value="faq">FAQ</option>
            <option value="info">Info</option>
            <option value="map">Map</option>
          </Select>
        </Field>
        <Field label="Title / question" className="sm:col-span-2">
          <Input name="title" defaultValue={item?.title ?? ''} required />
        </Field>
        <Field label="Order">
          <Input type="number" name="sort_order" defaultValue={item?.sort_order ?? 0} />
        </Field>
        <Field label="Body / answer" className="sm:col-span-4">
          <Textarea name="body" rows={4} defaultValue={item?.body ?? ''} />
        </Field>
        <div className="sm:col-span-2">
          <ImageInput path={item?.image_path} />
        </div>
      </div>
    </ActionForm>
  );
}

function SponsorForm({ action, item }: { action: Action; item?: Tables<'sponsor_activations'> }) {
  return (
    <ActionForm action={action} submitLabel={item ? 'Save' : 'Add sponsor'}>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sponsor name">
          <Input name="sponsor_name" defaultValue={item?.sponsor_name ?? ''} required />
        </Field>
        <Field label="Where to find it" hint="e.g. Main floor, by the bar">
          <Input name="location" defaultValue={item?.location ?? ''} />
        </Field>
        <Field label="Link" hint="Optional https:// link">
          <Input type="url" name="cta_url" defaultValue={item?.cta_url ?? ''} />
        </Field>
        <Field label="Order">
          <Input type="number" name="sort_order" defaultValue={item?.sort_order ?? 0} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea name="description" rows={2} defaultValue={item?.description ?? ''} />
        </Field>
        <ImageInput path={item?.logo_path} label="Logo" />
      </div>
    </ActionForm>
  );
}
