import type { SupabaseClient } from '@supabase/supabase-js';
import type { BackfillProgress, LumaGuest, LumaTicketType, SyncStore } from './nt/index.ts';
import { HttpError } from './http.ts';

/** SyncStore backed by the service-role-only RPCs and luma_sync_runs. */
export class SupabaseSyncStore implements SyncStore {
  constructor(private readonly db: SupabaseClient) {}

  async upsertTicketTypes(eventId: string, types: LumaTicketType[]): Promise<void> {
    const { error } = await this.db.rpc('luma_upsert_ticket_types', { p_event_id: eventId, p_types: types });
    if (error) throw new HttpError(500, 'upsert_ticket_types_failed', error.message);
  }

  async upsertGuests(eventId: string, guests: LumaGuest[]): Promise<{ guests: number; tickets: number }> {
    const { data, error } = await this.db.rpc('luma_upsert_guests', { p_event_id: eventId, p_guests: guests });
    if (error) throw new HttpError(500, 'upsert_guests_failed', error.message);
    return data as { guests: number; tickets: number };
  }

  async saveProgress(p: BackfillProgress): Promise<void> {
    const { error } = await this.db
      .from('luma_sync_runs')
      .update({
        cursor: p.cursor,
        guests_upserted: p.guests,
        tickets_upserted: p.tickets,
        updated_at: new Date().toISOString(),
        ...(p.done ? { status: 'succeeded', finished_at: new Date().toISOString() } : {}),
      })
      .eq('id', p.runId);
    if (error) throw new HttpError(500, 'save_progress_failed', error.message);
  }
}
