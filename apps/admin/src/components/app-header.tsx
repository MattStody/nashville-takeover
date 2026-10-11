import Link from 'next/link';
import type { Viewer } from '@/lib/auth';

export function AppHeader({ viewer }: { viewer: Viewer }) {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/events" className="font-bold">
          Nashville Takeover
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link href="/events" className="text-zinc-700 hover:text-zinc-950">
            Events
          </Link>
          {viewer.isAdmin ? (
            <Link href="/staff" className="text-zinc-700 hover:text-zinc-950">
              Staff
            </Link>
          ) : null}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-zinc-600">
          <span className="hidden sm:inline">
            {viewer.displayName ?? viewer.email}
            {viewer.isAdmin ? ' · Admin' : ''}
          </span>
          <form action="/auth/signout" method="post">
            <button className="font-medium text-zinc-700 hover:text-zinc-950">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
