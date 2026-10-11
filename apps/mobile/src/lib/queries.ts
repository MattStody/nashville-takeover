import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Tables } from '@nt/shared';
import { useAuth } from './auth';
import { supabase } from './supabase';

type EventRow = Tables<'events'>;

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

/** Events the guest holds tickets for, plus published events anyone can browse. */
export function useEvents() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['events', userId],
    enabled: !!userId,
    queryFn: async () => {
      // Pick up any guest records synced since sign-in (matched by email).
      await supabase.rpc('link_my_guests');
      const guests = await unwrap(supabase.from('guests').select('event_id').eq('user_id', userId!));
      const mineIds = new Set(guests.map((g) => g.event_id));
      const events = await unwrap(supabase.from('events').select('*').order('starts_at'));
      return {
        mine: events.filter((e) => mineIds.has(e.id)),
        others: events.filter((e) => !mineIds.has(e.id) && e.status === 'published'),
      };
    },
  });
}

export interface MyTicket {
  event: EventRow;
  guests: Pick<Tables<'guests'>, 'id' | 'name' | 'guest_key' | 'approval_status'>[];
  tickets: {
    id: string;
    status: string;
    typeName: string;
    admitsEntry: boolean;
    checkedInAt: string | null;
  }[];
  perkRows: Tables<'ticket_perk_balances'>[];
}

export function useMyTicket(event: EventRow | null) {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['ticket', event?.id, userId],
    enabled: !!event && !!userId,
    queryFn: async (): Promise<MyTicket> => {
      const guests = await unwrap(
        supabase
          .from('guests')
          .select('id, name, guest_key, approval_status')
          .eq('event_id', event!.id)
          .eq('user_id', userId!),
      );
      const guestIds = guests.map((g) => g.id);
      if (guestIds.length === 0) return { event: event!, guests, tickets: [], perkRows: [] };

      const tickets = await unwrap(
        supabase.from('tickets').select('id, status, ticket_type_id').in('guest_id', guestIds).order('created_at'),
      );
      const ticketIds = tickets.map((t) => t.id);
      const [types, statuses, perkRows] = await Promise.all([
        unwrap(supabase.from('ticket_types').select('id, name, admits_entry').eq('event_id', event!.id)),
        ticketIds.length
          ? unwrap(supabase.from('ticket_check_in_status').select('ticket_id, checked_in_at').in('ticket_id', ticketIds))
          : Promise.resolve([]),
        ticketIds.length
          ? unwrap(supabase.from('ticket_perk_balances').select('*').in('ticket_id', ticketIds))
          : Promise.resolve([]),
      ]);
      const typeById = new Map(types.map((t) => [t.id, t]));
      const checkedIn = new Map(statuses.map((s) => [s.ticket_id, s.checked_in_at]));
      return {
        event: event!,
        guests,
        tickets: tickets.map((t) => ({
          id: t.id,
          status: t.status,
          typeName: typeById.get(t.ticket_type_id)?.name ?? 'Ticket',
          admitsEntry: typeById.get(t.ticket_type_id)?.admits_entry ?? true,
          checkedInAt: checkedIn.get(t.id) ?? null,
        })),
        // Perks only count on tickets that are still valid.
        perkRows: perkRows.filter((r) => tickets.find((t) => t.id === r.ticket_id)?.status === 'active'),
      };
    },
  });
}

export function useLineup(eventId: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['lineup', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const [items, favs] = await Promise.all([
        unwrap(supabase.from('lineup_items').select('*').eq('event_id', eventId!).order('starts_at')),
        unwrap(supabase.from('lineup_favorites').select('lineup_item_id').eq('user_id', session!.user.id)),
      ]);
      return { items, favorites: new Set(favs.map((f) => f.lineup_item_id)) };
    },
  });
}

export function useToggleFavorite(eventId: string | undefined) {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ itemId, on }: { itemId: string; on: boolean }) => {
      const userId = session!.user.id;
      const { error } = on
        ? await supabase.from('lineup_favorites').upsert({ user_id: userId, lineup_item_id: itemId })
        : await supabase.from('lineup_favorites').delete().eq('user_id', userId).eq('lineup_item_id', itemId);
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['lineup', eventId] }),
  });
}

export function useContent(eventId: string | undefined) {
  return useQuery({
    queryKey: ['content', eventId],
    enabled: !!eventId,
    queryFn: () =>
      unwrap(supabase.from('event_content').select('*').eq('event_id', eventId!).order('sort_order').order('title')),
  });
}

export function useSponsors(eventId: string | undefined) {
  return useQuery({
    queryKey: ['sponsors', eventId],
    enabled: !!eventId,
    queryFn: () =>
      unwrap(supabase.from('sponsor_activations').select('*').eq('event_id', eventId!).order('sort_order')),
  });
}

export async function logSponsorView(sponsorId: string, userId: string) {
  await supabase.from('sponsor_views').insert({ sponsor_activation_id: sponsorId, user_id: userId });
}

export function useUpdates(eventId: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['updates', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      // RLS only returns notifications already sent to this guest's audience.
      const [items, reads] = await Promise.all([
        unwrap(
          supabase
            .from('notifications')
            .select('id, title, body, sent_at')
            .eq('event_id', eventId!)
            .not('sent_at', 'is', null)
            .order('sent_at', { ascending: false }),
        ),
        unwrap(supabase.from('notification_reads').select('notification_id').eq('user_id', session!.user.id)),
      ]);
      const read = new Set(reads.map((r) => r.notification_id));
      return items.map((n) => ({ ...n, read: read.has(n.id) }));
    },
  });
}

export async function markRead(ids: string[], userId: string) {
  if (ids.length === 0) return;
  await supabase
    .from('notification_reads')
    .upsert(ids.map((id) => ({ notification_id: id, user_id: userId })), { ignoreDuplicates: true });
}
