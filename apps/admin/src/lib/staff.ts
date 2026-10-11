import { uuid } from './schemas';

/** Invite form value: "admin" or "<eventId>:<staff|manager>". */
export function parseAccess(access: string): { make_admin: true } | { make_admin: false; event_id: string; role: 'staff' | 'manager' } | null {
  if (access === 'admin') return { make_admin: true };
  const [eventId, role] = access.split(':');
  if (!uuid.safeParse(eventId).success || (role !== 'staff' && role !== 'manager')) return null;
  return { make_admin: false, event_id: eventId!, role };
}
