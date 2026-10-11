import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app-header';
import { requireDashboardAccess } from '@/lib/auth';

export default async function EventsLayout({ children }: { children: ReactNode }) {
  const viewer = await requireDashboardAccess();
  return (
    <>
      <AppHeader viewer={viewer} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
