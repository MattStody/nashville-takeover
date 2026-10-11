import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';

export type EventRole = 'admin' | 'manager' | 'staff';

export interface Viewer {
  userId: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  /** event id -> role, for events the viewer is assigned to. */
  assignments: Map<string, 'manager' | 'staff'>;
}

/** The signed-in user and their roles. Redirects to /login when signed out. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: assignments }] = await Promise.all([
    supabase.from('profiles').select('email, display_name, is_admin').eq('id', user.id).maybeSingle(),
    supabase.from('staff_assignments').select('event_id, role').eq('user_id', user.id),
  ]);

  return {
    userId: user.id,
    email: profile?.email ?? user.email ?? '',
    displayName: profile?.display_name ?? null,
    isAdmin: profile?.is_admin ?? false,
    assignments: new Map((assignments ?? []).map((a) => [a.event_id, a.role])),
  };
});

/** The dashboard is for managers and admins; staff use the mobile app. */
export async function requireDashboardAccess(): Promise<Viewer> {
  const viewer = await getViewer();
  const isManager = [...viewer.assignments.values()].includes('manager');
  if (!viewer.isAdmin && !isManager) redirect('/no-access');
  return viewer;
}

export function eventRole(viewer: Viewer, eventId: string): EventRole | null {
  if (viewer.isAdmin) return 'admin';
  return viewer.assignments.get(eventId) ?? null;
}

/** Manager or admin of this event, else 404 (don't reveal the event exists). */
export async function requireEventManager(eventId: string): Promise<Viewer> {
  const viewer = await requireDashboardAccess();
  const role = eventRole(viewer, eventId);
  if (role !== 'admin' && role !== 'manager') notFound();
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireDashboardAccess();
  if (!viewer.isAdmin) notFound();
  return viewer;
}
