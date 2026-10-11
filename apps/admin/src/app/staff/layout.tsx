import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app-header';
import { requireAdmin } from '@/lib/auth';

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const viewer = await requireAdmin();
  return (
    <>
      <AppHeader viewer={viewer} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
